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
  ): Promise<[FileSystemDirectoryHandle, string]> {
    const parts = path.replace(/^\/+|\/+$/g, "").split("/");
    let dir = this.dirHandle;

    for (let i = 0; i < parts.length - 1; i++) {
      dir = await dir.getDirectoryHandle(parts[i], { create });
    }

    return [dir, parts[parts.length - 1]];
  }

  async #pathToFileHandle(
    path: string,
    create: boolean = false,
  ): Promise<FileSystemFileHandle> {
    const [dir, fileName] = await this.#pathToDirHandle(path, create);
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
    await this.openv.registry.write(
      this.namespace +
        ".stats." +
        path.replace(/\/+$/, "").replaceAll("/", "."),
      stats as any,
    );
  }
  async unlink(path: string): Promise<void> {
    const [dir, fileName] = await this.#pathToDirHandle(path);
    await dir.removeEntry(fileName);

    try {
      await this.openv.registry.delete(
        this.namespace +
          ".stats." +
          path.replace(/\/+$/, "").replaceAll("/", "."),
      );
    } catch {}
  }

  async readDir(path: string): Promise<string[]> {
    const dirHandle =
      path === "/" ? this.dirHandle : (await this.#pathToDirHandle(path))[0];
    const entries: string[] = [];
    for await (const entry of dirHandle.values()) {
      entries.push(entry.name + (entry.kind === "directory" ? "/" : ""));
    }
    return entries;
  }
  async makeDir(path: string, recursive: boolean = false): Promise<void> {
    await this.#pathToDirHandle(path, true);

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
      const now = Date.now();
      stats.mtime = now;
      stats.atime = now;
      await this.openv.registry.write(
        this.namespace +
          ".stats." +
          path.replace(/\/+$/, "").replaceAll("/", "."),
        stats as any,
      );
    }
  }
  async rmDir(path: string): Promise<void> {
    const [dir, dirName] = await this.#pathToDirHandle(path);
    await dir.removeEntry(dirName, { recursive: false });

    try {
      await this.openv.registry.delete(
        this.namespace +
          ".stats." +
          path.replace(/\/+$/, "").replaceAll("/", "."),
      );
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
        this.namespace +
          ".stats." +
          newPath.replace(/\/+$/, "").replaceAll("/", "."),
        stats as any,
      );
      await this.openv.registry.delete(
        this.namespace +
          ".stats." +
          oldPath.replace(/\/+$/, "").replaceAll("/", "."),
      );
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
    await this.openv.registry.write(
      this.namespace +
        ".stats." +
        path.replace(/\/+$/, "").replaceAll("/", "."),
      stats as any,
    );
  }
  async chmod(path: string, mode: number): Promise<void> {
    let stats: FsStats;
    try {
      stats = await this.stat(path);
    } catch {
      throw new Error("No entry exists at path: " + path);
    }
    stats.mode = mode;
    await this.openv.registry.write(
      this.namespace +
        ".stats." +
        path.replace(/\/+$/, "").replaceAll("/", "."),
      stats as any,
    );
  }
  async stat(path: string): Promise<FsStats> {
    let stats: FsStats;
    try {
      stats = await this.openv.registry.read(
        this.namespace +
          ".stats." +
          path.replace(/\/+$/, "").replaceAll("/", "."),
      );
    } catch {
      throw new Error("No entry exists at path: " + path);
    }
    return stats;
  }
}
