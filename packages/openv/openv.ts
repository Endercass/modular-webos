import type { API } from "./api.ts";
import type { Registry } from "./registry.ts";

export class OpEnv {
  #reg: Registry;
  #apiStringHandlers: ((api: string) => Promise<API>)[] = [];
  api: {
    [key: string]: API;
  } = {};

  constructor(reg: Registry) {
    this.#reg = reg;
  }

  async installAPI(api: API | string): Promise<void> {
    if (typeof api === "string") {
      const apiString: string = api;
      try {
        api = (await Promise.any(
          this.#apiStringHandlers.map((handler) => handler(apiString)),
        )) as API;
      } catch (e) {
        console.error(e);
        throw new Error(
          `No handler could process the API string: ${apiString}`,
        );
      }
    }

    if (typeof api.name !== "string" || api.name.length === 0) {
      throw new Error("API must have a valid name.");
    }
    if (this.api[api.name]) {
      throw new Error(`API "${api.name}" is already installed.`);
    }

    this.api[api.name] = api;
    await api.initialize(this);
  }
  // Helper to typecast the API
  getAPI<T extends API>(name: string): T {
    const api = this.api[name];
    if (!api) {
      throw new Error(`API "${name}" is not installed.`);
    }
    return api as T;
  }

  handleAPIString(handler: (api: string) => Promise<API>): void {
    this.#apiStringHandlers.push(handler);
  }

  get registry(): Registry {
    return this.#reg;
  }
}
