import { WebOS } from "../webos";
import { API } from "./api";
import { FsApi } from "./fs";
import { ProcessesApi } from "./processes";
import { ServiceApi } from "./service";

export interface Resolver {
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
    constructor(private os: WebOS) { }

    async resolve(path: string, cwd?: string): Promise<string | null> {
        if (path.startsWith("fs:")) {
            path = path.slice(3);
        }
        const fs = this.os.getAPI<FsApi>("me.endercass.fs");
        return await fs.resolve(path, cwd);
    }
}

export class ResolveApi implements API, Resolver {
    name = "me.endercass.resolve";

    os: WebOS;
    async populate(os: WebOS): Promise<void> {
        this.os = os;
    }

    async register(namespace: string, resolver: Resolver) {
        const services = this.os.getAPI<ServiceApi>("me.endercass.service");

        services.defineFunction("resolve", resolver.resolve.bind(resolver), namespace, {
            root: this.name + ".resolver"
        });
    }

    async unregister(namespace: string) {
        const services = this.os.getAPI<ServiceApi>("me.endercass.service");
        services.undefineFunction("resolve", namespace, {
            root: this.name + ".resolver"
        });
    }

    async resolve(path: string, cwd?: string): Promise<string | null> {
        if (!cwd) {
            const processes = this.os.getAPI<ProcessesApi>("me.endercass.processes");
            // Try to get CWD. This will only work if called inside a process (global env.PID is set)
            cwd = await processes.getCwd();
        }
        const services = this.os.getAPI<ServiceApi>("me.endercass.service");
        const ns = path.split(":")[0];
        let res = await services.callFunction("resolve", [path, cwd], ns, {
            root: this.name + ".resolver",
        });
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
        return import(resolvedPath);
    }
}