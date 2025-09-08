import type {
  OpEnv,
  RefChannel,
  RefChannelMessage,
} from "../../../../openv/mod";

export class ServerApi {
  name = "party.openv.server";
  openv: OpEnv;

  async populate(openv: OpEnv): Promise<void> {
    this.openv = openv;
  }

  async serve(channel: RefChannel): Promise<{ stop: () => void }> {
    let stopped = false;

    let lastId = 0;
    this.openv.registry.on("write", (key, value) => {
      if (!stopped) {
        lastId++;
        channel.send({ type: "request.set", key, value, id: lastId });
      }
    });
    this.openv.registry.on("delete", (key) => {
      if (!stopped) {
        lastId++;
        channel.send({ type: "request.delete", key, id: lastId });
      }
    });

    let sub = crypto.randomUUID();
    channel.subscribe(async (msg: RefChannelMessage) => {
      if (msg.type === "request.get") {
        try {
          const value = await this.openv.registry.read(msg.key);
          channel.send({
            type: "response.get",
            key: msg.key,
            value,
            id: msg.id,
            success: true,
          });
        } catch (e) {
          channel.send({
            type: "response.get",
            key: msg.key,
            value: null,
            id: msg.id,
            success: false,
          });
        }
      } else if (msg.type === "request.set") {
        try {
          await this.openv.registry.write(msg.key, msg.value);
          channel.send({
            type: "response.set",
            success: true,
            id: msg.id,
            key: msg.key,
            value: msg.value,
          });
        } catch (e) {
          channel.send({
            type: "response.set",
            success: false,
            id: msg.id,
            key: msg.key,
            value: msg.value,
          });
        }
      } else if (msg.type === "request.delete") {
        try {
          await this.openv.registry.delete(msg.key);
          channel.send({
            type: "response.delete",
            success: true,
            id: msg.id,
            key: msg.key,
          });
        } catch (e) {
          channel.send({
            type: "response.delete",
            success: false,
            id: msg.id,
            key: msg.key,
          });
        }
      } else if (msg.type === "request.list") {
        try {
          const entries = await this.openv.registry.entries();
          channel.send({
            type: "response.list",
            entries,
            id: msg.id,
            success: true,
          });
        } catch (e) {
          channel.send({ type: "response.list", id: msg.id, success: false });
        }
      }
    }, sub);

    return {
      stop() {
        stopped = true;
        channel.unsubscribe(sub);
      },
    };
  }
}
