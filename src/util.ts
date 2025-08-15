import { createBroadcastRefChannel, winToSwChannel, type RefChannel } from "./channel";

export async function uriToChannel(uri: string | URL): Promise<RefChannel> {
  if (typeof uri === "string") {
    uri = new URL(uri);
  }

  if (uri.protocol === "broadcastchannel:") {
    return createBroadcastRefChannel(uri.hostname);
  }
  if (uri.protocol === "sw:") {
    return await winToSwChannel()
  }
  throw new Error(`Unsupported channel URI: ${uri}`);
}
