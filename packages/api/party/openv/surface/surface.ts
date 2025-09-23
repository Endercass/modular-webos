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
