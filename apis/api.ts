import { Registry } from "../registry";

export interface API {
  name: string;
  populate(reg: Registry): Promise<void>;
}
