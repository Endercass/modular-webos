import type { API, OpEnv } from "../../../../openv/mod";
import type { ProcessesApi } from "../processes/mod";
import type { ServiceApi } from "../service/mod";

export interface FsStats {
  type: "DIRECTORY" | "FILE";
  size: number;
  atime: number;
  mtime: number;
  ctime: number;
  name: string;
  uid: number;
  gid: number;
  mode: number;
  dev: string;
}

export interface FsImpl {
  initialize?(openv: OpEnv, namespace: string): Promise<void>;

  readFile(path: string): Promise<Blob>;
  writeFile(path: string, data: Blob | string): Promise<void>;
  unlink(path: string): Promise<void>;

  readDir(path: string): Promise<string[]>;
  makeDir(path: string, recursive?: boolean): Promise<void>;
  rmDir(path: string): Promise<void>;

  symlink(target: string, path: string): Promise<void>;
  readlink(path: string): Promise<string>;

  rename(oldPath: string, newPath: string): Promise<void>;
  chown(path: string, uid: number, gid?: number): Promise<void>;
  chmod(path: string, mode: number): Promise<void>;
  stat(path: string): Promise<FsStats>;
}

export class FsApi implements API, FsImpl {
  name = "party.openv.fs";

  openv: OpEnv;

  async populate(openv: OpEnv) {
    this.openv = openv;
  }

  async register(namespace: string, impl: FsImpl) {
    const services = this.openv.getAPI<ServiceApi>("party.openv.service");

    if (impl.initialize) {
      await impl.initialize(this.openv, namespace);
    }

    services.defineFunction(
      "readFile",
      impl.readFile.bind(impl) as any,
      namespace,
      { root: this.name + ".impl" },
    );
    services.defineFunction(
      "readDir",
      impl.readDir.bind(impl) as any,
      namespace,
      { root: this.name + ".impl" },
    );
    services.defineFunction(
      "writeFile",
      impl.writeFile.bind(impl) as any,
      namespace,
      { root: this.name + ".impl" },
    );
    services.defineFunction(
      "makeDir",
      impl.makeDir.bind(impl) as any,
      namespace,
      { root: this.name + ".impl" },
    );
    services.defineFunction("stat", impl.stat.bind(impl) as any, namespace, {
      root: this.name + ".impl",
    });
  }

  async mount(path: string, namespace: string) {
    let tab: Record<string, string> = {};
    try {
      tab = await this.openv.registry.read(this.name + ".fstab");
    } catch {}

    tab[path] = namespace;

    await this.openv.registry.write(this.name + ".fstab", tab);
  }

  async #relToAbs(path: string): Promise<string> {
    if (path.startsWith("/")) return path;
    if (path.startsWith("./")) path = path.slice(2);

    const processes = this.openv.getAPI<ProcessesApi>("party.openv.processes");
    return (await processes.getCwd()) + "/" + path;
  }

  async #processPath(path: string): Promise<[string, string]> {
    path = await this.#relToAbs(path);

    const tab = await this.openv.registry.read(this.name + ".fstab");

    if (path in tab) return [tab[path], "/"];

    const best = Object.keys(tab)
      .sort()
      .reverse()
      .find((prefix) => path.startsWith(prefix));
    return [tab[best || "/"], "/" + path.slice((best || "/").length)];
  }

  async readFile(path: string): Promise<Blob> {
    const services = this.openv.getAPI<ServiceApi>("party.openv.service");
    const [impl, local] = await this.#processPath(path);

    return services.callFunction("readFile", [local], impl, {
      root: this.name + ".impl",
    }) as Promise<Blob>;
  }
  async writeFile(path: string, data: Blob): Promise<void> {
    const services = this.openv.getAPI<ServiceApi>("party.openv.service");
    const [impl, local] = await this.#processPath(path);

    await services.callFunction("writeFile", [local, data], impl, {
      root: this.name + ".impl",
    });
    return;
  }
  async unlink(path: string): Promise<void> {
    const services = this.openv.getAPI<ServiceApi>("party.openv.service");
    const [impl, local] = await this.#processPath(path);

    await services.callFunction("unlink", [local], impl, {
      root: this.name + ".impl",
    });
    return;
  }

  async readDir(path: string): Promise<string[]> {
    const services = this.openv.getAPI<ServiceApi>("party.openv.service");
    const [impl, local] = await this.#processPath(path);

    return services.callFunction("readDir", [local], impl, {
      root: this.name + ".impl",
    }) as Promise<string[]>;
  }
  async makeDir(path: string): Promise<void> {
    const services = this.openv.getAPI<ServiceApi>("party.openv.service");
    const [impl, local] = await this.#processPath(path);

    await services.callFunction("makeDir", [local], impl, {
      root: this.name + ".impl",
    });
    return;
  }
  async rmDir(path: string): Promise<void> {
    const services = this.openv.getAPI<ServiceApi>("party.openv.service");
    const [impl, local] = await this.#processPath(path);

    await services.callFunction("rmDir", [local], impl, {
      root: this.name + ".impl",
    });
    return;
  }

  async symlink(target: string, path: string): Promise<void> {
    const services = this.openv.getAPI<ServiceApi>("party.openv.service");
    const [impl, local] = await this.#processPath(path);

    await services.callFunction("symlink", [target, local], impl, {
      root: this.name + ".impl",
    });
    return;
  }
  async readlink(path: string): Promise<string> {
    const services = this.openv.getAPI<ServiceApi>("party.openv.service");
    const [impl, local] = await this.#processPath(path);
    return services.callFunction("readlink", [local], impl, {
      root: this.name + ".impl",
    }) as Promise<string>;
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    const services = this.openv.getAPI<ServiceApi>("party.openv.service");
    const [implOld, localOld] = await this.#processPath(oldPath);
    const [implNew, localNew] = await this.#processPath(newPath);

    if (implOld !== implNew) {
      throw new Error("Cannot rename across different filesystems.");
    }

    await services.callFunction("rename", [localOld, localNew], implOld, {
      root: this.name + ".impl",
    });
    return;
  }
  async chown(path: string, uid: number, gid = uid): Promise<void> {
    const services = this.openv.getAPI<ServiceApi>("party.openv.service");
    const [impl, local] = await this.#processPath(path);

    await services.callFunction("chown", [local, uid, gid], impl, {
      root: this.name + ".impl",
    });
    return;
  }
  async chmod(path: string, mode: number): Promise<void> {
    const services = this.openv.getAPI<ServiceApi>("party.openv.service");
    const [impl, local] = await this.#processPath(path);
    await services.callFunction("chmod", [local, mode], impl, {
      root: this.name + ".impl",
    });
    return;
  }
  async stat(path: string): Promise<FsStats> {
    const services = this.openv.getAPI<ServiceApi>("party.openv.service");
    const [impl, local] = await this.#processPath(path);

    return services.callFunction("stat", [local], impl, {
      root: this.name + ".impl",
    }) as any;
  }

  async resolve(path: string, cwd?: string): Promise<string | null> {
    try {
      await this.stat(path);
      return path;
    } catch {}

    if (!cwd) {
      const processes = this.openv.getAPI<ProcessesApi>(
        "party.openv.processes",
      );
      // Try to get CWD. This will only work if called inside a process (global env.PID is set)
      cwd = await processes.getCwd();
    }

    if (path.startsWith("/")) {
      try {
        await this.stat(path);
        return path;
      } catch {
        return null;
      }
    }

    if (path.startsWith("./")) path = path.slice(2);

    const absPath = cwd.replace(/\/+$/g, "") + "/" + path;

    try {
      await this.stat(absPath);
      return absPath;
    } catch {
      return null;
    }
  }
}
