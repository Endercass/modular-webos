import { RegistryValue } from "../registry";
import { OpEnv } from "../openv";
import { API } from "./api";
import { IPCApi } from "./ipc";
import { ServiceApi } from "./service";

/**
 * ipv4 or ipv6 address; no DNS resolution
 */
type IpAddress = string;

/**
 * An abstraction of an IP packet.
 */
export interface NetPacket {
  /**
   * Source IP address
   */
  src: IpAddress;
  /**
   * Destination IP address
   */
  dest: IpAddress;
  /**
   * Protocol (e.g. "tcp", "udp", or custom)
   * This is to be considered a "request" to the underlying transport layer to use this protocol.
   * If the transport layer does not support this protocol, it may reject the packet, drop it, or use a default protocol.
   */
  protocol: "icmp" | "tcp" | "udp" | string;
  /**
   * Any extra metadata for the packet. If the transport layer does not understand the metadata, it should ignore it.
   */
  meta: { [key: string]: any };
  /**
   * Payload data
   */
  payload: Blob;
}

/**
 * An abstraction of a network bus.
 * A network bus is your glue between your transport layer and the network api.
 */
export interface DuplexNetBus {
  /**
   * Incoming packets from the network.
   */
  inbound: ReadableStream<NetPacket>;
  /**
   * Outgoing packets to the network.
   */
  outbound: WritableStream<NetPacket>;

  /**
   * Whether the bus is ready to send and receive packets.
   */
  ready: Promise<void>;

  /**
   * Close the bus and free any resources.
   */
  close(): Promise<void>;
}

export class LoopbackNetBus implements DuplexNetBus {
  public inbound: ReadableStream<NetPacket>;
  public outbound: WritableStream<NetPacket>;
  public ready: Promise<void>;

  private controller!: ReadableStreamDefaultController<NetPacket>;
  private closed = false;

  constructor() {
    this.inbound = new ReadableStream<NetPacket>({
      start: (controller) => {
        this.controller = controller;
      },
      cancel: async () => {
        this.closed = true;
      },
    });

    this.outbound = new WritableStream<NetPacket>({
      write: async (packet: NetPacket) => {
        if (this.closed) return;
        this.controller.enqueue(packet);
      },
      close: async () => {
        this.controller.close();
        this.closed = true;
      },
      abort: async () => {
        this.closed = true;
      },
    });

    this.ready = Promise.resolve();
  }

  async close(): Promise<void> {
    if (!this.closed) {
      this.controller.close();
      this.closed = true;
    }
  }
}

export class NetApi implements API, DuplexNetBus {
  name = "party.openv.net";

  openv: OpEnv;

  ready = Promise.resolve();
  inbound: ReadableStream<NetPacket>;
  outbound: WritableStream<NetPacket>;

  async populate(openv: OpEnv): Promise<void> {
    this.openv = openv;

    this.inbound = new ReadableStream<NetPacket>({
      start: async (controller) => {
        const ipc = this.openv.getAPI<IPCApi>("party.openv.ipc");

        const activeBuses = new Set<string>();

        this.openv.registry.watch(
          this.name + ".buses",
          async (buses: RegistryValue) => {
            if (!Array.isArray(buses)) {
              throw new Error("Buses is not an array");
            }
            const newBuses = (buses as string[]).filter(
              (b) => !activeBuses.has(b),
            );
            for (const bus of newBuses) {
              activeBuses.add(bus);
              ipc.listen(
                "inbound",
                async (packet: RegistryValue) => {
                  if (typeof packet !== "object" || packet === null) {
                    throw new Error("Invalid packet");
                  }
                  if (activeBuses.has(bus)) controller.enqueue(packet as any);
                },
                bus,
                { root: this.name + ".bus" },
              );
            }
            for (const bus of Array.from(activeBuses)) {
              if (!buses.includes(bus)) {
                activeBuses.delete(bus);
              }
            }
          },
        );
      },
    });
    this.outbound = new WritableStream<NetPacket>({
      write: async (packet: NetPacket) => {
        const routes = await this.listRoutes();
        let via: string | null = null;

        // Find the best route for the destination
        router: for (const [node, route] of Object.entries(routes)) {
          if (node === "default" || packet.dest === node) {
            via = route.via;
            break;
          }
          // cidr match
          if (node.includes("/")) {
            const [base, prefix] = node.split("/");
            const destParts = packet.dest.split(".").map((x) => Number(x));
            const baseParts = base.split(".").map((x) => Number(x));
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
          console.debug("No route to host for", packet.dest);
          return;
        }
        const buses = await this.listBus();
        if (!buses.includes(via)) {
          console.debug("No such bus:", via);
          return;
        }
        const ipc = this.openv.getAPI<IPCApi>("party.openv.ipc");
        await ipc.send("outbound", packet as any, via, {
          root: this.name + ".bus",
        });
      },
      close: async () => {},
      abort: async () => {},
    });
  }

  async close(): Promise<void> {
    this.inbound.cancel();
    this.outbound.abort();
  }

  async register(name: string, bus: DuplexNetBus): Promise<void> {
    await bus.ready;

    const ipc = this.openv.getAPI<IPCApi>("party.openv.ipc");
    await ipc.listen(
      "outbound",
      async (packet: RegistryValue) => {
        if (typeof packet !== "object" || packet === null) {
          throw new Error("Invalid packet");
        }
        const writer = bus.outbound.getWriter();
        await writer.write(packet as any);
        writer.releaseLock();
      },
      name,
      { root: this.name + ".bus" },
    );
    const reader = bus.inbound.getReader();
    (async () => {
      for await (const packet of {
        [Symbol.asyncIterator]() {
          return {
            next: async () => {
              const result = await reader.read();
              return {
                value: result.value,
                done: result.done,
              };
            },
          };
        },
      }) {
        try {
          await ipc.send("inbound", packet as any, name, {
            root: this.name + ".bus",
          });
        } catch {
          console.debug("broken bus, ignoring");
        }
      }
    })();

    let b = await this.listBus();
    if (!b.includes(name)) {
      b.push(name);
    }

    await this.openv.registry.write(this.name + ".buses", b);
  }
  async unregister(name: string): Promise<void> {
    const services = this.openv.getAPI<ServiceApi>("party.openv.service");
    await services.clearFunctions(name, { root: this.name + ".bus" });

    let b = await this.listBus();
    b = b.filter((x) => x !== name);
    await this.openv.registry.write(this.name + ".buses", b);
  }

  async listBus(): Promise<string[]> {
    try {
      return (
        ((await this.openv.registry.read(this.name + ".buses")) as
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
        ((await this.openv.registry.read(this.name + ".routes")) as {
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
    await this.openv.registry.write(this.name + ".routes", routes);
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
    await this.openv.registry.write(this.name + ".routes", routes);
  }

  // NOTES
  // - This works great as a sort of alternate-IP, and handles layer 3 alright
  // - A Socket API is strongly needed to make this truly useful, layer 3 is hard to actually use
  // - Note that the payload for NetPacket is not the payload for TCP/UDP/etc, it's the entire packet payload, including the layer 4 protocol headers.
  //   This is why there is no port-related functionality here.

  // Unanswered questions:
  // - We know in the future applications would ideally use a Socket API to interact with this, but how would a bus implement anything more complex than loopback?
  // - Would the overhead of transmitting full packets (including TCP/UDP headers) be too high for some applications?
  // - [!] Could typescript save us from having to manually parse binary data for protocols? Instead of using raw l4 payload, could we type the metadata to include parsed headers? this could bring the syntax of NetPacket<T> and Socket<T>
  //       Custom protocols would be easy to implement, but what do we do about the protocol field? do we keep an arbitrary string or can we do some typescript magic to get a string from T somehow?
}
