import { type WebOS } from "../webos";

export interface API {
  name: string;
  populate(os: WebOS): Promise<void>;
}
