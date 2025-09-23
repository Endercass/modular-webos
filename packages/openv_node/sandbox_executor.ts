import ivm from "isolated-vm";
import type ServerApi from "../api/party/openv/server/mod";
import {
  OpEnv,
  RefChannel,
  createListenerQueue,
  RefChannelMessage,
} from "../openv/mod";
import type FsApi from "../api/party/openv/fs/mod";
import { readFile } from "node:fs/promises";

export async function createSandboxExecutor(
  options: {
    openvModulePath?: string;
    resolveModulePath?: string;
    fsModulePath?: string;
  } = {},
): Promise<
  (openv: OpEnv, pid: number, args: [string, ...string[]]) => Promise<any>
> {
  const {
    openvModulePath = "./openv.bundle.js",
    resolveModulePath = "./party.openv.resolve.bundle.js",
    fsModulePath = "./party.openv.fs.bundle.js",
  } = options;
  const openvPath = import.meta.resolve(openvModulePath).replace("file://", "");
  const openvCode = (await readFile(openvPath)).toString();
  const resolvePath = import.meta
    .resolve(resolveModulePath)
    .replace("file://", "");
  const resolveCode = (await readFile(resolvePath)).toString();
  const fsPath = import.meta.resolve(fsModulePath).replace("file://", "");
  const fsCode = (await readFile(fsPath)).toString();

  return async (openv: OpEnv, pid: number, args: [string, ...string[]]) => {
    const server = openv.getAPI<ServerApi>("party.openv.server");

    const qa = createListenerQueue<RefChannelMessage>();
    const qb = createListenerQueue<RefChannelMessage>();

    const serverChannel: RefChannel = {
      send(msg) {
        qb.push(msg);
      },
      subscribe(
        cb,
        name = "anon." + Math.random().toString(36).substring(2, 8),
      ) {
        qa.on(cb, name);
      },
      unsubscribe(name: string) {
        qa.off(name);
      },
    };

    const { stop } = await server.serve(serverChannel);

    const isolate = new ivm.Isolate();
    const context = await isolate.createContext();
    const jail = context.global;
    await jail.set("global", jail.derefInto());
    await jail.set("globalThis", jail.derefInto());
    await jail.set("pid", pid, { copy: true });
    await jail.set("args", args, { copy: true });

    await jail.set(
      "console",
      {
        log: function (...args: any[]) {
          console.log(...args);
        },
        error: function (...args: any[]) {
          console.error(...args);
        },
        warn: function (...args: any[]) {
          console.warn(...args);
        },
        info: function (...args: any[]) {
          console.info(...args);
        },
        debug: function (...args: any[]) {
          console.debug(...args);
        },
      },
      { reference: true },
    );

    await jail.set("print", function (...args) {
      console.log(...args); // This will log to the main Node.js console
    });
    await jail.set("println", function (...args) {
      console.log(...args); // This will log to the main Node.js console
    });
    await jail.set("eprint", function (...args) {
      console.error(...args); // This will log to the main Node.js console
    });
    await jail.set("eprintln", function (...args) {
      console.error(...args); // This will log to the main Node.js console
    });

    await jail.set("openv_send", function (msg: any) {
      qb.push(msg);
    });

    qa.on(async (msg) => {
      const func = await jail.get("openv_recv", { reference: true });
      await func!.apply(undefined, [msg], {
        arguments: { copy: true },
        async: true,
      });
    }, "openv_recv");

    const openvModule = await isolate.compileModule(openvCode, {
      filename: "openv.bundle.js",
    });
    await openvModule.instantiate(context, (specifier, referencingModule) => {
      // no resolution for now
      throw new Error("Module resolution not yet supported");
    });
    await openvModule.evaluate();

    const fsModule = await isolate.compileModule(fsCode, {
      filename: "party.openv.fs.bundle.js",
    });
    await fsModule.instantiate(context, (specifier, referencingModule) => {
      if (specifier === "./openv.bundle.js") return openvModule;
      throw new Error("Module resolution not yet supported");
    });
    await fsModule.evaluate();

    const resolveModule = await isolate.compileModule(resolveCode, {
      filename: "party.openv.resolve.bundle.js",
    });
    await resolveModule.instantiate(context, (specifier, referencingModule) => {
      if (specifier === "./openv.bundle.js") return openvModule;
      if (specifier === "./party.openv.fs.bundle.js") return fsModule;
      throw new Error("Module resolution not yet supported");
    });
    await resolveModule.evaluate();

    const initModule = await isolate.compileModule(`
    import { createListenerQueue, OpEnv, ChannelRegistry } from "./openv.bundle.js";
    import ResolveApi, { ApiResolver } from "./party.openv.resolve.bundle.js";
    import FsApi from "./party.openv.fs.bundle.js";
    println("Sandbox initialized with PID", pid);
    let q = createListenerQueue();

    global.openv_recv = (msg) => {
        q.push(msg);
    };

    global.openv = new OpEnv(new ChannelRegistry({
        send(msg) {
            global.openv_send(msg);
        },
        subscribe(cb, name = "anon." + Math.random().toString(36).substring(2, 8)) {
            q.on(cb, name);
        },
        unsubscribe(name) {
            q.off(name);
        }
    }));

    global.env = { PID: pid };

    await global.openv.installAPI(new ResolveApi());
    await global.openv.installAPI(new FsApi());
    await global.openv.getAPI("party.openv.resolve").register("api", new ApiResolver());
    `);
    await initModule.instantiate(context, (specifier) => {
      if (specifier === "./openv.bundle.js") return openvModule;
      if (specifier === "./party.openv.fs.bundle.js") return fsModule;
      if (specifier === "./party.openv.resolve.bundle.js") return resolveModule;
      throw new Error("Module resolution not yet supported");
    });
    await initModule.evaluate();

    const scriptModule = await isolate.compileModule(
      await openv
        .getAPI<FsApi>("party.openv.fs")
        .readFile(args[0])
        .then((buf) => buf.text()),
    );

    await scriptModule.instantiate(context, (specifier, referencingModule) => {
      throw new Error("Module resolution not yet supported");
    });
    await scriptModule.evaluate();

    console.log("Running main function...");

    const fn = await scriptModule.namespace.get("main", { reference: true });
    if (!fn) throw new Error("No main function exported");
    const res = await fn.apply(undefined, [args], {
      arguments: { copy: true },
      async: true,
      result: { copy: true, promise: true },
    });
    stop();
    return res ?? -103;
  };
}
