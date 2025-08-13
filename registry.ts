export type RegistryValue =
  | string
  | number
  | boolean
  | ArrayBuffer
  | Uint8Array
  | Int8Array
  | Uint8ClampedArray
  | Int16Array
  | Uint16Array
  | Int32Array
  | Uint32Array
  | Float32Array
  | Float64Array
  | BigInt64Array
  | BigUint64Array
  | Blob
  | File
  | null
  | readonly RegistryValue[]
  | {
      readonly [key: string]: RegistryValue;
    };

export interface Registry {
  read(key: string): Promise<any>;
  write(key: string, value: RegistryValue): Promise<void>;
  watch(
    key: string,
    callback: (newValue: RegistryValue) => void,
  ): Promise<void>;
  wait(key: string, expectedValue: RegistryValue): Promise<void>;
  delete(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
  keys(): Promise<string[]>;
  values(): Promise<RegistryValue[]>;
  entries(): Promise<[string, RegistryValue][]>;

  on(
    event: "read" | "write",
    callback: (key: string, value: RegistryValue) => void,
  ): void;
  on(event: "delete", callback: (key: string) => void): void;
}
