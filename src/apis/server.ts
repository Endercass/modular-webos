import { type RefChannel, type RefChannelMessage } from "../channel";
import { uriToChannel } from "../util";
import { type WebOS } from "../webos";

export class ServerApi {
  name = "me.endercass.server";
  os: WebOS;

  async populate(os: WebOS): Promise<void> {
    this.os = os;
  }

  async serve(channel: RefChannel | string | URL): Promise<void> {
    if (typeof channel === "string" || channel instanceof URL) {
      channel = await uriToChannel(channel);
    }

    let lastId = 0;
    this.os.registry.on("write", (key, value) => {
      lastId++;
      channel.send({ type: "request.set", key, value, id: lastId });
    });
    this.os.registry.on("delete", (key) => {
      lastId++;
      channel.send({ type: "request.delete", key, id: lastId });
    });

    channel.subscribe(async (msg: RefChannelMessage) => {
      if (msg.type === "request.get") {
        try {
          const value = await this.os.registry.read(msg.key);
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
          await this.os.registry.write(msg.key, msg.value);
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
          await this.os.registry.delete(msg.key);
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
          const entries = await this.os.registry.entries();
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
    });
  }
}
