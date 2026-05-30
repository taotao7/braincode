import { useRef, useSyncExternalStore } from "react";
import type { StoreUpdate, TuiStore } from "./tui-types";

export function createTuiStore<T>(initial: T): TuiStore<T> {
  let snapshot = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    setSnapshot: (update) => {
      const next =
        typeof update === "function"
          ? (update as (previous: T) => T)(snapshot)
          : update;
      if (Object.is(next, snapshot)) return;
      snapshot = next;
      for (const listener of listeners) listener();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export function useStableTuiStore<T>(initial: T): TuiStore<T> {
  const store = useRef<TuiStore<T> | null>(null);
  if (!store.current) store.current = createTuiStore(initial);
  return store.current;
}

export function useTuiStoreSnapshot<T>(store: TuiStore<T>): T {
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}
