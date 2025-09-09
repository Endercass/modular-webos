import type { ServerApi } from "../api/party/openv/server/mod";
import { createListenerQueue, type OpEnv } from "../openv/mod";

export function createIframeExecutor(root?: HTMLElement) {
    if (!root) {
        root = document.createElement("div");
        root.id = "procs";
        root.style.display = "none";
        document.body.appendChild(root);
    }

    return async (openv: OpEnv, pid: number, args: [string, ...string[]]) => {

        const box = document.createElement("iframe") as HTMLIFrameElement;
        box.sandbox = "allow-scripts";
        root.appendChild(box);

        const q = createListenerQueue();

        window.addEventListener("message", (evt) => {
            if (evt.data.pid === pid && !("code" in evt.data))
                q.push(evt.data.msg);
        });

        const server = openv.getAPI<ServerApi>("party.openv.server");
        const { stop } = await server.serve({
            send(msg) {
                box.contentWindow!.postMessage(
                    {
                        pid,
                        msg,
                    },
                    "*",
                );
            },
            subscribe(
                cb: (msg: any) => void,
                name = "anon." + Math.random().toString(36).substring(2, 8),
            ) {
                q.on(cb, name);
            },
            unsubscribe(name) {
                q.off(name);
            },
        });

        const boxUrl = new URL("/box", location.origin);
        boxUrl.searchParams.set("pid", pid + "");
        box.src = boxUrl.toString();

        return new Promise((res) => {
            window.addEventListener("message", (evt) => {
                if (evt.data.pid === pid && "code" in evt.data) {
                    stop();
                    box.remove();
                    res(evt.data.code);
                }
            });
        });
    };
}