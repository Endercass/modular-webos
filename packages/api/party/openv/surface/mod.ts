import type { API, OpEnv, RegistryValue } from "../../../../openv/mod.ts";
import type IPCApi from "../ipc/mod.ts";
import type ServiceApi from "../service/mod.ts";
import type { Surface } from "./surface.ts";
import { CanvasSurface } from "./surface_canvas.ts";

export * from "./surface.ts";

export default class SurfacesApi implements API {
  name = "party.openv.surface";
  openv: OpEnv;
  async initialize(openv: OpEnv): Promise<void> {
    this.openv = openv;
  }

  createCanvasSurface(canvas: HTMLCanvasElement): CanvasSurface {
    return new CanvasSurface(canvas);
  }

  async register(namespace: string, surface: Surface): Promise<void> {
    const services = this.openv.getAPI<ServiceApi>("party.openv.service");
    await services.defineFunction(
      "clear",
      surface.clear.bind(surface) as any,
      namespace,
      {
        root: this.name,
      },
    );

    await services.defineFunction(
      "drawRect",
      surface.drawRect.bind(surface) as any,
      namespace,
      {
        root: this.name,
      },
    );
    await services.defineFunction(
      "drawImage",
      surface.drawImage.bind(surface) as any,
      namespace,
      {
        root: this.name,
      },
    );

    const ipc = this.openv.getAPI<IPCApi>("party.openv.ipc");
    surface.on("clear", async () => {
      try {
        await ipc.send("clear", [], namespace, { root: this.name });
      } catch (e) {
        if (!e.message.includes("not found")) {
          throw e;
        }
      }
    });
    surface.on("drawRect", async (color, x, y, width, height) => {
      try {
        await ipc.send("drawRect", [color, x, y, width, height], namespace, {
          root: this.name,
        });
      } catch (e) {
        if (!e.message.includes("not found")) {
          throw e;
        }
      }
    });
    surface.on("drawImage", async (image, destX, destY, options) => {
      try {
        await ipc.send(
          "drawImage",
          [image, destX, destY, options as RegistryValue],
          namespace,
          {
            root: this.name,
          },
        );
      } catch (e) {
        if (!e.message.includes("not found")) {
          throw e;
        }
      }
    });
  }

  async getSurface(namespace: string): Promise<Surface> {
    const services = this.openv.getAPI<ServiceApi>("party.openv.service");
    const ipc = this.openv.getAPI<IPCApi>("party.openv.ipc");

    const enabledListeners: Map<string, Map<string, boolean>> = new Map();

    const surface: Surface = {
      clear: async () => {
        await services.callFunction("clear", [], namespace, {
          root: this.name,
        });
      },
      drawRect: async (color, x, y, width, height) => {
        await services.callFunction(
          "drawRect",
          [color, x, y, width, height],
          namespace,
          {
            root: this.name,
          },
        );
      },
      drawImage: async (image, destX, destY, options) => {
        await services.callFunction(
          "drawImage",
          [image, destX, destY, options as RegistryValue],
          namespace,
          {
            root: this.name,
          },
        );
      },
      on: (name: string, cb: any, ident: string) => {
        if (!ident) {
          ident = "anon." + Math.random().toString(36).substring(2, 8);
        }

        if (!enabledListeners.has(name)) {
          enabledListeners.set(name, new Map());
        }

        if (!enabledListeners.get(name)!.has(ident)) {
          enabledListeners.get(name)!.set(ident, true);
        }

        ipc.listen(
          name,
          async (args: RegistryValue) => {
            if (!enabledListeners.get(name)!.has(ident!)) return;
            (cb as any)(...(args as any[]));
          },
          namespace,
          { root: this.name },
        );
      },
      off: (name: string, ident: string) => {
        enabledListeners.get(name)?.delete(ident);
      },
    };
    return surface;
  }
}
