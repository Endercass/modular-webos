import { WebOS } from "../webos";
import { API } from "./api";
import { ProcessesApi } from "./processes";
import { ServiceApi } from "./service";

export interface FsStats {
    type: "DIRECTORY" | "FILE"
    size: number
    atime: number,
    mtime: number,
    ctime: number,
}

export interface FsImpl {
    readFile(path: string): Promise<Blob>
    readDir(path: string): Promise<string[]>
    writeFile(path: string, data: Blob | string): Promise<void>
    makeDir(path: string, recursive?: boolean): Promise<void>
    stat(path: string): Promise<FsStats>
}

export class FsApi implements API, FsImpl {
    name = "me.endercass.fs"

    os: WebOS

    async populate(os: WebOS) {
        this.os = os
    }

    async register(namespace: string, impl: FsImpl) {
        const services = this.os.getAPI<ServiceApi>("me.endercass.service");

        services.defineFunction("readFile", impl.readFile.bind(impl) as any, namespace, { root: this.name + ".impl" });
        services.defineFunction("readDir", impl.readDir.bind(impl) as any, namespace, { root: this.name + ".impl" });
        services.defineFunction("writeFile", impl.writeFile.bind(impl) as any, namespace, { root: this.name + ".impl" });
        services.defineFunction("makeDir", impl.makeDir.bind(impl) as any, namespace, { root: this.name + ".impl" });
        services.defineFunction("stat", impl.stat.bind(impl) as any, namespace, { root: this.name + ".impl" });
    }

    async mount(path: string, namespace: string) {
        let tab: Record<string, string> = {}
        try {
            tab = await this.os.registry.read(this.name + ".fstab")
        } catch { }

        tab[path] = namespace;

        await this.os.registry.write(this.name + ".fstab", tab)
    }

    async #relToAbs(path: string): Promise<string> {
        if (path.startsWith("/")) return path
        if (path.startsWith("./")) path = path.slice(2)

        const processes = this.os.getAPI<ProcessesApi>("me.endercass.processes");
        return await processes.getCwd() + "/" + path
    }

    async #processPath(path: string): Promise<[string, string]> {
        path = await this.#relToAbs(path);

        const tab = await this.os.registry.read(this.name + ".fstab")

        if (path in tab) return [tab[path], "/"]

        const best = Object.keys(tab).sort().reverse().find((prefix) => path.startsWith(prefix));
        return [tab[best || "/"], "/" + path.slice((best || "/").length)]
    }

    async readFile(path: string): Promise<Blob> {
        const services = this.os.getAPI<ServiceApi>("me.endercass.service");
        const [impl, local] = await this.#processPath(path);

        return services.callFunction("readFile", [local], impl, {
            root: this.name + ".impl"
        }) as Promise<Blob>
    }

    async readDir(path: string): Promise<string[]> {
        const services = this.os.getAPI<ServiceApi>("me.endercass.service");
        const [impl, local] = await this.#processPath(path);

        return services.callFunction("readDir", [local], impl, {
            root: this.name + ".impl"
        }) as Promise<string[]>
    }


    async writeFile(path: string, data: Blob): Promise<void> {
        const services = this.os.getAPI<ServiceApi>("me.endercass.service");
        const [impl, local] = await this.#processPath(path);

        await services.callFunction("writeFile", [local, data], impl, {
            root: this.name + ".impl"
        })
        return
    }

    async makeDir(path: string): Promise<void> {
        const services = this.os.getAPI<ServiceApi>("me.endercass.service");
        const [impl, local] = await this.#processPath(path);

        await services.callFunction("makeDir", [local], impl, {
            root: this.name + ".impl"
        })
        return
    }

    async stat(path: string): Promise<FsStats> {
        const services = this.os.getAPI<ServiceApi>("me.endercass.service");
        const [impl, local] = await this.#processPath(path);

        return services.callFunction("stat", [local], impl, {
            root: this.name + ".impl"
        }) as any;
    }
}

export class RegistryFs implements FsImpl {
    constructor(public os: WebOS, public root: string) { }

    #serializePath(path: string): string {
        return this.root + ".fs" + path.replace(/\/+$/, "").replaceAll("/", ".children.")
    }

    async readFile(path: string): Promise<Blob> {
        const stats = await this.stat(path)

        if (stats.type !== "FILE") {
            throw new Error("Cannot read the contents of a non-file (" + stats.type + ")")
        }

        return await this.os.registry.read(this.#serializePath(path) + ".data")
    }
    async readDir(path: string): Promise<string[]> {
        const stats = await this.stat(path)

        if (stats.type !== "DIRECTORY") {
            throw new Error("Cannot list a non-directory (" + stats.type + ")")
        }

        return await this.os.registry.read(this.#serializePath(path) + ".data")
    }
    async writeFile(path: string, data: Blob | string): Promise<void> {
        if (typeof data === "string") {
            data = new Blob([data])
        }

        const serPath = this.#serializePath(path)

        try {
            const stats = await this.stat(path);

            if (stats.type !== "FILE") throw new Error("Entry already exists and is not a file")
        } catch (e) {
            if (e.message === "Entry already exists and is not a file") throw e
            const parent = path.substring(0, path.lastIndexOf('/'))
            const serParent = this.#serializePath(parent)

            if (await this.os.registry.read(serParent + ".type") !== "DIRECTORY") {
                throw new Error("Cannot create a file inside of another file.")
            }

            await this.os.registry.write(serPath + ".type", "FILE")
            await this.os.registry.write(serPath + ".ctime", Date.now())

            let ents: string[] = []
            try {
                ents = await this.os.registry.read(serParent + ".data")
            } catch { }
            ents.push(path.slice(parent.length + 1))

            await this.os.registry.write(serParent + ".data", ents)
        }


        await this.os.registry.write(serPath + ".data", data)
        await this.os.registry.write(serPath + ".length", data.size)
        await this.os.registry.write(serPath + ".atime", Date.now())
        await this.os.registry.write(serPath + ".mtime", Date.now())
    }

    async makeDir(path: string, recursive: boolean = false): Promise<void> {
        const serPath = this.#serializePath(path);

        try {
            const stats = await this.stat(path);
            if (stats.type === "DIRECTORY") {
                return;
            }
            throw new Error("Path exists but is not a directory.");
        } catch (e) {
            if (e.message !== "No entry exists at path: " + path) {
                throw e;
            }

            if (recursive) {
                const parentPath = path.substring(0, path.lastIndexOf("/"));
                if (parentPath && parentPath !== path) {
                    await this.makeDir(parentPath, true);
                }
            }

            await this.os.registry.write(serPath + ".type", "DIRECTORY");
            await this.os.registry.write(serPath + ".ctime", Date.now());
            await this.os.registry.write(serPath + ".atime", Date.now());
            await this.os.registry.write(serPath + ".mtime", Date.now());

            await this.os.registry.write(serPath + ".data", []);

            const parent = path.substring(0, path.lastIndexOf('/'));
            const serParent = this.#serializePath(parent);

            let ents: string[] = [];
            try {
                ents = await this.os.registry.read(serParent + ".data");
            } catch (err) { }

            const entryName = path === "/" ? "" : path.slice(parent.length + 1) + '/';

            if (entryName) {
                ents.push(entryName);
            }

            await this.os.registry.write(serParent + ".data", ents);
        }
    }

    async stat(path: string): Promise<FsStats> {
        const stats: Partial<FsStats> = {
            type: "FILE",
            size: 0,
            atime: 0,
            mtime: 0,
            ctime: 0
        }

        const regPath = this.#serializePath(path)

        try {
            stats.type = await this.os.registry.read(regPath + ".type")
        } catch {
            throw new Error("No entry exists at path: " + path)
        }
        if (stats.type === "FILE") {
            try {
                stats.size = await this.os.registry.read(regPath + ".length")
            } catch {
                try {
                    stats.size = (await this.os.registry.read(regPath + ".data") as Blob).size
                } catch { }
            }
        }
        try {
            stats.atime = await this.os.registry.read(regPath + ".atime")
        } catch { }
        try {
            stats.mtime = await this.os.registry.read(regPath + ".mtime")
        } catch { }
        try {
            stats.ctime = await this.os.registry.read(regPath + ".ctime")
        } catch { }

        return stats as FsStats
    }
}