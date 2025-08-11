import { RefChannel, RefChannelMessage } from "./channel";
import { Registry, RegistryValue } from "./registry";

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
