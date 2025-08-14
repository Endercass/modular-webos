import { createBroadcastRefChannel, type RefChannel } from "./channel";

export function uriToChannel(uri: string | URL): RefChannel {
  if (typeof uri === "string") {
    uri = new URL(uri);
  }

  if (uri.protocol === "broadcastchannel:") {
    return createBroadcastRefChannel(uri.hostname);
  }
  throw new Error(`Unsupported channel URI: ${uri}`);
}
