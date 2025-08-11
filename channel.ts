import { RegistryValue } from "./registry";

type RefChannelMessageRequest =
  | { type: "request.get"; key: string }
  | {
      type: "request.set";
      key: string;
      value: RegistryValue | null;
    }
  | { type: "request.delete"; key: string }
  | { type: "request.list" };

type RefChannelMessageResponse = {
  success: boolean;
} & (
  | {
      type: "response.get";
      key: string;
      value?: RegistryValue | null;
    }
  | { type: "response.set"; key: string; value: RegistryValue | null }
  | { type: "response.delete"; key: string }
  | { type: "response.list"; entries?: [string, RegistryValue][] }
);

export type RefChannelMessage = { id: number } & (
  | RefChannelMessageRequest
  | RefChannelMessageResponse
);

export interface RefChannel {
  send(msg: RefChannelMessage): void;
  subscribe(cb: (msg: RefChannelMessage) => void, name?: string): void;
  unsubscribe(name: string): void;
}

function createListenerQueue<T>() {
  // const listeners: ((value: T) => void)[] = [];
  const listeners: Record<string, (value: T) => void> = {};
  let closed = false;

  return {
    push(value: T) {
      if (closed) throw new Error("Queue closed");
      for (const listener of Object.values(listeners)) {
        listener(value);
      }
    },
    close() {
      closed = true;
      Object.keys(listeners).forEach((name) => {
        delete listeners[name];
      });
    },
    on(
      cb: (value: T) => void,
      name: string = "anon." + Math.random().toString(36).substring(2, 8),
    ) {
      if (closed) throw new Error("Queue closed");
      listeners[name] = cb;
    },
    off(name: string) {
      delete listeners[name];
    },
  };
}

export function createPair(): [RefChannel, RefChannel] {
  const queueA = createListenerQueue<RefChannelMessage>();
  const queueB = createListenerQueue<RefChannelMessage>();

  const channelA: RefChannel = {
    send(msg) {
      queueB.push(msg);
    },
    subscribe(cb, name = "anon." + Math.random().toString(36).substring(2, 8)) {
      queueA.on(cb, name);
    },
    unsubscribe(name: string) {
      queueA.off(name);
    },
  };

  const channelB: RefChannel = {
    send(msg) {
      queueA.push(msg);
    },
    subscribe(cb, name = "anon." + Math.random().toString(36).substring(2, 8)) {
      queueB.on(cb, name);
    },
    unsubscribe(name: string) {
      queueB.off(name);
    },
  };

  return [channelA, channelB];
}

export function createBroadcastRefChannel(channelName: string): RefChannel {
  const bc = new BroadcastChannel(channelName);
  const queue = createListenerQueue<RefChannelMessage>();

  bc.onmessage = (ev) => {
    queue.push(ev.data as RefChannelMessage);
  };

  return {
    send(msg) {
      bc.postMessage(msg);
    },
    subscribe(cb, name = "anon." + Math.random().toString(36).substring(2, 8)) {
      queue.on(cb, name);
    },
    unsubscribe(name: string) {
      queue.off(name);
    },
  };
}

export function pipeChannel(
  source: RefChannel,
  destination: RefChannel,
): { stop: () => void } {
  let srcName = "pipe." + Math.random().toString(36).substring(2, 8);
  let destName = "pipe." + Math.random().toString(36).substring(2, 8);

  source.subscribe((msg) => {
    destination.send(msg);
  }, srcName);

  destination.subscribe((msg) => {
    source.send(msg);
  }, destName);

  return {
    stop() {
      source.unsubscribe(srcName);
      destination.unsubscribe(destName);
    },
  };
}

export function filterChannel(
  channel: RefChannel,
  filters: {
    get?: (key: string) => boolean;
    set?: (key: string, value: RegistryValue | null) => boolean;
    delete?: (key: string) => boolean;
  },
): RefChannel {
  const localSubscribers = new Map<string, (msg: any) => void>();
  const internalSubName = `__filter_internal_${Math.random()
    .toString(36)
    .substring(2, 8)}`;
  let underlyingSubscribed = false;

  const pendingListRequests = new Set<string>();

  function deliverToLocalSubscribers(msg: any) {
    for (const cb of localSubscribers.values()) {
      try {
        cb(msg);
      } catch (err) {
        console.error("filterChannel subscriber error:", err);
      }
    }
  }

  function handleIncomingFromRemote(msg: any) {
    if (msg?.type === "request.get" && filters.get?.(msg.key) === false) {
      channel.send({
        type: "response.get",
        key: msg.key,
        id: msg.id,
        success: false,
      });
      return;
    }

    if (
      msg?.type === "request.set" &&
      filters.set?.(msg.key, msg.value) === false
    ) {
      channel.send({
        type: "response.set",
        key: msg.key,
        value: msg.value,
        id: msg.id,
        success: false,
      });
      return;
    }

    if (msg?.type === "request.delete" && filters.delete?.(msg.key) === false) {
      channel.send({
        type: "response.delete",
        key: msg.key,
        id: msg.id,
        success: false,
      });
      return;
    }

    if (msg?.type === "request.list") {
      pendingListRequests.add(msg.id);
    }

    if (msg?.type === "response.list" && pendingListRequests.has(msg.id)) {
      pendingListRequests.delete(msg.id);

      if (Array.isArray(msg.entries) && filters.get) {
        msg = {
          ...msg,
          entries: msg.entries.filter(
            ([key, val]) => filters.get!(key) !== false,
          ),
        };
      }
    }

    deliverToLocalSubscribers(msg);
  }

  return {
    send(msg: any) {
      if (msg?.type === "request.get" && filters.get?.(msg.key) === false) {
        deliverToLocalSubscribers({
          type: "response.get",
          key: msg.key,
          id: msg.id,
          success: false,
        });
        return;
      }

      if (
        msg?.type === "request.set" &&
        filters.set?.(msg.key, msg.value) === false
      ) {
        deliverToLocalSubscribers({
          type: "response.set",
          key: msg.key,
          value: msg.value,
          id: msg.id,
          success: false,
        });
        return;
      }

      if (
        msg?.type === "request.delete" &&
        filters.delete?.(msg.key) === false
      ) {
        deliverToLocalSubscribers({
          type: "response.delete",
          key: msg.key,
          id: msg.id,
          success: false,
        });
        return;
      }

      if (msg?.type === "request.list") {
        pendingListRequests.add(msg.id);
      }

      if (msg?.type === "response.list" && pendingListRequests.has(msg.id)) {
        pendingListRequests.delete(msg.id);

        if (Array.isArray(msg.entries) && filters.get) {
          msg = {
            ...msg,
            entries: msg.entries.filter(
              ([key, val]) => filters.get!(key) !== false,
            ),
          };
        }
      }

      channel.send(msg);
    },

    subscribe(
      cb: (msg: any) => void,
      name: string = "anon." + Math.random().toString(36).substring(2, 8),
    ) {
      localSubscribers.set(name, cb);

      if (!underlyingSubscribed) {
        underlyingSubscribed = true;
        channel.subscribe(handleIncomingFromRemote, internalSubName);
      }
    },

    unsubscribe(name: string) {
      if (name) localSubscribers.delete(name);
      if (localSubscribers.size === 0 && underlyingSubscribed) {
        channel.unsubscribe(internalSubName);
        underlyingSubscribed = false;
      }
    },
  };
}
