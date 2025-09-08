import type { API } from "../../../../openv/mod";

export interface WindowData {
  wid: number;
  title: string;
  x: number;
  y: number;
  z: number;
  minwidth: number;
  minheight: number;
  height: number;
  width: number;
  class: string;
  resizable: boolean;
  maximized: boolean;
  namespace: string;
  content: WindowContent;
}

export type WindowContent =
  | {
      type: "iframe";
      src: string;
    }
  | {
      type: "surface";
      sid: string;
    };

// To follow unienv WM spec in the future, for now based off of https://github.com/MercuryWorkshop/anuraOS/blob/main/src/AliceWM.tsx
export interface Compositor<T> extends API {
  start(): Promise<void>;

  displays(): Promise<string[]>;
  join(root: T, namespace: string): Promise<void>;
  displayInfo(
    namespace: string,
  ): Promise<{ width: number; height: number } | null>;

  create(info: Partial<WindowData>): Promise<WindowData>;
  info(wid: number): Promise<WindowData | null>;
  destroy(wid: number): Promise<void>;

  windows(): Promise<number[]>;

  setTitle(wid: number, title: string): Promise<void>;
  title(wid: number): Promise<string>;

  setContent(wid: number, content: WindowContent): Promise<void>;
  content(wid: number): Promise<WindowContent>;

  setLimits(wid: number, maxwidth: number, maxheight: number): Promise<void>;
  limits(wid: number): Promise<{ maxwidth: number; maxheight: number }>;

  setResizable(wid: number, resizable: boolean): Promise<void>;
  resizable(wid: number): Promise<boolean>;

  setMaximized(wid: number, maximized: boolean): Promise<void>;
  maximized(wid: number): Promise<boolean>;

  namespace(wid: number): Promise<string>;

  setClass(wid: number, cls: string): Promise<void>;
  class(wid: number): Promise<string>;

  resize(wid: number, width: number, height: number): Promise<void>;
  move(wid: number, x: number, y: number): Promise<void>;
  rect(wid: number): Promise<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;

  focus(wid: number): Promise<void>;
}
