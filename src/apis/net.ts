import { WebOS } from "../webos";
import { API } from "./api";
import { ServiceApi } from "./service";

export interface NetBus {
  send(dest: string, data: Blob): Promise<void>;
  recv(): AsyncGenerator<{ src: string; data: Blob; state: "data" }>;
}

export class LoopbackBus implements NetBus {
  private queue: Array<{ src: string; data: Blob }> = [];
  private readers: Array<
    (value: IteratorResult<{ src: string; data: Blob; state: "data" }>) => void
  > = [];
  private closed = false;
  async send(dest: string, data: Blob): Promise<void> {
    if (this.closed) {
      throw new Error("Bus is closed");
    }
    if (this.readers.length > 0) {
      const reader = this.readers.shift()!;
      reader({ value: { src: dest, data, state: "data" }, done: false });
    } else {
      this.queue.push({ src: dest, data });
    }
  }
  async *recv(): AsyncGenerator<{ src: string; data: Blob; state: "data" }> {
    try {
      while (true) {
        if (this.queue.length > 0) {
          const item = this.queue.shift()!;
          yield { src: item.src, data: item.data, state: "data" };
        } else {
          const result = await new Promise<
            IteratorResult<{ src: string; data: Blob; state: "data" }>
          >((resolve) => {
            this.readers.push(resolve);
          });
          if (result.done) {
            return;
          }
          yield result.value;
        }
      }
    } finally {
      this.closed = true;
      for (const reader of this.readers) {
        reader({
          value: { src: "", data: new Blob(), state: "data" },
          done: true,
        });
      }
      this.readers = [];
    }
  }
}

export class NetApi implements API, NetBus {
  name = "me.endercass.net";

  os: WebOS;

  async populate(os: WebOS): Promise<void> {
    this.os = os;
  }

  async register(name: string, bus: NetBus): Promise<void> {
    const services = this.os.getAPI<ServiceApi>("me.endercass.service");
    await services.defineFunction("send", bus.send.bind(bus), name, {
      root: this.name + ".bus",
    });
    await services.defineGenerator("recv", bus.recv.bind(bus), name, {
      root: this.name + ".bus",
    });

    let b = await this.listBus();
    if (!b.includes(name)) {
      b.push(name);
    }

    await this.os.registry.write(this.name + ".buses", b);
  }
  async unregister(name: string): Promise<void> {
    const services = this.os.getAPI<ServiceApi>("me.endercass.service");
    await services.clearFunctions(name, { root: this.name + ".bus" });

    let b = await this.listBus();
    b = b.filter((x) => x !== name);
    await this.os.registry.write(this.name + ".buses", b);
  }

  async listBus(): Promise<string[]> {
    try {
      return (
        ((await this.os.registry.read(this.name + ".buses")) as
          | string[]
          | null) ?? []
      );
    } catch {
      return [];
    }
  }

  async listRoutes(): Promise<{
    [node: string]: { via: string };
  }> {
    try {
      return (
        ((await this.os.registry.read(this.name + ".routes")) as {
          [node: string]: { via: string };
        } | null) ?? {}
      );
    } catch {
      return {};
    }
  }

  /**
   * Add a route to the routing table
   * @param node CIDR notation of the network to route or "default" for default route
   * @param via bus name or CIDR notation of the next hop
   */
  async route(node: string, via: string): Promise<void> {
    const routes = await this.listRoutes();
    routes[node] = { via };
    await this.os.registry.write(this.name + ".routes", routes);
  }

  /**
   * Remove a route from the routing table
   * @param id ID of the route to remove
   */
  async unroute(id: number): Promise<void> {
    const routes = await this.listRoutes();
    const keys = Object.keys(routes);
    if (id < 0 || id >= keys.length) {
      throw new Error("Invalid route ID");
    }
    delete routes[keys[id]];
    await this.os.registry.write(this.name + ".routes", routes);
  }

  /**
   * Send data to a destination IP address
   * @param dest Destination IP address (No DNS resolution)
   * @param data Data to send
   */
  async send(dest: string, data: Blob): Promise<void> {
    const routes = await this.listRoutes();
    let via: string | null = null;

    // Find the best route for the destination
    router: for (const [node, route] of Object.entries(routes)) {
      if (node === "default" || dest === node) {
        via = route.via;
        break;
      }
      // cidr match
      if (node.includes("/")) {
        const [base, prefix] = node.split("/");
        const destParts = dest.split(".").map((x) => parseInt(Number(x)));
        const baseParts = base.split(".").map((x) => parseInt(Number(x)));
        if (destParts.includes(NaN) || baseParts.includes(NaN)) {
          continue;
        }
        for (const part of [...destParts, ...baseParts]) {
          if (part < 0 || part > 255) {
            continue router;
          }
        }
        const mask = 0xffffffff << (32 - parseInt(prefix));
        const destInt =
          (destParts[0] << 24) |
          (destParts[1] << 16) |
          (destParts[2] << 8) |
          destParts[3];
        const baseInt =
          (baseParts[0] << 24) |
          (baseParts[1] << 16) |
          (baseParts[2] << 8) |
          baseParts[3];
        if ((destInt & mask) === (baseInt & mask)) {
          via = route.via;
          break;
        }
      }
    }
    if (!via) {
      throw new Error("No route to host");
    }
    const buses = await this.listBus();
    if (!buses.includes(via)) {
      throw new Error("No such bus: " + via);
    }
    const services = this.os.getAPI<ServiceApi>("me.endercass.service");
    await services.callFunction("send", [dest, data], via, {
      root: this.name + ".bus",
    });
  }

  /**
   * Receive data from any bus
   */
  async *recv(): AsyncGenerator<{ state: "data"; src: string; data: Blob }> {
    const services = this.os.getAPI<ServiceApi>("me.endercass.service");

    const buses = await this.listBus();
    const gens = buses.map((bus) =>
      services.callGenerator("recv", [], bus, {
        root: this.name + ".bus",
      }),
    );
    const readers = gens.map((gen) => gen[Symbol.asyncIterator]());
    let lastNextCalls = readers.map((r) => r.next());

    yield* {
      [Symbol.asyncIterator]() {
        return {
          next: async () => {
            const result = await Promise.race(
              lastNextCalls.map((p, i) => p.then((v) => ({ v, i }))),
            );
            if (result.v.done) {
              // remove this reader
              readers.splice(result.i, 1);
              lastNextCalls.splice(result.i, 1);
              if (readers.length === 0) {
                return { value: undefined, done: true };
              }
              return this.next();
            }
            lastNextCalls[result.i] = readers[result.i].next();
            return { value: result.v.value, done: false };
          },
        };
      },
    };
  }
}
