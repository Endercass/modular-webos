import * as OS from "./dist/index.js"
import * as Distro from "./dist/distro.js"

async function getOS() {
    self.os ||= await Distro.boot()
    return self.os
}


const queues = new Map();

addEventListener("message", async (evt) => {
    if (evt.source) {
        if (queues.has(evt.source.id)) {
            queues.get(evt.source.id).push(evt.data)
        } else {
            const q = OS.createListenerQueue();

            await (await getOS()).getAPI("me.endercass.server").serve({
                send(msg) {
                    evt.source.postMessage(msg)
                },
                subscribe(cb, name = "anon." + Math.random().toString(36).substring(2, 8)) {
                    q.on(cb, name)
                },
                unsubscribe(name) {
                    q.off(name)
                }
            })

            queues.set(evt.source.id, q);

            q.push(evt.data)
        }
    }
});

addEventListener("fetch", (evt) => {
    if (evt.request.method !== "GET") return

    evt.respondWith((async ({ request }) => {
        const url = new URL(request.url)
        if (url.pathname.startsWith("/fs/")) {
            const os = await getOS()
            if (url.pathname.endsWith("/")) {
                try {
                    return new Response(JSON.stringify({ ok: await os.api["me.endercass.fs"].readDir(url.pathname.slice(3)) }), {
                        headers: {
                            "Content-Type": "application/json"
                        }
                    })
                } catch (err) {
                    return new Response(JSON.stringify({ err: err.message }), {
                        headers: {
                            "Content-Type": "application/json"
                        }
                    })
                }
            } else {
                try {
                    return new Response(await os.api["me.endercass.fs"].readFile(url.pathname.slice(3)))
                } catch (err) {
                    return new Response(JSON.stringify({ err: err.message }), {
                        headers: {
                            "Content-Type": "application/json"
                        }
                    })
                }
            }
        }

        return fetch(url)
    })(evt))
});

addEventListener("install", async (event) => {
    self.skipWaiting()
})

addEventListener("activate", async (event) => {
    await event.waitUntil(self.clients.claim())
})


