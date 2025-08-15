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

addEventListener("install", async (event) => {
    self.skipWaiting()
})

addEventListener("activate", async (event) => {
    await event.waitUntil(self.clients.claim())
})


