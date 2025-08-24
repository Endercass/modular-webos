import * as OS from "./index.js";

async function setup(os: OS.WebOS): Promise<OS.WebOS> {
  await os.installAPI(new OS.IPCApi());
  await os.installAPI(new OS.ServiceApi());
  await os.installAPI(new OS.IdentityApi());
  await os.installAPI(new OS.ServerApi());
  await os.installAPI(new OS.ProcessesApi());
  await os.installAPI(new OS.FsApi());
  await os.installAPI(new OS.SurfacesApi());
  await os.installAPI(new OS.ReferenceCompositor());

  return os;
}

export async function boot(): Promise<OS.WebOS> {
  const os = await setup(new OS.WebOS(new OS.IDBRegistry()));
  await os.getAPI<OS.ServiceApi>("me.endercass.service").clearFunctions();
  const fs = os.getAPI<OS.FsApi>("me.endercass.fs");
  await fs.register(
    "rootfs",
    new OS.LocalFS(await navigator.storage.getDirectory()),
  );
  await fs.mount("/", "rootfs");
  await fs.makeDir("/");

  await os.registry.write("me.endercass.con.current", "1");
  await os.registry.write(
    "me.endercass.con.list",
    [...Array(9).keys()].map((i) => (i + 1).toString()),
  );

  await os.getAPI<OS.ReferenceCompositor>("me.endercass.compositor").start();

  return os;
}

export async function connect(
  channel: OS.RefChannel | string | URL,
): Promise<OS.WebOS> {
  if (typeof channel === "string" || channel instanceof URL) {
    channel = await OS.util.uriToChannel(channel.toString());
  }

  const os = new OS.WebOS(new OS.ChannelRegistry(channel));

  return setup(os);
}
