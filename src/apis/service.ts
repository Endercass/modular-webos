import { type RegistryValue } from "../registry";
import { type WebOS } from "../webos";
import { type API } from "./api";
import { type IPCApi } from "./ipc";

export class ServiceApi implements API {
  name = "me.endercass.service";
  os: WebOS;

  async populate(os: WebOS): Promise<void> {
    this.os = os;
  }

  async defineAnycastFunction<
    T extends (...args: RegistryValue[]) => Promise<RegistryValue>,
  >(
    name: string,
    executorId: number,
    func: T,
    namespace: string = "default",
    options: {
      root?: string;
      bufferLength?: number;
    } = {},
  ) {
    options.bufferLength ??= 10;
    options.root ??= this.name + ".function";
    let ids: number[] = [];

    try {
      ids = await this.os.registry.read(
        `${options.root}.${namespace}.${name}.anycast`,
      );
    } catch {}

    if (!ids.includes(executorId)) {
      ids.push(executorId);
    }

    await this.defineFunction(`${name}$${executorId}`, func, namespace, {
      root: options.root,
      bufferLength: options.bufferLength,
    });

    this.os.registry.write(`${options.root}.${namespace}.${name}.anycast`, ids);
  }

  async defineFunction<
    T extends (...args: RegistryValue[]) => Promise<RegistryValue>,
  >(
    name: string,
    func: T,
    namespace: string = "default",
    options: {
      root?: string;
      bufferLength?: number;
    } = {},
  ): Promise<void> {
    options.bufferLength ??= 10;
    options.root ??= this.name + ".function";
    if (typeof name !== "string" || name.length === 0) {
      throw new Error("Function name must be a non-empty string.");
    }
    if (typeof func !== "function") {
      throw new Error("Provided value must be a function.");
    }

    const ipc = this.os.getAPI<IPCApi>("me.endercass.ipc");
    try {
      await ipc.clear(name + ".call", namespace, {
        root: options.root,
      });
    } catch {}

    await ipc.listen(
      name + ".call",
      async (callMessage: RegistryValue) => {
        callMessage = callMessage as {
          args: RegistryValue[];
          transactionId: string;
        };

        if (!Array.isArray(callMessage.args)) {
          throw new Error("Arguments must be an array.");
        }
        if (
          !callMessage.transactionId ||
          typeof callMessage.transactionId !== "string"
        ) {
          throw new Error("Transaction ID must be a string.");
        }

        let result: {
          response?: RegistryValue;
          error?: string;
          transactionId: string;
        };
        try {
          result = {
            response: await func(...callMessage.args),
            transactionId: callMessage.transactionId,
          };
        } catch (error) {
          console.error(`Error in function ${name}:`, error);
          result = {
            error: error instanceof Error ? error.message : String(error),
            transactionId: callMessage.transactionId,
          };
        }
        try {
          await ipc.send(name + ".response", result, namespace, {
            root: options.root,
          });
        } catch (e) {
          console.debug(
            `Cannot send message to channel, this can happen if a call is sent without listening to the response channel. This is not an error.`,
            e,
          );
        }
      },
      namespace,
      {
        root: options.root,
        bufferLength: options.bufferLength,
      },
    );
  }

  async defineGenerator<
    T extends (...args: RegistryValue[]) => AsyncGenerator<RegistryValue>,
  >(
    name: string,
    func: T,
    namespace: string = "default",
    options: {
      root?: string;
      bufferLength?: number;
    } = {},
  ): Promise<void> {
    options.root ??= this.name + ".function";
    options.bufferLength ??= 10;

    if (typeof name !== "string" || name.length === 0) {
      throw new Error("Function name must be a non-empty string.");
    }
    if (typeof func !== "function") {
      throw new Error("Provided value must be a function.");
    }
    const ipc = this.os.getAPI<IPCApi>("me.endercass.ipc");
    try {
      await ipc.clear(name + ".call", namespace, {
        root: options.root,
      });
    } catch {}

    await this.defineFunction(
      name + ".generator",
      async (...args: RegistryValue[]) => {
        const generatorId = crypto.randomUUID();
        const generator = func(...args);

        await this.defineFunction(
          name + `.generator.${generatorId}.next`,
          (async () => {
            const { value, done } = await generator.next();
            if (done) {
              // clean up, intentionally not awaited
              this.os.registry.delete(
                `${options.root}.${namespace}.${name}.generator.${generatorId}.next`,
              );
            }
            return { value, done };
          }) as any,
          namespace,
          {
            root: options.root,
            bufferLength: options.bufferLength,
          },
        );

        return generatorId;
      },
      namespace,
      {
        root: options.root,
        bufferLength: options.bufferLength,
      },
    );
  }

  async *callGenerator(
    name: string,
    args: RegistryValue[] = [],
    namespace: string = "default",
    options: {
      root?: string;
      bufferLength?: number;
    } = {},
  ): AsyncGenerator<RegistryValue> {
    options.root ??= this.name + ".function";
    options.bufferLength ??= 10;
    if (typeof name !== "string" || name.length === 0) {
      throw new Error("Function name must be a non-empty string.");
    }
    if (!Array.isArray(args)) {
      throw new Error("Arguments must be an array.");
    }
    const generatorId = (await this.callFunction(
      `${name}.generator`,
      args,
      namespace,
      {
        root: options.root,
        bufferLength: options.bufferLength,
      },
    )) as string;

    yield* {
      [Symbol.asyncIterator]: () => ({
        next: async () => {
          const result = (await this.callFunction(
            `${name}.generator.${generatorId}.next`,
            [],
            namespace,
            {
              root: options.root,
              bufferLength: options.bufferLength,
            },
          )) as { value: RegistryValue; done: boolean };
          return result;
        },
      }),
    };

    // while (true) {
    //   const result = (await this.callFunction(
    //     `${name}.generator.${generatorId}.next`,
    //     [],
    //     namespace,
    //     {
    //       root: options.root,
    //       bufferLength: options.bufferLength,
    //     },
    //   )) as { value: RegistryValue; done: boolean };
    //   if (result.done) {
    //     break;
    //   }
    //   yield result.value;
    // }
  }

  async callFunction(
    name: string,
    args: RegistryValue[] = [],
    namespace: string = "default",
    options: {
      root?: string;
      bufferLength?: number;
    } = {},
  ): Promise<RegistryValue> {
    options.root ??= this.name + ".function";
    options.bufferLength ??= 10;
    if (typeof name !== "string" || name.length === 0) {
      throw new Error("Function name must be a non-empty string.");
    }
    if (!Array.isArray(args)) {
      throw new Error("Arguments must be an array.");
    }

    try {
      const ids = await this.os.registry.read(
        `${options.root}.${namespace}.${name}.anycast`,
      );
      this.os.registry.write(`${options.root}.${namespace}.${name}.anycast`, [
        ...ids.slice(1),
        ids[0],
      ]);

      return await this.callFunction(`${name}$${ids[0]}`, args, namespace, {
        root: options.root,
        bufferLength: options.bufferLength,
      });
    } catch {}

    const ipc = this.os.getAPI<IPCApi>("me.endercass.ipc");
    const transactionId = crypto.randomUUID();

    let resolve;
    let reject;
    const promise = new Promise<RegistryValue>((res, rej) => {
      resolve = res;
      reject = rej;
    });

    await ipc.listen(
      name + ".response",
      (response: RegistryValue) => {
        if (!response) {
          throw new Error(`No response received for function ${name}.`);
        }
        response = response as {
          response?: RegistryValue;
          error?: string;
          transactionId: string;
        };
        if (response.transactionId !== transactionId) {
          return;
        }
        if (response.error) {
          reject(
            new Error(`Error calling function ${name}: ${response.error}`),
          );
          return;
        }
        resolve(response.response);
      },
      namespace,
      {
        root: options.root,
        bufferLength: options.bufferLength,
      },
    );

    await ipc.send(name + ".call", { args, transactionId }, namespace, {
      root: options.root,
    });

    return promise;
  }

  async undefineFunction(
    name: string,
    namespace: string = "default",
    options: {
      root?: string;
    } = {},
  ) {
    options.root ??= this.name + ".function";
    if (typeof name !== "string" || name.length === 0) {
      throw new Error("Function name must be a non-empty string.");
    }
    try {
      await this.os.registry.delete(
        `${options.root}.${namespace}.${name}.anycast`,
      );
      return;
    } catch {}

    const ipc = this.os.getAPI<IPCApi>("me.endercass.ipc");
    try {
      await ipc.clear(name + ".call", namespace, {
        root: options.root,
      });
    } catch {}
    try {
      await ipc.clear(name + ".response", namespace, {
        root: options.root,
      });
    } catch {}

    await this.os.registry.delete(`${options.root}.${namespace}.${name}.call`);
    await this.os.registry.delete(
      `${options.root}.${namespace}.${name}.response`,
    );
  }

  async undefineGenerator(
    name: string,
    namespace: string = "default",
    options: {
      root?: string;
    } = {},
  ) {
    options.root ??= this.name + ".function";
    if (typeof name !== "string" || name.length === 0) {
      throw new Error("Function name must be a non-empty string.");
    }
    const ipc = this.os.getAPI<IPCApi>("me.endercass.ipc");
    try {
      await ipc.clear(name + ".call", namespace, {
        root: options.root,
      });
    } catch {}
    try {
      await ipc.clear(name + ".response", namespace, {
        root: options.root,
      });
    } catch {}
    await this.os.registry.delete(`${options.root}.${namespace}.${name}.call`);
    await this.os.registry.delete(
      `${options.root}.${namespace}.${name}.response`,
    );
    const all = await this.os.registry.keys();
    await Promise.all(
      all
        .filter((k) =>
          k.startsWith(`${options.root}.${namespace}.${name}.generator.`),
        )
        .map((k) => this.os.registry.delete(k)),
    );
  }

  async clearFunctions(
    namespace: string = "default",
    options: {
      root?: string;
    } = {},
  ) {
    options.root ??= this.name + ".function";
    const all = await this.os.registry.keys();
    await Promise.all(
      all
        .filter((k) => k.startsWith(`${options.root}.${namespace}`))
        .map((k) => this.os.registry.delete(k)),
    );
  }
}
