import { createListenerQueue } from "../channel";
import { RegistryValue } from "../registry";
import { type WebOS } from "../webos";
import { type API } from "./api";
import { ServerApi } from "./server";
import { ServiceApi } from "./service";

export class ProcessesApi implements API {
    name = "me.endercass.processes"
    os: WebOS;

    async newPid(options: { root?: string } = {}): Promise<number> {
        options.root ??= this.name
        let pid = 0;
        try {
            pid = await this.os.registry.read(`${options.root}.lastPid`) + 1
        } catch { }

        await this.os.registry.write(`${options.root}.lastPid`, pid)

        return pid
    }

    async populate(os: WebOS) {
        this.os = os;
    }

    async execute(args: [string, ...string[]], id?: number, options: {
        root?: string,
    } = {}): Promise<number> {
        options.root ??= this.name

        const services = this.os.getAPI<ServiceApi>("me.endercass.service")

        let res = await services.callFunction((typeof id !== "undefined") ? `execute$${id}` : "execute", [args], "default", {
            root: options.root + ".function"
        })
        if (typeof res !== "number") {
            console.trace("Invalid return value from process api:", res)
            res = -102
        }
        return res
    }

    async startRuntime(id: number, options: {
        root?: string,
    } = {}) {
        options.root ??= this.name

        const services = this.os.getAPI<ServiceApi>("me.endercass.service")
        await services.defineAnycastFunction("execute", id, async (args: RegistryValue) => {
            if (Object.is(args, null) || !Array.isArray(args) || args[0].length < 1 || typeof args[0] !== "string") {
                console.trace("Missing vital process argument! Passed args:", args)
                return -101
            }
            const pid = await this.newPid()

            await this.os.registry.write(`${options.root}.${pid}.pid`, pid);
            await this.os.registry.write(`${options.root}.${pid}.args`, args);

            let procContainer = document.getElementById("procs");
            if (!procContainer) {
                procContainer = document.createElement("div")
                procContainer.id = "procs"
                procContainer.style.display = "none"
                document.body.appendChild(procContainer)
            }

            const box = document.createElement("iframe") as HTMLIFrameElement;
            box.sandbox = "allow-scripts"
            procContainer.appendChild(box)
            
            const q = createListenerQueue()

            
            window.addEventListener("message", (evt) => {
                if (evt.data.pid === pid && !("code" in evt.data))
                    q.push(evt.data.msg)
            })
            
            const server = this.os.getAPI<ServerApi>("me.endercass.server");
            const { stop } = await server.serve(
                {
                    send(msg) {
                        box.contentWindow!.postMessage({
                            pid,
                            msg,
                        }, "*")
                    },
                    subscribe(cb: (msg: any) => void, name = "anon." + Math.random().toString(36).substring(2, 8)) {
                        q.on(cb, name)
                    },
                    unsubscribe(name) {
                        q.off(name)
                    }
                }
            )

            const boxUrl = new URL("/box.html", location.origin)
            boxUrl.searchParams.set("pid", pid + "");
            box.src = boxUrl.toString()

            return new Promise((res) => {
                window.addEventListener("message", (evt) => {
                    if (evt.data.pid === pid && "code" in evt.data) {
                        stop()
                        box.remove()
                        res(evt.data.code) }
                })
            })
        }, "default", {
            root: options.root + ".function"
        })
    }


    async getCwd(pid?: number,  options: {
        root?: string,
    } = {}) {
        options.root ??= this.name
        if (typeof pid !== "number") {
            if (!("env" in window) || !("PID" in (window.env as any))) {
                throw new Error("Could not assume PID outside of a process!")
            }
            pid = (window.env as any).PID
        }

        let cwd: string = "/";
        try {
            cwd = await this.os.registry.read(`${options.root}.${pid}.cwd`)
        } catch {
            await this.os.registry.write(`${options.root}.${pid}.cwd`, cwd)
        }

        return cwd
    }

    async getArgs(pid?: number,  options: {
        root?: string,
    } = {}) {
        options.root ??= this.name
        if (typeof pid !== "number") {
            if (!("env" in window) || !("PID" in (window.env as any))) {
                throw new Error("Could not assume PID outside of a process!")
            }
            pid = (window.env as any).PID
        }
        
        return await this.os.registry.read(`${options.root}.${pid}.args`)
    }
}

