import { type OpEnv } from "./openv.ts";

export interface API {
  name: string;
  initialize(openv: OpEnv): Promise<void>;
}
