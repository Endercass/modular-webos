import { ref, type Ref } from "./ref";
import { type RegistryValue, type Registry } from "./registry.ts";

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
