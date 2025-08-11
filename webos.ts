import { ref, type Ref } from "./ref.ts";

type RegistryValuePrimitive = string | number | boolean | ArrayBuffer | null;
type RegistryValue = RegistryValuePrimitive | readonly RegistryValuePrimitive[];

export interface Registry {
  read(key: string): Promise<any>;
  write(key: string, value: RegistryValue): Promise<void>;
  watch(
    key: string,
    callback: (newValue: RegistryValue) => void,
  ): Promise<void>;
  wait(key: string, expectedValue: RegistryValue): Promise<void>;
  delete(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
  keys(): Promise<string[]>;
  values(): Promise<RegistryValue[]>;
  entries(): Promise<[string, RegistryValue][]>;

  on(
    event: "read" | "write",
    callback: (key: string, value: RegistryValue) => void,
  ): void;
  on(event: "delete", callback: (key: string) => void): void;
}

export class MemoryRegistry implements Registry {
  #store: Map<string, Ref<RegistryValue>> = new Map();
  async read(key: string): Promise<RegistryValue> {
    let r = this.#store.get(key);
    if (r === undefined) {
      throw new Error(`Key "${key}" not found in registry.`);
    }

    let val = await r.deref();
    this.listeners.read.forEach((callback) => {
      callback(key, val);
    });
    return r.deref();
  }
  async write(key: string, value: RegistryValue): Promise<void> {
    let r = this.#store.get(key);
    if (r === undefined) {
      r = ref<RegistryValue>(value);
      this.#store.set(key, r);
    } else {
      await r.assign(value);
    }
    if (value === null) {
      this.listeners.delete.forEach((callback) => {
        callback(key);
      });
    } else {
      console.log("Debug: Writing to registry:", key, value);
      this.listeners.write.forEach((callback) => {
        callback(key, value);
      });
    }
  }
  async watch(
    key: string,
    callback: (newValue: RegistryValue) => void,
  ): Promise<void> {
    let r = this.#store.get(key);
    if (r === undefined) {
      throw new Error(`Key "${key}" not found in registry.`);
    }
    r.forEach(callback);
  }
  async wait(key: string, expectedValue: RegistryValue): Promise<void> {
    let r = this.#store.get(key);
    if (r === undefined) {
      throw new Error(`Key "${key}" not found in registry.`);
    }

    let res;
    let promise = new Promise<void>((res) => {
      res = res;
    });

    if ((await r.deref()) === expectedValue) {
      res();
    } else {
      r.forEach((value) => {
        if (value === expectedValue) {
          res();
        }
      });
    }

    return promise;
  }
  async delete(key: string): Promise<void> {
    if (!this.#store.has(key)) {
      throw new Error(`Key "${key}" not found in registry.`);
    }
    this.#store.delete(key);
    this.listeners.delete.forEach((callback) => {
      callback(key);
    });
  }
  async has(key: string): Promise<boolean> {
    return this.#store.has(key);
  }
  async keys(): Promise<string[]> {
    return Array.from(this.#store.keys());
  }
  async values(): Promise<RegistryValue[]> {
    const values: RegistryValue[] = [];
    for (const ref of this.#store.values()) {
      values.push(await ref.deref());
    }
    return values;
  }
  async entries(): Promise<[string, RegistryValue][]> {
    const entries: [string, RegistryValue][] = [];
    for (const [key, ref] of this.#store.entries()) {
      entries.push([key, await ref.deref()]);
    }
    return entries;
  }

  listeners: {
    read: ((key: string, value: RegistryValue) => void)[];
    write: ((key: string, value: RegistryValue) => void)[];
    delete: ((key: string) => void)[];
  } = {
    read: [],
    write: [],
    delete: [],
  };

  on(
    event: "read" | "write" | "delete",
    callback:
      | ((key: string, value: RegistryValue) => void)
      | ((key: string) => void),
  ): void {
    if (event === "read") {
      this.listeners.read.push(
        callback as (key: string, value: RegistryValue) => void,
      );
    } else if (event === "write") {
      this.listeners.write.push(
        callback as (key: string, value: RegistryValue) => void,
      );
    } else if (event === "delete") {
      this.listeners.delete.push(callback as (key: string) => void);
    }
  }
}

export class ChannelRegistry implements Registry {
  #channel: RefChannel;
  constructor(channel: RefChannel) {
    this.#channel = channel;
  }
  #lastId = 0;

  getId(): number {
    return ++this.#lastId;
  }

  listeners: {
    read: ((key: string, value: RegistryValue) => void)[];
    write: ((key: string, value: RegistryValue) => void)[];
    delete: ((key: string) => void)[];
  } = {
    read: [],
    write: [],
    delete: [],
  };

  on(
    event: "read" | "write" | "delete",
    callback:
      | ((key: string, value: RegistryValue) => void)
      | ((key: string) => void),
  ): void {
    if (event === "read") {
      this.listeners.read.push(
        callback as (key: string, value: RegistryValue) => void,
      );
    } else if (event === "write") {
      this.listeners.write.push(
        callback as (key: string, value: RegistryValue) => void,
      );
    } else if (event === "delete") {
      this.listeners.delete.push(callback as (key: string) => void);
    }
  }

  read(key: string): Promise<RegistryValue> {
    return new Promise<RegistryValue>((resolve, reject) => {
      const id = this.getId();
      const onResponse = (msg: RefChannelMessage) => {
        console.log("Debug: Received response for read:", msg);
        if (msg.id === id && msg.type === "response.get" && msg.key === key) {
          this.#channel.unsubscribe("read." + id);
          if (msg.value === undefined || msg.success === false) {
            reject(new Error(`Key "${key}" not found in registry.`));
          } else {
            this.listeners.read.forEach((callback) => {
              callback(key, msg.value!);
            });
            resolve(msg.value);
          }
        }
      };
      this.#channel.subscribe(onResponse, "read." + id);
      this.#channel.send({ type: "request.get", key, id });
    });
  }

  write(key: string, value: RegistryValue): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const id = this.getId();
      const onResponse = (msg: RefChannelMessage) => {
        if (msg.id === id && msg.type === "response.set") {
          this.#channel.unsubscribe("write." + id);
          if (msg.success) {
            this.listeners.write.forEach((callback) => {
              callback(key, value);
            });
            resolve();
          } else {
            reject(new Error(`Failed to write key "${key}" in registry.`));
          }
        }
      };
      this.#channel.subscribe(onResponse, "write." + id);
      this.#channel.send({ type: "request.set", key, value, id });
    });
  }

  async watch(
    key: string,
    callback: (newValue: RegistryValue) => void,
  ): Promise<void> {
    callback(await this.read(key));

    this.#channel.subscribe((msg: RefChannelMessage) => {
      if (msg.type === "request.set" && msg.key === key) {
        callback(msg.value);
      }
    }, "watch." + key);
  }

  wait(key: string, expectedValue: RegistryValue): Promise<void> {
    return new Promise<void>(async (resolve) => {
      if ((await this.read(key)) === expectedValue) {
        resolve();
        return;
      }

      const onChange = (newValue: RegistryValue) => {
        if (newValue === expectedValue) {
          this.#channel.unsubscribe("wait." + key);
          resolve();
        }
      };

      this.#channel.subscribe((msg: RefChannelMessage) => {
        if (msg.type === "request.set" && msg.key === key) {
          onChange(msg.value);
        }
      }, "wait." + key);
    });
  }

  delete(key: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const id = this.getId();
      const onResponse = (msg: RefChannelMessage) => {
        if (msg.id === id && msg.type === "response.delete") {
          this.#channel.unsubscribe("delete." + id);
          if (msg.success) {
            this.listeners.delete.forEach((callback) => {
              callback(key);
            });
            resolve();
          } else {
            reject(new Error(`Failed to delete key "${key}" in registry.`));
          }
        }
      };
      this.#channel.subscribe(onResponse, "delete." + id);
      this.#channel.send({ type: "request.delete", key, id });
    });
  }

  has(key: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const id = this.getId();
      const onResponse = (msg: RefChannelMessage) => {
        if (msg.id === id && msg.type === "response.get" && msg.key === key) {
          this.#channel.unsubscribe("has." + id);
          if (msg.value === undefined) {
            resolve(false);
          } else {
            resolve(true);
          }
        }
      };
      this.#channel.subscribe(onResponse, "has." + id);
      this.#channel.send({ type: "request.get", key, id });
    });
  }

  entries(): Promise<[string, RegistryValue][]> {
    return new Promise<[string, RegistryValue][]>((resolve, reject) => {
      const id = this.getId();
      const onResponse = (msg: RefChannelMessage) => {
        if (msg.id === id && msg.type === "response.list") {
          this.#channel.unsubscribe("list." + id);
          if (msg.entries === undefined) {
            reject(new Error(`Failed to list entries in registry.`));
          } else {
            resolve(msg.entries);
          }
        }
      };
      this.#channel.subscribe(onResponse, "list." + id);
      this.#channel.send({ type: "request.list", id });
    });
  }

  async keys(): Promise<string[]> {
    return (await this.entries()).map(([key]) => key);
  }

  async values(): Promise<RegistryValue[]> {
    return (await this.entries()).map(([, value]) => value);
  }
}

export interface API {
  name: string;
  populate(reg: Registry): Promise<void>;
}

type RefChannelMessageRequest =
  | { type: "request.get"; key: string }
  | {
      type: "request.set";
      key: string;
      value: RegistryValue | null;
    }
  | { type: "request.delete"; key: string }
  | { type: "request.list" };

type RefChannelMessageResponse = {
  success: boolean;
} & (
  | {
      type: "response.get";
      key: string;
      value?: RegistryValue | null;
    }
  | { type: "response.set"; key: string; value: RegistryValue | null }
  | { type: "response.delete"; key: string }
  | { type: "response.list"; entries?: [string, RegistryValue][] }
);

export type RefChannelMessage = { id: number } & (
  | RefChannelMessageRequest
  | RefChannelMessageResponse
);

export interface RefChannel {
  send(msg: RefChannelMessage): void;
  subscribe(cb: (msg: RefChannelMessage) => void, name?: string): void;
  unsubscribe(name: string): void;
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

function createListenerQueue<T>() {
  // const listeners: ((value: T) => void)[] = [];
  const listeners: Record<string, (value: T) => void> = {};
  let closed = false;

  return {
    push(value: T) {
      if (closed) throw new Error("Queue closed");
      for (const listener of Object.values(listeners)) {
        listener(value);
      }
    },
    close() {
      closed = true;
      Object.keys(listeners).forEach((name) => {
        delete listeners[name];
      });
    },
    on(
      cb: (value: T) => void,
      name: string = "anon." + Math.random().toString(36).substring(2, 8),
    ) {
      if (closed) throw new Error("Queue closed");
      listeners[name] = cb;
    },
    off(name: string) {
      delete listeners[name];
    },
  };
}

export function createPair(): [RefChannel, RefChannel] {
  const queueA = createListenerQueue<RefChannelMessage>();
  const queueB = createListenerQueue<RefChannelMessage>();

  const channelA: RefChannel = {
    send(msg) {
      queueB.push(msg);
    },
    subscribe(cb, name = "anon." + Math.random().toString(36).substring(2, 8)) {
      queueA.on(cb, name);
    },
    unsubscribe(name: string) {
      queueA.off(name);
    },
  };

  const channelB: RefChannel = {
    send(msg) {
      queueA.push(msg);
    },
    subscribe(cb, name = "anon." + Math.random().toString(36).substring(2, 8)) {
      queueB.on(cb, name);
    },
    unsubscribe(name: string) {
      queueB.off(name);
    },
  };

  return [channelA, channelB];
}

export function createBroadcastRefChannel(channelName: string): RefChannel {
  const bc = new BroadcastChannel(channelName);
  const queue = createListenerQueue<RefChannelMessage>();

  bc.onmessage = (ev) => {
    queue.push(ev.data as RefChannelMessage);
  };

  return {
    send(msg) {
      bc.postMessage(msg);
    },
    subscribe(cb, name = "anon." + Math.random().toString(36).substring(2, 8)) {
      queue.on(cb, name);
    },
    unsubscribe(name: string) {
      queue.off(name);
    },
  };
}

export function pipeChannel(
  source: RefChannel,
  destination: RefChannel,
): { stop: () => void } {
  let srcName = "pipe." + Math.random().toString(36).substring(2, 8);
  let destName = "pipe." + Math.random().toString(36).substring(2, 8);

  source.subscribe((msg) => {
    destination.send(msg);
  }, srcName);

  destination.subscribe((msg) => {
    source.send(msg);
  }, destName);

  return {
    stop() {
      source.unsubscribe(srcName);
      destination.unsubscribe(destName);
    },
  };
}

export function filterChannel(
  channel: RefChannel,
  filters: {
    get?: (key: string) => boolean;
    set?: (key: string, value: RegistryValue | null) => boolean;
    delete?: (key: string) => boolean;
  },
): RefChannel {
  const localSubscribers = new Map<string, (msg: any) => void>();
  const internalSubName = `__filter_internal_${Math.random()
    .toString(36)
    .substring(2, 8)}`;
  let underlyingSubscribed = false;

  const pendingListRequests = new Set<string>();

  function deliverToLocalSubscribers(msg: any) {
    for (const cb of localSubscribers.values()) {
      try {
        cb(msg);
      } catch (err) {
        console.error("filterChannel subscriber error:", err);
      }
    }
  }

  function handleIncomingFromRemote(msg: any) {
    if (msg?.type === "request.get" && filters.get?.(msg.key) === false) {
      channel.send({
        type: "response.get",
        key: msg.key,
        id: msg.id,
        success: false,
      });
      return;
    }

    if (
      msg?.type === "request.set" &&
      filters.set?.(msg.key, msg.value) === false
    ) {
      channel.send({
        type: "response.set",
        key: msg.key,
        value: msg.value,
        id: msg.id,
        success: false,
      });
      return;
    }

    if (msg?.type === "request.delete" && filters.delete?.(msg.key) === false) {
      channel.send({
        type: "response.delete",
        key: msg.key,
        id: msg.id,
        success: false,
      });
      return;
    }

    if (msg?.type === "request.list") {
      pendingListRequests.add(msg.id);
    }

    if (msg?.type === "response.list" && pendingListRequests.has(msg.id)) {
      pendingListRequests.delete(msg.id);

      if (Array.isArray(msg.entries) && filters.get) {
        msg = {
          ...msg,
          entries: msg.entries.filter(
            ([key, val]) => filters.get!(key) !== false,
          ),
        };
      }
    }

    deliverToLocalSubscribers(msg);
  }

  return {
    send(msg: any) {
      if (msg?.type === "request.get" && filters.get?.(msg.key) === false) {
        deliverToLocalSubscribers({
          type: "response.get",
          key: msg.key,
          id: msg.id,
          success: false,
        });
        return;
      }

      if (
        msg?.type === "request.set" &&
        filters.set?.(msg.key, msg.value) === false
      ) {
        deliverToLocalSubscribers({
          type: "response.set",
          key: msg.key,
          value: msg.value,
          id: msg.id,
          success: false,
        });
        return;
      }

      if (
        msg?.type === "request.delete" &&
        filters.delete?.(msg.key) === false
      ) {
        deliverToLocalSubscribers({
          type: "response.delete",
          key: msg.key,
          id: msg.id,
          success: false,
        });
        return;
      }

      if (msg?.type === "request.list") {
        pendingListRequests.add(msg.id);
      }

      if (msg?.type === "response.list" && pendingListRequests.has(msg.id)) {
        pendingListRequests.delete(msg.id);

        if (Array.isArray(msg.entries) && filters.get) {
          msg = {
            ...msg,
            entries: msg.entries.filter(
              ([key, val]) => filters.get!(key) !== false,
            ),
          };
        }
      }

      channel.send(msg);
    },

    subscribe(
      cb: (msg: any) => void,
      name: string = "anon." + Math.random().toString(36).substring(2, 8),
    ) {
      localSubscribers.set(name, cb);

      if (!underlyingSubscribed) {
        underlyingSubscribed = true;
        channel.subscribe(handleIncomingFromRemote, internalSubName);
      }
    },

    unsubscribe(name: string) {
      if (name) localSubscribers.delete(name);
      if (localSubscribers.size === 0 && underlyingSubscribed) {
        channel.unsubscribe(internalSubName);
        underlyingSubscribed = false;
      }
    },
  };
}
