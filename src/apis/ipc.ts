import { type RegistryValue } from "../registry";
import { type WebOS } from "../webos";
import { type API } from "./api";

export class IPCApi implements API {
  name = "me.endercass.ipc";
  os: WebOS;

  async populate(os: WebOS): Promise<void> {
    this.os = os;
  }

  async listen(
    channelName: string,
    callback: (message: RegistryValue) => void,
    namespace: string = "default",
    options: {
      bufferLength?: number;
      root?: string;
    } = {},
  ): Promise<void> {
    options.bufferLength ??= 10;
    options.root ??= this.name + ".channel";
    try {
      await this.os.registry.read(
        `${options.root}.${namespace}.${channelName}`,
      );
    } catch {
      await this.os.registry.write(
        `${options.root}.${namespace}.${channelName}`,
        [],
      );
    }
    await this.setOptions(channelName, options, namespace);

    await this.os.registry.watch(
      `${options.root}.${namespace}.${channelName}`,
      async (messages: RegistryValue) => {
        if (!Array.isArray(messages)) {
          throw new Error(`Channel "${channelName}" must be an array.`);
        }
        if (
          messages.length >
          (await this.os.registry.read(
            `${options.root}.${namespace}.${channelName}.bufferLength`,
          ))
        ) {
          await this.os.registry.write(
            `${options.root}.${namespace}.${channelName}`,
            [messages[messages.length - 1]],
          );
          // This will be called again with the last message
          return;
        }
        if (messages.length === 0) {
          return;
        }
        callback(messages[messages.length - 1]);
      },
    );
  }

  async send(
    channelName: string,
    message: RegistryValue,
    namespace: string = "default",
    options: {
      root?: string;
    } = {},
  ): Promise<void> {
    options.root ??= this.name + ".channel";
    if (
      !(await this.os.registry.has(
        `${options.root}.${namespace}.${channelName}`,
      ))
    ) {
      throw new Error(`Channel "${channelName}" does not exist.`);
    }
    let messages: RegistryValue[] = await this.os.registry.read(
      `${options.root}.${namespace}.${channelName}`,
    );
    if (!Array.isArray(messages)) {
      messages = [];
    }

    messages.push(message);
    await this.os.registry.write(
      `${options.root}.${namespace}.${channelName}`,
      messages,
    );
  }

  async clear(
    channelName: string,
    namespace: string = "default",
    options: {
      root?: string;
    } = {},
  ): Promise<void> {
    options.root ??= this.name + ".channel";
    if (
      !(await this.os.registry.has(
        `${options.root}.${namespace}.${channelName}`,
      ))
    ) {
      throw new Error(`Channel "${channelName}" does not exist.`);
    }
    await this.os.registry.write(
      `${options.root}.${namespace}.${channelName}`,
      [],
    );
  }

  async setOptions(
    channelName: string,
    options: { bufferLength?: number; root?: string } = {},
    namespace: string = "default",
  ): Promise<void> {
    options.root ??= this.name + ".channel";
    if (
      !(await this.os.registry.has(
        `${options.root}.${namespace}.${channelName}`,
      ))
    ) {
      throw new Error(
        `Channel "${channelName}" does not exist in namespace "${namespace}".`,
      );
    }
    options.bufferLength ??= 10;
    await this.os.registry.write(
      `${options.root}.${namespace}.${channelName}.bufferLength`,
      options.bufferLength,
    );
  }
}
