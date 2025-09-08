import type { ImageOptions, Surface } from "./surface";

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
