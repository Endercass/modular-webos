import * as OS from "./index.js";

async function setup(os: OS.WebOS): Promise<OS.WebOS> {
  await os.installAPI(new OS.IPCApi());
  await os.installAPI(new OS.ServiceApi());
  await os.installAPI(new OS.IdentityApi());
  await os.installAPI(new OS.ServerApi());

  return os;
}

export async function boot(): Promise<OS.WebOS> {
  const os = new OS.WebOS(new OS.IDBRegistry());

  return setup(os);
}

export async function connect(
  channel: OS.RefChannel | string | URL,
): Promise<OS.WebOS> {
  if (typeof channel === "string" || channel instanceof URL) {
    channel = OS.util.uriToChannel(channel.toString());
  }

  const os = new OS.WebOS(new OS.ChannelRegistry(channel));

  return setup(os);
}
