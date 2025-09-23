import type { API, OpEnv } from "../../../../openv/mod";
import type ProcessesApi from "../processes/mod";
import type ServiceApi from "../service/mod";

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

export class TempFS implements FsImpl {
  ents: Map<
    string,
    { stats: FsStats } & ({ data: Blob } | { entries: Set<string> })
  > = new Map();

  async initialize(openv: OpEnv) {
    this.ents.set("/", {
      stats: {
        type: "DIRECTORY",
        size: 0,
        atime: Date.now(),
        mtime: Date.now(),
        ctime: Date.now(),
        name: "/",
        uid: 0,
        gid: 0,
        mode: 0o755,
        dev: "tempfs",
      },
      entries: new Set(),
    });
  }

  #getEnt(path: string) {
    const ent = this.ents.get(path);
    // console.log("getEnt", path, ent);
    // console.log(this.ents);
    if (!ent) throw new Error("No such file or directory: " + path);
    return ent;
  }

  async readFile(path: string): Promise<Blob> {
    const ent = this.#getEnt(path);
    if (ent.stats.type !== "FILE") throw new Error("Not a file: " + path);
    return (ent as any).data;
  }
  async writeFile(path: string, data: Blob | string): Promise<void> {
    const now = Date.now();
    let ent = this.ents.get(path);
    data = typeof data === "string" ? new Blob([data]) : data;
    if (!ent) {
      const parts = path.split("/").filter((p) => p.length > 0);
      const name = parts.pop()!;
      const dirPath = "/" + parts.join("/");
      console.log("dirPath:", dirPath);
      const dir = this.#getEnt(dirPath);
      if (dir.stats.type !== "DIRECTORY") {
        throw new Error("Not a directory: " + dirPath);
      }
      (dir as any).entries.add(name);

      ent = {
        stats: {
          type: "FILE",
          size: 0,
          atime: now,
          mtime: now,
          ctime: now,
          name,
          uid: 0,
          gid: 0,
          mode: 0o644,
          dev: "tempfs",
        },
        data,
      };
    }
    ent.stats.size = data.size;
    ent.stats.mtime = now;
    ent.stats.ctime = now;
    (ent as any).data = data;

    this.ents.set(path, ent);
  }
  async unlink(path: string): Promise<void> {
    const ent = this.#getEnt(path);
    if (ent.stats.type !== "FILE") throw new Error("Not a file: " + path);
    this.ents.delete(path);
  }

  async readDir(path: string): Promise<string[]> {
    const ent = this.#getEnt(path);
    if (ent.stats.type !== "DIRECTORY")
      throw new Error("Not a directory: " + path);
    return Array.from((ent as any).entries);
  }
  async makeDir(path: string, recursive = false): Promise<void> {
    const now = Date.now();
    let ent = this.ents.get(path);
    if (ent) throw new Error("File exists: " + path);

    const parts = path.split("/").filter((p) => p.length > 0);
    const name = parts.pop()!;
    const dirPath = "/" + parts.join("/");
    let dir = this.ents.get(dirPath);
    if (!dir) {
      if (recursive) {
        await this.makeDir(dirPath, true);
        dir = this.ents.get(dirPath);
      } else {
        throw new Error("No such file or directory: " + dirPath);
      }
    }
    if (dir!.stats.type !== "DIRECTORY") {
      throw new Error("Not a directory: " + dirPath);
    }
    (dir as any).entries.add(name);

    ent = {
      stats: {
        type: "DIRECTORY",
        size: 0,
        atime: now,
        mtime: now,
        ctime: now,
        name,
        uid: 0,
        gid: 0,
        mode: 0o755,
        dev: "tempfs",
      },
      entries: new Set(),
    };
    this.ents.set(path, ent);
  }
  async rmDir(path: string): Promise<void> {
    const ent = this.#getEnt(path);
    if (ent.stats.type !== "DIRECTORY")
      throw new Error("Not a directory: " + path);
    if ((ent as any).entries.size > 0) {
      throw new Error("Directory not empty: " + path);
    }
    this.ents.delete(path);
  }

  async symlink(target: string, path: string): Promise<void> {
    throw new Error("Not implemented");
  }
  async readlink(path: string): Promise<string> {
    throw new Error("Not implemented");
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    const ent = this.#getEnt(oldPath);
    this.ents.set(newPath, ent);
    this.ents.delete(oldPath);
  }
  async chown(path: string, uid: number, gid = uid): Promise<void> {
    const ent = this.#getEnt(path);
    ent.stats.uid = uid;
    ent.stats.gid = gid;
  }
  async chmod(path: string, mode: number): Promise<void> {
    const ent = this.#getEnt(path);
    ent.stats.mode = mode;
  }
  async stat(path: string): Promise<FsStats> {
    const ent = this.#getEnt(path);
    return ent.stats;
  }
}

export default class FsApi implements API, FsImpl {
  name = "party.openv.fs";

  openv: OpEnv;

  async initialize(openv: OpEnv) {
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
  async makeDir(path: string, recursive: boolean = false): Promise<void> {
    const services = this.openv.getAPI<ServiceApi>("party.openv.service");
    const [impl, local] = await this.#processPath(path);

    await services.callFunction("makeDir", [local, recursive], impl, {
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
      console.log("Trying absolute path:", path);
      await this.stat(path);
      return path;
    } catch {}

    if (!cwd) {
      const processes = this.openv.getAPI<ProcessesApi>(
        "party.openv.processes",
      );
      // Try to get CWD. This will only work if called inside a process (global env.PID is set)
      console.log(
        "Calling getCwd to determine CWD. This will fail if executed in the runtime",
      );
      cwd = await processes.getCwd();
    }

    if (path.startsWith("./")) path = path.slice(2);

    const absPath = cwd.replace(/\/+$/g, "") + "/" + path;

    console.log("Trying CWD path:", absPath);

    try {
      await this.stat(absPath);
      console.log("Resolved path:", absPath);
      return absPath;
    } catch {
      return null;
    }
  }
}
