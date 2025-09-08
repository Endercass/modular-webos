import type { Registry, RegistryValue } from "../openv/registry";

export class IDBRegistry implements Registry {
  constructor(
    private dbName: string = "webos",
    private storeName: string = "registry",
  ) {
    const request = indexedDB.open(this.dbName, 1);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(this.storeName)) {
        db.createObjectStore(this.storeName);
      }
    };
    request.onerror = (event) => {
      console.error(
        "IndexedDB error:",
        (event.target as IDBOpenDBRequest).error,
      );
    };
  }

  #db: IDBDatabase | null = null;

  private async getDB(): Promise<IDBDatabase> {
    this.#db ||= await new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        resolve(db);
      };
      request.onerror = (event) => {
        reject((event.target as IDBOpenDBRequest).error);
      };
    });

    return this.#db!;
  }

  listeners: {
    read: ((key: string, value: any) => void)[];
    write: ((key: string, value: any) => void)[];
    delete: ((key: string) => void)[];
  } = {
    read: [],
    write: [],
    delete: [],
  };

  on(
    event: "read" | "write" | "delete",
    callback: ((key: string, value: any) => void) | ((key: string) => void),
  ): void {
    if (event === "read") {
      this.listeners.read.push(callback as (key: string, value: any) => void);
    } else if (event === "write") {
      this.listeners.write.push(callback as (key: string, value: any) => void);
    } else if (event === "delete") {
      this.listeners.delete.push(callback as (key: string) => void);
    }
  }

  async read(key: string): Promise<any> {
    const db = await this.getDB();
    return new Promise<any>((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readonly");
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.get(key);
      request.onsuccess = (event) => {
        const result = (event.target as IDBRequest).result;
        if (result === undefined) {
          reject(new Error(`Key "${key}" not found in registry.`));
        } else {
          this.listeners.read.forEach((callback) => {
            callback(key, result);
          });
          resolve(result);
        }
      };
      request.onerror = (event) => {
        reject((event.target as IDBRequest).error);
      };
    });
  }

  async write(key: string, value: any): Promise<void> {
    const db = await this.getDB();
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readwrite");
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.put(value, key);
      request.onsuccess = () => {
        this.listeners.write.forEach((callback) => {
          callback(key, value);
        });
        resolve();
      };
      request.onerror = (event) => {
        reject((event.target as IDBRequest).error);
      };
    });
  }

  async delete(key: string): Promise<void> {
    const db = await this.getDB();
    return new Promise<void>((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readwrite");
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.delete(key);
      request.onsuccess = () => {
        this.listeners.delete.forEach((callback) => {
          callback(key);
        });
        resolve();
      };
      request.onerror = (event) => {
        reject((event.target as IDBRequest).error);
      };
    });
  }

  async has(key: string): Promise<boolean> {
    const db = await this.getDB();
    return new Promise<boolean>((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readonly");
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.getKey(key);
      request.onsuccess = (event) => {
        const result = (event.target as IDBRequest).result;
        resolve(result !== undefined);
      };
      request.onerror = (event) => {
        reject((event.target as IDBRequest).error);
      };
    });
  }

  async keys(): Promise<string[]> {
    const db = await this.getDB();
    return new Promise<string[]>((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readonly");
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.getAllKeys();
      request.onsuccess = (event) => {
        const result = (event.target as IDBRequest).result;
        resolve(result as string[]);
      };
      request.onerror = (event) => {
        reject((event.target as IDBRequest).error);
      };
    });
  }

  async values(): Promise<RegistryValue[]> {
    const db = await this.getDB();
    return new Promise<RegistryValue[]>((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readonly");
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.getAll();
      request.onsuccess = (event) => {
        const result = (event.target as IDBRequest).result;
        resolve(result as RegistryValue[]);
      };
      request.onerror = (event) => {
        reject((event.target as IDBRequest).error);
      };
    });
  }

  async entries(): Promise<[string, RegistryValue][]> {
    const db = await this.getDB();
    return new Promise<[string, RegistryValue][]>((resolve, reject) => {
      const transaction = db.transaction([this.storeName], "readonly");
      const objectStore = transaction.objectStore(this.storeName);
      const request = objectStore.getAllKeys();
      request.onsuccess = (event) => {
        const keys = (event.target as IDBRequest).result as string[];
        const valuesRequest = objectStore.getAll();
        valuesRequest.onsuccess = (event) => {
          const values = (event.target as IDBRequest).result as RegistryValue[];
          const entries: [string, RegistryValue][] = keys.map((key, index) => [
            key,
            values[index],
          ]);
          resolve(entries);
        };
        valuesRequest.onerror = (event) => {
          reject((event.target as IDBRequest).error);
        };
      };
      request.onerror = (event) => {
        reject((event.target as IDBRequest).error);
      };
    });
  }

  async watch(
    key: string,
    callback: (newValue: RegistryValue) => void,
  ): Promise<void> {
    this.listeners.write.push((changedKey, newValue) => {
      if (changedKey === key) {
        callback(newValue);
      }
    });
    callback(await this.read(key).catch(() => null));
  }

  wait(key: string, expectedValue: RegistryValue): Promise<void> {
    return new Promise<void>(async (resolve) => {
      if ((await this.read(key).catch(() => null)) === expectedValue) {
        resolve();
        return;
      }

      const onChange = (newValue: RegistryValue) => {
        if (newValue === expectedValue) {
          this.listeners.write = this.listeners.write.filter(
            (cb) => cb !== onChangeWrapper,
          );
          resolve();
        }
      };

      const onChangeWrapper = (changedKey: string, newValue: RegistryValue) => {
        if (changedKey === key) {
          onChange(newValue);
        }
      };

      this.listeners.write.push(onChangeWrapper);
    });
  }
}
