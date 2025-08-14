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

    ipc.listen(
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

    ipc.send(name + ".call", { args, transactionId }, namespace, {
      root: options.root,
    });

    return promise;
  }
}
