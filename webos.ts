import { RefChannel, RefChannelMessage } from "./channel.ts";
import { Registry } from "./registry.ts";

export interface API {
  name: string;
  populate(reg: Registry): Promise<void>;
}

export class WebOS {
  #reg: Registry;
  api: {
    [key: string]: API;
  } = {};

  constructor(reg: Registry) {
    this.#reg = reg;
  }

  async setup() {
    if (await this.#reg.has("system.initialized")) {
      console.log("System already initialized.");
      return;
    }

    this.#reg.write("system.initialized", true);
  }

  async installAPI(api: API): Promise<void> {
    if (typeof api.name !== "string" || api.name.length === 0) {
      throw new Error("API must have a valid name.");
    }
    if (this.api[api.name]) {
      throw new Error(`API "${api.name}" is already installed.`);
    }

    this.api[api.name] = api;
    await api.populate(this.#reg);
    console.log(`API "${api.name}" installed.`);
  }
  // Helper to typecast the API
  async getAPI<T extends API>(name: string): Promise<T> {
    const api = this.api[name];
    if (!api) {
      throw new Error(`API "${name}" is not installed.`);
    }
    return api as T;
  }

  get registry(): Registry {
    return this.#reg;
  }

  async serve(channel: RefChannel): Promise<void> {
    let lastId = 0;
    this.#reg.on("write", (key, value) => {
      lastId++;
      console.log("Debug: Server Write event:", key, value);
      channel.send({ type: "request.set", key, value, id: lastId });
    });
    this.#reg.on("delete", (key) => {
      lastId++;
      console.log("Debug: Server Delete event:", key);
      channel.send({ type: "request.delete", key, id: lastId });
    });

    channel.subscribe(async (msg: RefChannelMessage) => {
      console.log("Debug: Server Received message:", msg);
      if (msg.type === "request.get") {
        try {
          const value = await this.#reg.read(msg.key);
          channel.send({
            type: "response.get",
            key: msg.key,
            value,
            id: msg.id,
            success: true,
          });
        } catch (e) {
          channel.send({
            type: "response.get",
            key: msg.key,
            value: null,
            id: msg.id,
            success: false,
          });
        }
      } else if (msg.type === "request.set") {
        try {
          await this.#reg.write(msg.key, msg.value);
          channel.send({
            type: "response.set",
            success: true,
            id: msg.id,
            key: msg.key,
            value: msg.value,
          });
        } catch (e) {
          channel.send({
            type: "response.set",
            success: false,
            id: msg.id,
            key: msg.key,
            value: msg.value,
          });
        }
      } else if (msg.type === "request.delete") {
        try {
          await this.#reg.delete(msg.key);
          channel.send({
            type: "response.delete",
            success: true,
            id: msg.id,
            key: msg.key,
          });
        } catch (e) {
          channel.send({
            type: "response.delete",
            success: false,
            id: msg.id,
            key: msg.key,
          });
        }
      } else if (msg.type === "request.list") {
        try {
          const entries = await this.#reg.entries();
          channel.send({
            type: "response.list",
            entries,
            id: msg.id,
            success: true,
          });
        } catch (e) {
          channel.send({ type: "response.list", id: msg.id, success: false });
        }
      }
    });
  }
}
