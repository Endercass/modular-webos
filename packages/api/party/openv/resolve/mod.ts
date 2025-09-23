import type { API, OpEnv, RegistryValue } from "../../../../openv/mod";
import type FsApi from "../fs/mod";
import type ProcessesApi from "../processes/mod";
import type ServiceApi from "../service/mod";

type ApiConstructor = new (...args: any[]) => API;

export interface AutoInitializableAPIConstructor extends ApiConstructor {
  "party.openv.resolve.autoInstall"?: string | ((openv: OpEnv) => Promise<API>);
}


export interface Resolver {
  initialize?(openv: OpEnv): Promise<void>;

  /**
   * Resolves an abstract path to a local filesystem path. This method should handle things like module resolution, HTTP(S) imports, and other path abstractions.
   *
   * Ideas for implementations:
   * - fs: resolve to local filesystem path
   * - http(s): download file to temp directory and return path
   * - sys: auto-locate system-wide libraries
   * - transpile: namespace to prefix another resolver and transpile the file (e.g. "transpile:fs:/path/to/file.ts" -> "/tmp/abcd1234.js")
   *
   * @param path The path to resolve. This includes the namespace of the resolver (i.e. "fs" for "fs:/path/to/file")
   * @returns The resolved absolute path, or null if the path could not be resolved
   */
  resolve(path: string, cwd: string): Promise<string | null>;
}

export class FsResolver implements Resolver {
  openv: OpEnv;

  async initialize(openv: OpEnv): Promise<void> {
    this.openv = openv;
  }

  async resolve(path: string, cwd?: string): Promise<string | null> {
    if (path.startsWith("fs:")) {
      path = path.slice(3);
    }
    const fs = await getOrInstallAPI<FsApi>(this.openv, "party.openv.fs");
    return await fs.resolve(path, cwd);
  }
}

export class ApiResolver implements Resolver {
  openv: OpEnv;

  fs: FsApi;
  resolveApi: ResolveApi;

  apiDir = "/etc/party.openv.resolve/api";

  async initialize(openv: OpEnv): Promise<void> {
    this.openv = openv;

    this.fs = await getOrInstallAPI<FsApi>(this.openv, "party.openv.fs");
    this.resolveApi = await getOrInstallAPI<ResolveApi>(this.openv, "party.openv.resolve");
    try {
      await this.fs.makeDir(this.apiDir, true);
    } catch (err) {
      console.error(`Failed to create API cache directory at ${this.apiDir}:`, err);
      throw err;
    }

    openv.handleAPIString(async (apiString: string) => {
      const localPath = await this.resolve(`api:${apiString}`);
      if (!localPath) {
        throw new Error(`Could not resolve API: ${apiString}`);
      }
      const module = await this.resolveApi.import(localPath);
      console.log("GOT MODULE:", module)
      if (!module || typeof module !== "object" || typeof module.default !== "function") {
        throw new Error(`Invalid API module: ${apiString}`);
      }

      console.log(`Resolved API "${apiString}" to`, localPath);
      const ApiConstructor = module.default as AutoInitializableAPIConstructor;

      if (typeof ApiConstructor["party.openv.resolve.autoInstall"] === "function") {
        const api = await ApiConstructor["party.openv.resolve.autoInstall"](this.openv);
        this.openv.installAPI(api);
        return api;
      } else if (typeof ApiConstructor["party.openv.resolve.autoInstall"] === "string") {
        const expectedName = ApiConstructor["party.openv.resolve.autoInstall"];
        const api = new ApiConstructor();
        if (api.name !== expectedName) {
          throw new Error(`API module name mismatch: expected "${expectedName}", got "${api.name}"`);
        }
        this.openv.installAPI(api);
        return api;
      }
      throw new Error(`API module does not support automatic installation: ${apiString}`);
    });
  }

  async resolve(path: string, _cwd?: string, options: {
    repos?: string[];
    version?: string;
  } = {}): Promise<string | null> {
    if (!options.repos) {
      options.repos = await this.openv.registry.read("party.openv.repos");
      if (!Array.isArray(options.repos)) {
        console.warn(`No valid repos found in registry for party.openv.repos, defaulting to empty list.`);
        options.repos = [];
      }
    }
    options.version ||= "latest";

    if (path.startsWith("api:")) {
      const apiString = path.slice(4);
      try {
        const filename = await this.fs.resolve(`${apiString}.${options.version}.js`, this.apiDir);
        if (!filename) throw new Error("Not found");
        return filename;
      } catch { }

      try {
        const apiBlob = await Promise.any(options.repos.map(async (repo) => {
          const res = await fetch(`${repo.replace(/\/+$/, "")}/${apiString.replace(/\./g, "/")}/${options.version}/bundle.js`);
          if (!res.ok) {
            throw new Error(`Failed to fetch API from ${repo}: ${res.status} ${res.statusText}`);
          }
          return await res.blob();
        }));

        console.log(`Fetched API "${apiString}" from remote repo, caching to local fs...`);

        await this.fs.writeFile(`${this.apiDir}/${apiString}.${options.version}.js`, apiBlob);

        console.log(`Cached API "${apiString}" to local fs at ${this.apiDir}/${apiString}.${options.version}.js`);
        console.log(`dir listing:`, await this.fs.readDir(this.apiDir));

        return await this.fs.resolve(`${apiString}.${options.version}.js`, this.apiDir);
      } catch (err) {
        console.error(`Failed to resolve API "${apiString}": ${err.message}`);
      }
    }
    return null;
  }
}

async function getOrInstallAPI<T extends API>(openv: OpEnv, name: string): Promise<T> {
  let api: API;
  try {
    api = openv.getAPI(name);
  } catch {
    // Try to install the API
    await openv.installAPI(name);
    api = openv.getAPI(name);
  }
  return api as T;
}

export default class ResolveApi implements API, Resolver {
  static "party.openv.resolve.autoInstall" = "party.openv.resolve";
  name = "party.openv.resolve";

  openv: OpEnv;
  async initialize(openv: OpEnv): Promise<void> {
    this.openv = openv;
  }

  async register(namespace: string, resolver: Resolver) {
    console.log(`Registering resolver for namespace "${namespace}"`);
    console.log("Resolver:", resolver);
    await resolver.initialize?.(this.openv);

    console.log(`Resolver for namespace "${namespace}" initialized`);

    const services = await getOrInstallAPI<ServiceApi>(this.openv, "party.openv.service");
    services.defineFunction(
      "resolve",
      resolver.resolve.bind(resolver),
      namespace,
      {
        root: this.name + ".resolver",
      },
    );
  }

  async unregister(namespace: string) {
    const services = await getOrInstallAPI<ServiceApi>(this.openv, "party.openv.service");
    services.undefineFunction("resolve", namespace, {
      root: this.name + ".resolver",
    });
  }

  async resolve(path: string, cwd?: string): Promise<string | null> {
    if (!cwd) {
      const processes = await getOrInstallAPI<ProcessesApi>(this.openv, "party.openv.processes");
      // Try to get CWD. This will only work if called inside a process (global env.PID is set)
      try {
        cwd = await processes.getCwd();
      } catch {
        console.warn("Tried to run getCwd from ProcessesApi outside of a process, defaulting to /");
        cwd = "/";
      }
    }
    const services = await getOrInstallAPI<ServiceApi>(this.openv, "party.openv.service");

    if (!path.includes(":")) {
      // No namespace, assume fs
      path = "fs:" + path;
    }

    const ns = path.split(":")[0];
    let res: RegistryValue = null;
    try {
      res = await services.callFunction("resolve", [path, cwd], ns, {
        root: this.name + ".resolver",
      });
    } catch (err) {
      console.error(`Error calling resolver for namespace "${ns}":`, err);
      return null;
    }
    if (typeof res !== "string" && res !== null) {
      console.trace("Invalid return value from resolve api:", res);
      res = null;
    }
    return res;
  }

  async import(path: string, cwd?: string): Promise<any> {
    const resolvedPath = await this.resolve(path, cwd);
    if (!resolvedPath) {
      throw new Error(`Could not resolve path: ${path}`);
    }

    let url: string;

    const fs = await getOrInstallAPI<FsApi>(this.openv, "party.openv.fs");

    const data = await fs.readFile(resolvedPath);

    if (typeof process !== "undefined" && process.versions && process.versions.node) {
      const buf = Buffer.from(await data.arrayBuffer());
      url = "data:application/javascript;base64," + buf.toString("base64");
    } else {
      url = URL.createObjectURL(new Blob([data], { type: "application/javascript" }));
    }

    return import(url);
  }
}
