import { type WebOS } from "../webos.ts";

export interface API {
  name: string;
  populate(os: WebOS): Promise<void>;
}
