import {
  createListenerQueue,
  type RegistryValue,
  type OpEnv,
  type API,
} from "../../../../openv/mod";
import type { ServerApi } from "../server/mod";
import type { ServiceApi } from "../service/mod";

export class ProcessesApi implements API {
  name = "party.openv.processes";
  openv: OpEnv;

  async newPid(options: { root?: string } = {}): Promise<number> {
    options.root ??= this.name;
    let pid = 0;
    try {
      pid = (await this.openv.registry.read(`${options.root}.lastPid`)) + 1;
    } catch { }

    await this.openv.registry.write(`${options.root}.lastPid`, pid);

    return pid;
  }

  async populate(openv: OpEnv): Promise<void> {
    this.openv = openv;
  }

  async execute(
    args: [string, ...string[]],
    id?: number,
    options: {
      root?: string;
    } = {},
  ): Promise<number> {
    options.root ??= this.name;

    const services = this.openv.getAPI<ServiceApi>("party.openv.service");

    let res = await services.callFunction(
      typeof id !== "undefined" ? `execute$${id}` : "execute",
      [args],
      "default",
      {
        root: options.root + ".function",
      },
    );
    if (typeof res !== "number") {
      console.trace("Invalid return value from process api:", res);
      res = -102;
    }
    return res;
  }

  async start() {
    let lastPid = 0;
    try {
      lastPid = await this.openv.registry.read(`${this.name}.lastPid`);
    } catch { }
    for (let i = 0; i <= lastPid; i++) {
      try {
        await this.openv.registry.delete(`${this.name}.${i}.args`);
        await this.openv.registry.delete(`${this.name}.${i}.cwd`);
        await this.openv.registry.delete(`${this.name}.${i}.pid`);
      } catch { }
    }

    await this.openv.registry.write(`${this.name}.lastPid`, 0);
    const services = this.openv.getAPI<ServiceApi>("party.openv.service");

    await services.clearFunctions("default", {
      root: this.name + ".function",
    });
  }

  async join(
    id: number,
    executor: (openv: OpEnv, pid: number, args: [string, ...string[]]) => Promise<number>,
    options: {
      root?: string;
    } = {},
  ) {
    options.root ??= this.name;

    const services = this.openv.getAPI<ServiceApi>("party.openv.service");
    await services.defineAnycastFunction(
      "execute",
      id,
      async (args: RegistryValue) => {
        if (
          Object.is(args, null) ||
          !Array.isArray(args) ||
          args[0].length < 1 ||
          typeof args[0] !== "string"
        ) {
          console.trace("Missing vital process argument! Passed args:", args);
          return -101;
        }
        const pid = await this.newPid();

        await this.openv.registry.write(`${options.root}.${pid}.pid`, pid);
        await this.openv.registry.write(`${options.root}.${pid}.args`, args);

        return await executor(this.openv, pid, args as [string, ...string[]]);
      },
      "default",
      {
        root: options.root + ".function",
      },
    );
  }

  async getCwd(
    pid?: number,
    options: {
      root?: string;
    } = {},
  ) {
    options.root ??= this.name;
    if (typeof pid !== "number") {
      if (!("env" in window) || !("PID" in (window.env as any))) {
        throw new Error("Could not assume PID outside of a process!");
      }
      pid = (window.env as any).PID;
    }

    let cwd: string = "/";
    try {
      cwd = await this.openv.registry.read(`${options.root}.${pid}.cwd`);
    } catch {
      await this.openv.registry.write(`${options.root}.${pid}.cwd`, cwd);
    }

    return cwd;
  }

  async getArgs(
    pid?: number,
    options: {
      root?: string;
    } = {},
  ) {
    options.root ??= this.name;
    if (typeof pid !== "number") {
      if (!("env" in window) || !("PID" in (window.env as any))) {
        throw new Error("Could not assume PID outside of a process!");
      }
      pid = (window.env as any).PID;
    }

    return await this.openv.registry.read(`${options.root}.${pid}.args`);
  }
}
