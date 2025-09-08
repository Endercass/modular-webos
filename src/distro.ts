import * as OE from "./index.js";

async function setup(openv: OE.OpEnv): Promise<OE.OpEnv> {
  await openv.installAPI(new OE.IPCApi());
  await openv.installAPI(new OE.ServiceApi());
  await openv.installAPI(new OE.IdentityApi());
  await openv.installAPI(new OE.ServerApi());
  await openv.installAPI(new OE.ProcessesApi());
  await openv.installAPI(new OE.FsApi());
  await openv.installAPI(new OE.SurfacesApi());
  await openv.installAPI(new OE.ReferenceCompositor());
  await openv.installAPI(new OE.NetApi());
  await openv.installAPI(new OE.ResolveApi());

  return openv;
}

async function buildFS(fs: OE.FsApi) {
  await fs.register(
    "rootfs",
    new OE.LocalFS(await navigator.storage.getDirectory()),
  );
  await fs.mount("/", "rootfs");
  await fs.makeDir("/");
  await fs.makeDir("/bin");
  await fs.makeDir("/etc");
}

async function buildNetwork(net: OE.NetApi) {
  await net.register("loopback", new OE.LoopbackNetBus());
  await net.route("127.0.0.1/8", "loopback");
}

export async function boot(): Promise<OE.OpEnv> {
  const openv = await setup(new OE.OpEnv(new OE.IDBRegistry()));
  await openv.getAPI<OE.ServiceApi>("party.openv.service").clearFunctions();
  const fs = openv.getAPI<OE.FsApi>("party.openv.fs");
  const net = openv.getAPI<OE.NetApi>("party.openv.net");

  await buildFS(fs);
  await buildNetwork(net);

  const resolver = openv.getAPI<OE.ResolveApi>("party.openv.resolve");
  await resolver.register("fs", new OE.FsResolver(openv));

  await openv.registry.write("party.openv.con.current", "1");
  await openv.registry.write(
    "party.openv.con.list",
    [...Array(9).keys()].map((i) => (i + 1).toString()),
  );

  await openv.getAPI<OE.ProcessesApi>("party.openv.processes").start();
  await openv.getAPI<OE.ReferenceCompositor>("party.openv.compositor").start();

  return openv;
}

export async function connect(
  channel: OE.RefChannel | string | URL,
): Promise<OE.OpEnv> {
  if (typeof channel === "string" || channel instanceof URL) {
    channel = await OE.util.uriToChannel(channel.toString());
  }

  const os = new OE.OpEnv(new OE.ChannelRegistry(channel));

  return setup(os);
}
