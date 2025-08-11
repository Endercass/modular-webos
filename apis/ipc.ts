import { type Registry, type RegistryValue } from "../registry";
import { API } from "./api";

export class IPCApi implements API {
  name = "me.endercass.ipc";
  registry: Registry;

  async populate(registry: Registry): Promise<void> {
    this.registry = registry;
  }

  async listen(
    channelName: string,
    callback: (message: RegistryValue) => void,
    options: {
      bufferLength?: number;
    } = {},
  ): Promise<void> {
    options.bufferLength ??= 10;
    await this.registry.write("me.endercass.ipc.channel." + channelName, []);
    await this.setOptions(channelName, options);

    await this.registry.watch(
      "me.endercass.ipc.channel." + channelName,
      async (messages: RegistryValue) => {
        if (!Array.isArray(messages)) {
          throw new Error(`Channel "${channelName}" must be an array.`);
        }
        if (
          messages.length >
          (await this.registry.read(
            "me.endercass.ipc.channel." + channelName + ".bufferLength",
          ))
        ) {
          await this.registry.write("me.endercass.ipc.channel." + channelName, [
            messages[messages.length - 1],
          ]);
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

  async send(channelName: string, message: RegistryValue): Promise<void> {
    const channelKey = "me.endercass.ipc.channel." + channelName;
    if (!(await this.registry.has(channelKey))) {
      throw new Error(`Channel "${channelName}" does not exist.`);
    }
    let messages: RegistryValue[] = await this.registry.read(channelKey);

    if (!Array.isArray(messages)) {
      messages = [];
    }

    messages.push(message);
    await this.registry.write(channelKey, messages);
  }

  async clear(channelName: string): Promise<void> {
    await this.registry.write("me.endercass.ipc.channel." + channelName, []);
  }

  async setOptions(
    channelName: string,
    options: { bufferLength?: number } = {},
  ): Promise<void> {
    const channelKey = "me.endercass.ipc.channel." + channelName;
    if (!(await this.registry.has(channelKey))) {
      throw new Error(`Channel "${channelName}" does not exist.`);
    }
    options.bufferLength ??= 10;
    await this.registry.write(
      "me.endercass.ipc.channel." + channelName + ".bufferLength",
      options.bufferLength,
    );
    await this.registry.write(channelKey, []);
  }
}
