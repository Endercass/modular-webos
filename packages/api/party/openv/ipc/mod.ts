import type { OpEnv, RegistryValue, API } from "../../../../openv/mod";

export default class IPCApi implements API {
  name = "party.openv.ipc";
  openv: OpEnv;

  async initialize(openv: OpEnv): Promise<void> {
    this.openv = openv;
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
      await this.openv.registry.read(
        `${options.root}.${namespace}.${channelName}`,
      );
    } catch {
      await this.openv.registry.write(
        `${options.root}.${namespace}.${channelName}`,
        [],
      );
    }
    await this.setOptions(channelName, options, namespace);

    await this.openv.registry.watch(
      `${options.root}.${namespace}.${channelName}`,
      async (messages: RegistryValue) => {
        if (!Array.isArray(messages)) {
          throw new Error(`Channel "${channelName}" must be an array.`);
        }
        if (
          messages.length >
          (await this.openv.registry.read(
            `${options.root}.${namespace}.${channelName}.bufferLength`,
          ))
        ) {
          await this.openv.registry.write(
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
      !(await this.openv.registry.has(
        `${options.root}.${namespace}.${channelName}`,
      ))
    ) {
      throw new Error(`Channel "${channelName}" does not exist.`);
    }
    let messages: RegistryValue[] = await this.openv.registry.read(
      `${options.root}.${namespace}.${channelName}`,
    );
    if (!Array.isArray(messages)) {
      messages = [];
    }

    messages.push(message);
    await this.openv.registry.write(
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
      !(await this.openv.registry.has(
        `${options.root}.${namespace}.${channelName}`,
      ))
    ) {
      throw new Error(`Channel "${channelName}" does not exist.`);
    }
    await this.openv.registry.write(
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
      !(await this.openv.registry.has(
        `${options.root}.${namespace}.${channelName}`,
      ))
    ) {
      throw new Error(
        `Channel "${channelName}" does not exist in namespace "${namespace}".`,
      );
    }
    options.bufferLength ??= 10;
    await this.openv.registry.write(
      `${options.root}.${namespace}.${channelName}.bufferLength`,
      options.bufferLength,
    );
  }
}
