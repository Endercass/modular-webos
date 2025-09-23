import type { FsImpl, FsStats } from "../api/party/openv/fs/mod";
import type { OpEnv } from "../openv/openv";

export class LocalFS implements FsImpl {
  constructor(public dirHandle: FileSystemDirectoryHandle) {}

  openv: OpEnv;
  namespace: string;

  async initialize(openv: OpEnv, namespace: string): Promise<void> {
    this.openv = openv;
    this.namespace = namespace;
  }

  async #pathToDirHandle(
    path: string,
    create: boolean = false,
  ): Promise<FileSystemDirectoryHandle> {
    if (path.startsWith("/")) {
      path = path.slice(1);
    }
    const parts = path.split("/").filter((p) => p.length > 0);
    let dir: FileSystemDirectoryHandle = this.dirHandle;
    for (let i = 0; i < parts.length; i++) {
      dir = await dir.getDirectoryHandle(parts[i], {
        create: create && i === parts.length - 1,
      });
    }
    return dir;
  }

  async #pathToFileHandle(
    path: string,
    create: boolean = false,
  ): Promise<FileSystemFileHandle> {
    const parentPath = path.split("/").slice(0, -1).join("/");
    const fileName = path.split("/").pop();
    if (!fileName) {
      throw new Error("Invalid file path: " + path);
    }
    console.log("Getting file handle for", path, "in", parentPath);
    const dir = await this.#pathToDirHandle(parentPath, create);
    return await dir.getFileHandle(fileName, { create });
  }

  async readFile(path: string): Promise<Blob> {
    const fileHandle = await this.#pathToFileHandle(path);
    const file = await fileHandle.getFile();
    return file;
  }
  async writeFile(path: string, data: Blob | string): Promise<void> {
    if (typeof data === "string") {
      data = new Blob([data]);
    }

    const fileHandle = await this.#pathToFileHandle(path, true);
    const writable = await fileHandle.createWritable();
    await writable.write(data);
    await writable.close();

    let stats: FsStats;
    try {
      stats = await this.stat(path);
    } catch {
      stats = {
        type: "FILE",
        size: 0,
        atime: 0,
        mtime: 0,
        ctime: Date.now(),
        name: path.split("/").pop() || "",
        uid: 0,
        gid: 0,
        mode: 0o666,
        dev: this.namespace,
      };
    }
    stats.size = data.size;
    const now = Date.now();
    stats.mtime = now;
    stats.atime = now;
    await this.openv.registry.write(this.#serializePath(path), stats as any);
  }

  async unlink(path: string): Promise<void> {
    const parentPath = path.split("/").slice(0, -1).join("/");
    const fileName = path.split("/").pop();
    if (!fileName) {
      throw new Error("Invalid file path: " + path);
    }
    const dir = await this.#pathToDirHandle(parentPath);
    await dir.removeEntry(fileName, { recursive: false });
    try {
      await this.openv.registry.delete(this.#serializePath(path));
    } catch {}
  }

  async readdir(path: string): Promise<string[]> {
    const dirHandle =
      path === "/" ? this.dirHandle : await this.#pathToDirHandle(path);
    const entries: string[] = [];
    for await (const entry of dirHandle.values()) {
      entries.push(entry.name + (entry.kind === "directory" ? "/" : ""));
    }
    return entries;
  }

  #serializePath(path: string): string {
    let ser = this.namespace + ".stats.";
    if (path.startsWith("/")) {
      path = path.slice(1);
    }
    for (const part of path.split("/")) {
      // encode as base64, but replace lowercase letters with a${letter} and uppercase with b${lowercase letter}, then replace slash with a- and plus with b-
      ser +=
        btoa(part)
          .replace("=", "")
          .split("")
          .map((c) => {
            if (c >= "a" && c <= "z") {
              return "a" + c;
            } else if (c >= "A" && c <= "Z") {
              return "b" + c.toLowerCase();
            } else if (c === "/") {
              return "a-";
            } else if (c === "+") {
              return "b-";
            } else if (c === "=") {
              return "c-";
            } else {
              return c;
            }
          })
          .join("") + ".";
    }
    return ser.replace(/\.+$/, "");
  }

  async mkdir(path: string, recursive: boolean = false): Promise<void> {
    let stats: FsStats;
    try {
      stats = await this.stat(path);
      if (stats.type === "DIRECTORY") {
        return;
      }
      throw new Error("Path exists but is not a directory.");
    } catch {
      stats = {
        type: "DIRECTORY",
        size: 0,
        atime: 0,
        mtime: 0,
        ctime: Date.now(),
        name: path.split("/").pop() || "",
        uid: 0,
        gid: 0,
        mode: 0o777,
        dev: this.namespace,
      };
    }
    const now = Date.now();
    stats.mtime = now;
    stats.atime = now;
    await this.openv.registry.write(this.#serializePath(path), stats as any);
    await this.#pathToDirHandle(path, true);
  }
  async rmdir(path: string): Promise<void> {
    const dirHandle = await this.#pathToDirHandle(path);
    for await (const _ of dirHandle.values()) {
      throw new Error("Directory is not empty: " + path);
    }
    const parentPath = path.split("/").slice(0, -1).join("/");
    const dirName = path.split("/").pop();
    if (!dirName) {
      throw new Error("Invalid directory path: " + path);
    }
    const parentDir = await this.#pathToDirHandle(parentPath);
    await parentDir.removeEntry(dirName, { recursive: false });
    try {
      await this.openv.registry.delete(this.#serializePath(path));
    } catch {}
  }

  async symlink(target: string, path: string): Promise<void> {
    throw new Error("Symlinks are not yet implemented.");
  }
  async readlink(path: string): Promise<string> {
    console.warn("Warning: readlink is not yet implemented.");
    return path;
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    const oldFileHandle = await this.#pathToFileHandle(oldPath);
    const oldFile = await oldFileHandle.getFile();
    await this.writeFile(newPath, oldFile);
    await this.unlink(oldPath);

    try {
      const stats = await this.stat(oldPath);
      await this.openv.registry.write(
        this.#serializePath(newPath),
        stats as any,
      );
      await this.openv.registry.delete(this.#serializePath(oldPath));
    } catch {}
  }
  async chown(path: string, uid: number, gid = uid): Promise<void> {
    let stats: FsStats;
    try {
      stats = await this.stat(path);
    } catch {
      throw new Error("No entry exists at path: " + path);
    }
    stats.uid = uid;
    stats.gid = gid;
    await this.openv.registry.write(this.#serializePath(path), stats as any);
  }
  async chmod(path: string, mode: number): Promise<void> {
    let stats: FsStats;
    try {
      stats = await this.stat(path);
    } catch {
      throw new Error("No entry exists at path: " + path);
    }
    stats.mode = mode;
    await this.openv.registry.write(this.#serializePath(path), stats as any);
  }
  async stat(path: string): Promise<FsStats> {
    let stats: FsStats;
    try {
      stats = await this.openv.registry.read(this.#serializePath(path));
    } catch {
      throw new Error("No entry exists at path: " + path);
    }
    return stats;
  }
}
