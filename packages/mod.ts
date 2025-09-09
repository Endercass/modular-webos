export * as openv from "./openv/mod";
export * as openv_web from "./openv_web/mod";
export * as openv_node from "./openv_node/mod";
export * as api from "./api/mod";

import { TempFS, type FsApi } from "./api/party/openv/fs/mod";
import type { OpEnv } from "./openv/mod";

export function initFs(openv: OpEnv) {
    const fs = openv.getAPI<FsApi>("party.openv.fs");
    const tmpfs = new TempFS();
    fs.register("rootfs", tmpfs);
    fs.mount("/", "rootfs");
    return tmpfs;
}