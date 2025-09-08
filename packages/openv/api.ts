import { type OpEnv } from "../openv.ts";

export interface API {
  name: string;
  populate(openv: OpEnv): Promise<void>;
}
