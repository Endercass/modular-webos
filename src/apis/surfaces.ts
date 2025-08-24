import { RegistryValue } from "../registry";
import { type WebOS } from "../webos";
import { type API } from "./api";
import { IPCApi } from "./ipc";
import { ServiceApi } from "./service";

export interface Surface {
  clear: SurfaceClear;
  drawRect: SurfaceDrawRect;
  drawImage: SurfaceDrawImage;

  on(name: "clear", cb: () => void, ident?: string): void;
  on(
    name: "drawRect",
    cb: (
      color: string,
      x: number,
      y: number,
      width: number,
      height: number,
    ) => void,
    ident?: string,
  ): void;
  on(
    name: "drawImage",
    cb: (
      image: Blob,
      destX: number,
      destY: number,
      options: ImageOptions,
    ) => void,
    ident?: string,
  ): void;

  on(name: "keydown", cb: (key: string) => void, ident?: string): void;
  on(name: "keyup", cb: (key: string) => void, ident?: string): void;
  on(
    name: "mousemove",
    cb: (x: number, y: number) => void,
    ident?: string,
  ): void;
  on(
    name: "mousedown",
    cb: (button: number, x: number, y: number) => void,
    ident?: string,
  ): void;
  on(
    name: "mouseup",
    cb: (button: number, x: number, y: number) => void,
    ident?: string,
  ): void;

  on(
    name: "setProp",
    cb: (prop: "title" | "class", value: string) => void,
    ident?: string,
  ): void;
  on(
    name: "setProp",
    cb: (prop: "width" | "height" | "x" | "y", value: number) => void,
    ident?: string,
  ): void;

  off(name: "clear", ident: string): void;
  off(name: "drawRect", ident: string): void;
  off(name: "drawImage", ident: string): void;
  off(name: "keydown", ident: string): void;
  off(name: "keyup", ident: string): void;
  off(name: "mousemove", ident: string): void;
  off(name: "mousedown", ident: string): void;
  off(name: "mouseup", ident: string): void;
  off(name: "setProp", ident: string): void;
}

export type SurfaceClear = (this: Surface) => Promise<void>;

export type SurfaceDrawRect = (
  this: Surface,
  color: string,
  x: number,
  y: number,
  width: number,
  height: number,
) => Promise<void>;

export interface ImageOptions {
  width?: number;
  height?: number;
  sourceX?: number;
  sourceY?: number;
  sourceWidth?: number;
  sourceHeight?: number;
  destWidth?: number;
  destHeight?: number;
}

export type SurfaceDrawImage = (
  this: Surface,
  image: Blob,
  destX: number,
  destY: number,
  options?: ImageOptions,
) => Promise<void>;

export class CanvasSurface implements Surface {
  constructor(private canvas: HTMLCanvasElement) {
    this.context = canvas.getContext("2d")!;

    canvas.addEventListener("mousemove", (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      for (const cb of this.listeners.mousemove.values()) {
        cb(x, y);
      }
    });
    canvas.addEventListener("mousedown", (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      for (const cb of this.listeners.mousedown.values()) {
        cb(e.button, x, y);
      }
    });
    canvas.addEventListener("mouseup", (e) => {
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      for (const cb of this.listeners.mouseup.values()) {
        cb(e.button, x, y);
      }
    });
    window.addEventListener("keydown", (e) => {
      for (const cb of this.listeners.keydown.values()) {
        cb(e.key);
      }
    });
    window.addEventListener("keyup", (e) => {
      for (const cb of this.listeners.keyup.values()) {
        cb(e.key);
      }
    });
  }

  private context: CanvasRenderingContext2D;

  async clear(): Promise<void> {
    this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (const cb of this.listeners.clear.values()) {
      cb();
    }
  }

  async drawRect(
    color: string,
    x: number,
    y: number,
    width: number,
    height: number,
  ): Promise<void> {
    this.context.fillStyle = color;
    this.context.fillRect(x, y, width, height);

    for (const cb of this.listeners.drawRect.values()) {
      cb(color, x, y, width, height);
    }
  }
  async drawImage(
    image: Blob,
    destX: number,
    destY: number,
    options: ImageOptions = {},
  ): Promise<void> {
    const img = new Image();
    img.src = URL.createObjectURL(image);
    await img.decode();

    options.sourceX ??= 0;
    options.sourceY ??= 0;
    options.sourceWidth ??= img.width;
    options.sourceHeight ??= img.height;
    options.destWidth ??= options.sourceWidth;
    options.destHeight ??= options.sourceHeight;

    this.context.drawImage(
      img,
      options.sourceX,
      options.sourceY,
      options.sourceWidth,
      options.sourceHeight,
      destX,
      destY,
      options.destWidth,
      options.destHeight,
    );

    for (const cb of this.listeners.drawImage.values()) {
      cb(image, destX, destY, options);
    }
  }

  listeners: {
    clear: Map<string, () => void>;
    drawRect: Map<
      string,
      (
        color: string,
        x: number,
        y: number,
        width: number,
        height: number,
      ) => void
    >;
    drawImage: Map<
      string,
      (image: Blob, destX: number, destY: number, options: ImageOptions) => void
    >;
    keydown: Map<string, (key: string) => void>;
    keyup: Map<string, (key: string) => void>;
    mousemove: Map<string, (x: number, y: number) => void>;
    mousedown: Map<string, (button: number, x: number, y: number) => void>;
    mouseup: Map<string, (button: number, x: number, y: number) => void>;
    setProp: Map<string, (prop: string, value: string | number) => void>;
  } = {
    clear: new Map(),
    drawRect: new Map(),
    drawImage: new Map(),
    keydown: new Map(),
    keyup: new Map(),
    mousemove: new Map(),
    mousedown: new Map(),
    mouseup: new Map(),
    setProp: new Map(),
  };

  on(name: keyof CanvasSurface["listeners"], cb: any, ident?: string): void {
    if (!ident) {
      ident = "anon." + Math.random().toString(36).substring(2, 8);
    }
    this.listeners[name].set(ident, cb);
  }
  off(name: keyof CanvasSurface["listeners"], ident: string): void {
    this.listeners[name].delete(ident);
  }
}

export class SurfacesApi implements API {
  name = "me.endercass.surface";
  os: WebOS;
  async populate(os: WebOS): Promise<void> {
    this.os = os;
  }

  async register(namespace: string, surface: Surface): Promise<void> {
    const services = this.os.getAPI<ServiceApi>("me.endercass.service");
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

    const ipc = this.os.getAPI<IPCApi>("me.endercass.ipc");
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
    const services = this.os.getAPI<ServiceApi>("me.endercass.service");
    const ipc = this.os.getAPI<IPCApi>("me.endercass.ipc");

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
