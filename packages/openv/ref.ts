export interface Ref<T> {
  deref(): Promise<T>;
  assign(value: T | Promise<T>): Promise<T>;
  forEach(fn: (value: T) => void): void;
  map<U>(fn: (value: T) => Promise<U>): Promise<Ref<U>>;
}

export function ref<T>(value: T | Promise<T>): Ref<T> {
  let subscribers: (() => void)[] = [];
  return {
    deref: async () => value,
    assign: async (newValue: T) => {
      value = newValue;
      subscribers.forEach((subscriber) => subscriber());
      return value;
    },
    forEach: async (fn: (value: T) => void) => {
      fn(await value);
      subscribers.push(async () => fn(await value));
    },
    map: async <U>(fn: (value: T) => Promise<U>): Promise<Ref<U>> => {
      const newValue = await fn(await value);
      const newRef = ref<U>(newValue);
      subscribers.push(async () => {
        newRef.assign(fn(await value));
      });
      return newRef;
    },
  };
}
