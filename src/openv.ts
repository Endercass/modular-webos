import { type API } from "./apis/api.ts";
import { type Registry } from "./registry.ts";

export class OpEnv {
  #reg: Registry;
  api: {
    [key: string]: API;
  } = {};

  constructor(reg: Registry) {
    this.#reg = reg;
  }

  async installAPI(api: API): Promise<void> {
    if (typeof api.name !== "string" || api.name.length === 0) {
      throw new Error("API must have a valid name.");
    }
    if (this.api[api.name]) {
      throw new Error(`API "${api.name}" is already installed.`);
    }

    this.api[api.name] = api;
    await api.populate(this);
  }
  // Helper to typecast the API
  getAPI<T extends API>(name: string): T {
    const api = this.api[name];
    if (!api) {
      throw new Error(`API "${name}" is not installed.`);
    }
    return api as T;
  }

  get registry(): Registry {
    return this.#reg;
  }
}
