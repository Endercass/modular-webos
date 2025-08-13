import { type Registry, type RegistryValue } from "../registry";
import { type WebOS } from "../webos";
import { API } from "./api";

export class IPCApi implements API {
  name = "me.endercass.ipc";
  root = this.name + ".channel";
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
    } = {},
  ): Promise<void> {
    options.bufferLength ??= 10;
    await this.os.registry.write(
      `${this.root}.${namespace}.${channelName}`,
      [],
    );
    await this.setOptions(channelName, options);

    await this.os.registry.watch(
      `${this.root}.${namespace}.${channelName}`,
      async (messages: RegistryValue) => {
        if (!Array.isArray(messages)) {
          throw new Error(`Channel "${channelName}" must be an array.`);
        }
        if (
          messages.length >
          (await this.os.registry.read(
            `${this.root}.${namespace}.${channelName}.bufferLength`,
          ))
        ) {
          await this.os.registry.write(
            `${this.root}.${namespace}.${channelName}`,
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
  ): Promise<void> {
    if (
      !(await this.os.registry.has(`${this.root}.${namespace}.${channelName}`))
    ) {
      throw new Error(`Channel "${channelName}" does not exist.`);
    }
    let messages: RegistryValue[] = await this.os.registry.read(
      `${this.root}.${namespace}.${channelName}`,
    );

    if (!Array.isArray(messages)) {
      messages = [];
    }

    messages.push(message);
    await this.os.registry.write(
      `${this.root}.${namespace}.${channelName}`,
      messages,
    );
  }

  async clear(
    channelName: string,
    namespace: string = "default",
  ): Promise<void> {
    if (
      !(await this.os.registry.has(`${this.root}.${namespace}.${channelName}`))
    ) {
      throw new Error(`Channel "${channelName}" does not exist.`);
    }
    await this.os.registry.write(
      `${this.root}.${namespace}.${channelName}`,
      [],
    );
  }

  async setOptions(
    channelName: string,
    options: { bufferLength?: number } = {},
    namespace: string = "default",
  ): Promise<void> {
    if (
      !(await this.os.registry.has(`${this.root}.${namespace}.${channelName}`))
    ) {
      throw new Error(
        `Channel "${channelName}" does not exist in namespace "${namespace}".`,
      );
    }
    options.bufferLength ??= 10;
    await this.os.registry.write(
      `${this.root}.${namespace}.${channelName}.bufferLength`,
      options.bufferLength,
    );
    await this.clear(channelName, namespace);
  }
}
