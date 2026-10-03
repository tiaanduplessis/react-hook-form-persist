import React, { StrictMode, useLayoutEffect } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useForm } from "react-hook-form";

import useFormPersist, { FormPersistConfig } from "../src";

const KEY = "storage-error-form";
const NOW = 3001;
type Options = Omit<FormPersistConfig, "watch" | "setValue">;
type Props = { name: string | null; options?: Options };
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <StrictMode>{children}</StrictMode>
);

// Keep the backing data available without invoking the instrumented storage API.
const createStorage = (initial: Record<string, string> = {}) => {
  const entries = new Map(Object.entries(initial));
  const operations: string[] = [];
  const storage = {
    get length() {
      return entries.size;
    },
    key: vi.fn((index: number) => [...entries.keys()][index] ?? null),
    clear: vi.fn(() => entries.clear()),
    getItem: vi.fn((key: string) => {
      operations.push(`read:${key}`);
      return entries.get(key) ?? null;
    }),
    setItem: vi.fn((key: string, value: string) => {
      operations.push(`write:${key}`);
      entries.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      operations.push(`remove:${key}`);
      entries.delete(key);
    }),
  };
  return { storage, entries, operations };
};

const renderForm = (
  initialProps: Props,
  strict = false,
  defaultValues: Record<string, any> = { field: "default", secret: "private" }
) =>
  renderHook(
    ({ name, options }: Props) => {
      const form = useForm({ defaultValues });
      const persisted = useFormPersist(name, {
        watch: form.watch,
        setValue: form.setValue,
        ...options,
      });
      return { ...form, ...persisted };
    },
    { initialProps, ...(strict ? { wrapper } : {}) }
  );

const expectThrown = (action: () => unknown, expected: unknown) => {
  let didThrow = false;
  let thrown: unknown;
  try {
    action();
  } catch (error) {
    didThrow = true;
    thrown = error;
  }
  expect(didThrow).toBe(true);
  expect(thrown).toBe(expected);
};

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  vi.spyOn(Date, "now").mockReturnValue(NOW);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe.each([false, true])("storage errors with StrictMode=%s", (strict) => {
  test("preserves defaults, restoration, later writes and clear when storage works", () => {
    const { storage, entries } = createStorage();
    const onStorageError = vi.fn();
    const onDataRestored = vi.fn();
    const options = { storage, onStorageError, onDataRestored };
    const first = renderForm({ name: KEY, options }, strict);
    expect(JSON.parse(entries.get(KEY)!)).toEqual({
      field: "default",
      secret: "private",
    });
    act(() => first.result.current.setValue("field", "saved edit"));
    first.unmount();
    storage.setItem.mockClear();

    const second = renderForm({ name: KEY, options }, strict);
    expect(second.result.current.getValues().field).toBe("saved edit");
    expect(onDataRestored).toHaveBeenCalledWith({
      field: "saved edit",
      secret: "private",
    });
    expect(
      storage.setItem.mock.calls.every(
        ([, value]) => JSON.parse(value).field === "saved edit"
      )
    ).toBe(true);
    act(() => second.result.current.clear());
    expect(entries.has(KEY)).toBe(false);
    expect(onStorageError).not.toHaveBeenCalled();
  });

  test.each(["getter", "getItem", "setItem", "removeItem"] as const)(
    "propagates a %s failure without an error handler",
    (operation) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const error = new DOMException("Storage unavailable", "SecurityError");
      const { storage } = createStorage();
      const fail = () => {
        throw error;
      };
      if (operation === "getter") {
        vi.spyOn(window, "sessionStorage", "get").mockImplementation(fail);
        expectThrown(() => renderForm({ name: KEY }, strict), error);
      } else if (operation === "removeItem") {
        const form = renderForm({ name: KEY, options: { storage } }, strict);
        storage.removeItem.mockImplementation(fail);
        expectThrown(() => act(() => form.result.current.clear()), error);
      } else {
        storage[operation].mockImplementation(fail);
        expectThrown(
          () => renderForm({ name: KEY, options: { storage } }, strict),
          error
        );
      }
    }
  );

  test("does not resolve default storage on an empty-selection write rerender", () => {
    const watch = () => ({ field: "default" });
    const setValue = vi.fn();
    const serialize = vi.fn(JSON.stringify);
    const form = renderHook(
      () => useFormPersist(KEY, { watch, setValue, include: [], serialize }),
      strict ? { wrapper } : {}
    );
    const getter = vi
      .spyOn(window, "sessionStorage", "get")
      .mockImplementation(() => {
        throw new DOMException("Storage newly denied", "SecurityError");
      });
    expect(() => form.rerender()).not.toThrow();
    expect(getter).not.toHaveBeenCalled();
    expect(serialize).not.toHaveBeenCalled();
  });

  test.each(["added", "replaced", "removed"] as const)(
    "uses an error handler %s in the same commit as a layout-effect clear",
    (change) => {
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { storage } = createStorage();
      const error = new Error("Removal denied during layout effect");
      storage.removeItem.mockImplementation(() => {
        throw error;
      });
      const originalHandler = vi.fn();
      const nextHandler = vi.fn();
      const watch = () => ({ field: "default" });
      const setValue = vi.fn();
      type LayoutProps = {
        handler: FormPersistConfig["onStorageError"];
        clearNow: boolean;
      };
      const form = renderHook(
        ({ handler, clearNow }: LayoutProps) => {
          const { clear } = useFormPersist(KEY, {
            storage,
            watch,
            setValue,
            onStorageError: handler,
          });
          useLayoutEffect(() => {
            if (clearNow) clear();
          }, [clearNow, clear]);
        },
        {
          initialProps: {
            handler: change === "added" ? undefined : originalHandler,
            clearNow: false,
          } as LayoutProps,
          ...(strict ? { wrapper } : {}),
        }
      );
      const readsBeforeChange = storage.getItem.mock.calls.length;
      const rerender = () =>
        form.rerender({
          handler: change === "removed" ? undefined : nextHandler,
          clearNow: true,
        });
      if (change === "removed") {
        expectThrown(rerender, error);
        expect(nextHandler).not.toHaveBeenCalled();
      } else {
        expect(rerender).not.toThrow();
        expect(nextHandler).toHaveBeenCalledExactlyOnceWith(error);
        expect(storage.getItem).toHaveBeenCalledTimes(readsBeforeChange);
      }
      expect(originalHandler).not.toHaveBeenCalled();
      expect(storage.removeItem).toHaveBeenCalledTimes(1);
    }
  );

  test("handles a denied default getter once and leaves the form usable", () => {
    const error = new DOMException("Storage denied", "SecurityError");
    const getter = vi
      .spyOn(window, "sessionStorage", "get")
      .mockImplementation(() => {
        throw error;
      });
    const onStorageError = vi.fn();
    const serialize = vi.fn(JSON.stringify);
    const deserialize = vi.fn(JSON.parse);
    const options = { onStorageError, serialize, deserialize };
    const form = renderForm({ name: KEY, options }, strict);
    act(() => form.result.current.setValue("field", "still editable"));
    form.rerender({ name: KEY, options: { ...options, timeout: 1000 } });
    act(() => form.result.current.clear());

    expect(form.result.current.getValues().field).toBe("still editable");
    expect(getter).toHaveBeenCalledTimes(1);
    expect(onStorageError).toHaveBeenCalledExactlyOnceWith(error);
    expect(serialize).not.toHaveBeenCalled();
    expect(deserialize).not.toHaveBeenCalled();
  });

  test("never overwrites unread data or retries after field edits and configuration churn", () => {
    const stored = '{"field":"unread saved data","secret":"saved private"}';
    const { storage, entries } = createStorage({ [KEY]: stored });
    const error = new Error("Read failed");
    storage.getItem.mockImplementation(() => {
      throw error;
    });
    const onStorageError = vi.fn();
    const serialize = vi.fn(JSON.stringify);
    const deserialize = vi.fn(JSON.parse);
    const onDataRestored = vi.fn();
    const onTimeout = vi.fn();
    const options = {
      storage,
      onStorageError,
      serialize,
      deserialize,
      onDataRestored,
      onTimeout,
    };
    const form = renderForm({ name: KEY, options }, strict);
    expect(onStorageError).toHaveBeenCalledExactlyOnceWith(error);
    expect(storage.getItem).toHaveBeenCalledTimes(1);
    expect(form.result.current.getValues().field).toBe("default");

    // Making the same backend healthy is not a new activation.
    storage.getItem.mockImplementation((key) => entries.get(key) ?? null);
    act(() => form.result.current.setValue("field", "unsaved edit"));
    const nextSerialize = vi.fn(JSON.stringify);
    const nextDeserialize = vi.fn(JSON.parse);
    const nextRestored = vi.fn();
    const nextTimeout = vi.fn();
    const nextError = vi.fn();
    form.rerender({
      name: KEY,
      options: {
        storage,
        serialize: nextSerialize,
        deserialize: nextDeserialize,
        onDataRestored: nextRestored,
        onTimeout: nextTimeout,
        onStorageError: nextError,
        include: ["field"],
        exclude: ["secret"],
        timeout: 1000,
        validate: true,
        dirty: true,
        touch: true,
      },
    });
    act(() => form.result.current.clear());
    form.rerender({ name: KEY, options: { storage } });
    act(() => form.result.current.setValue("field", "edit without a handler"));
    act(() => form.result.current.clear());
    expect(storage.getItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(entries.get(KEY)).toBe(stored);
    for (const callback of [
      serialize,
      deserialize,
      onDataRestored,
      onTimeout,
      nextSerialize,
      nextDeserialize,
      nextRestored,
      nextTimeout,
      nextError,
    ]) {
      expect(callback).not.toHaveBeenCalled();
    }
  });

  test("suspends after a failed write and uses the latest handler without rereading", () => {
    const { storage, entries } = createStorage();
    const originalHandler = vi.fn();
    const nextHandler = vi.fn();
    const serialize = vi.fn(JSON.stringify);
    const form = renderForm(
      {
        name: KEY,
        options: { storage, onStorageError: originalHandler, serialize },
      },
      strict
    );
    const beforeFailure = entries.get(KEY);
    const readsBeforeHandlerChange = storage.getItem.mock.calls.length;
    form.rerender({
      name: KEY,
      options: { storage, onStorageError: nextHandler, serialize },
    });
    expect(storage.getItem).toHaveBeenCalledTimes(readsBeforeHandlerChange);
    const error = new DOMException("Quota exhausted", "QuotaExceededError");
    storage.setItem.mockClear().mockImplementation(() => {
      throw error;
    });
    serialize.mockClear();
    act(() => form.result.current.setValue("field", "failed write"));
    expect(nextHandler).toHaveBeenCalledExactlyOnceWith(error);
    expect(originalHandler).not.toHaveBeenCalled();
    const serializationsAfterFailure = serialize.mock.calls.length;
    act(() => form.result.current.setValue("field", "another edit"));
    form.rerender({
      name: KEY,
      options: { storage, onStorageError: originalHandler, serialize },
    });
    act(() => form.result.current.clear());
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(serialize).toHaveBeenCalledTimes(serializationsAfterFailure);
    expect(entries.get(KEY)).toBe(beforeFailure);
    expect(originalHandler).not.toHaveBeenCalled();
  });

  test("suspends before invoking a removal error handler, including reentrant clear", () => {
    const { storage, entries } = createStorage();
    const error = new Error("Removal failed");
    const onStorageError = vi.fn(() => form.result.current.clear());
    const form = renderForm(
      { name: KEY, options: { storage, onStorageError } },
      strict
    );
    const stored = entries.get(KEY);
    storage.removeItem.mockImplementation(() => {
      throw error;
    });
    storage.setItem.mockClear();
    act(() => form.result.current.clear());
    act(() => form.result.current.clear());
    act(() => form.result.current.setValue("field", "unsaved edit"));
    expect(onStorageError).toHaveBeenCalledExactlyOnceWith(error);
    expect(storage.removeItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(entries.get(KEY)).toBe(stored);
  });

  test("reports a failed expiry removal after onTimeout and never writes over the entry", () => {
    const stored = '{"field":"expired","_timestamp":1000}';
    const { storage, entries } = createStorage({ [KEY]: stored });
    const events: string[] = [];
    const error = new Error("Cannot remove expired data");
    storage.removeItem.mockImplementation(() => {
      events.push("remove");
      throw error;
    });
    const onTimeout = vi.fn(() => events.push("timeout"));
    const onStorageError = vi.fn(() => events.push("error"));
    const onDataRestored = vi.fn();
    const serialize = vi.fn(JSON.stringify);
    const options = {
      storage,
      timeout: 1000,
      onTimeout,
      onStorageError,
      onDataRestored,
      serialize,
    };
    const form = renderForm({ name: KEY, options }, strict);
    expect(events).toEqual(["timeout", "remove", "error"]);
    expect(onStorageError).toHaveBeenCalledExactlyOnceWith(error);
    expect(form.result.current.getValues().field).toBe("default");
    act(() => form.result.current.setValue("field", "edited after expiry"));
    form.rerender({ name: KEY, options: { ...options, timeout: 0 } });
    act(() => form.result.current.clear());
    expect(events).toEqual(["timeout", "remove", "error"]);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(serialize).not.toHaveBeenCalled();
    expect(onDataRestored).not.toHaveBeenCalled();
    expect(entries.get(KEY)).toBe(stored);
  });

  test.each(["key", "storage", "reenable", "remount"] as const)(
    "recovers through %s by restoring the latest saved data before writing",
    (recovery) => {
      const first = createStorage({ [KEY]: '{"field":"old saved data"}' });
      const error = new Error("Read denied");
      first.storage.getItem.mockImplementation(() => {
        throw error;
      });
      const onStorageError = vi.fn();
      const onDataRestored = vi.fn();
      let options: Options = {
        storage: first.storage,
        onStorageError,
        onDataRestored,
      };
      let form = renderForm({ name: KEY, options }, strict);
      act(() => form.result.current.setValue("field", "unsaved stale edit"));
      first.storage.getItem.mockImplementation((key) => {
        first.operations.push(`read:${key}`);
        return first.entries.get(key) ?? null;
      });
      const target = recovery === "storage" ? createStorage() : first;
      const nextKey = recovery === "key" ? "another-key" : KEY;
      target.entries.set(nextKey, '{"field":"latest external save"}');
      target.operations.length = 0;
      target.storage.setItem.mockClear();
      options = { ...options, storage: target.storage };
      if (recovery === "reenable") {
        form.rerender({ name: null, options });
        act(() => form.result.current.clear());
      }
      if (recovery === "remount") {
        form.unmount();
        form = renderForm({ name: nextKey, options }, strict);
      } else {
        form.rerender({ name: nextKey, options });
      }
      expect(form.result.current.getValues().field).toBe(
        "latest external save"
      );
      expect(target.operations[0]).toBe(`read:${nextKey}`);
      expect(JSON.parse(target.entries.get(nextKey)!).field).toBe(
        "latest external save"
      );
      expect(
        target.storage.setItem.mock.calls.every(
          ([, value]) => JSON.parse(value).field === "latest external save"
        )
      ).toBe(true);
      expect(onDataRestored).toHaveBeenCalledWith({
        field: "latest external save",
      });
      expect(onStorageError).toHaveBeenCalledTimes(1);
      act(() => form.result.current.setValue("field", "new active edit"));
      expect(JSON.parse(target.entries.get(nextKey)!).field).toBe(
        "new active edit"
      );
    }
  );

  test("writes current values when returning to a now-empty key after another key failed", () => {
    const { storage, entries, operations } = createStorage({
      [KEY]: '{"field":"saved"}',
    });
    const error = new Error("Other key cannot be read");
    storage.getItem.mockImplementation((key) => {
      operations.push(`read:${key}`);
      if (key === "other") throw error;
      return entries.get(key) ?? null;
    });
    // This watch object remains identical even after restoration updates it.
    const values: Record<string, any> = { field: "default" };
    const watch = () => values;
    const setValue = (key: string, value: any) => {
      values[key] = value;
    };
    const onStorageError = vi.fn();
    const form = renderHook(
      ({ name }: { name: string }) =>
        useFormPersist(name, { storage, watch, setValue, onStorageError }),
      { initialProps: { name: KEY }, ...(strict ? { wrapper } : {}) }
    );
    expect(values.field).toBe("saved");
    form.rerender({ name: "other" });
    expect(onStorageError).toHaveBeenCalledExactlyOnceWith(error);
    entries.delete(KEY);
    storage.setItem.mockClear();
    operations.length = 0;
    form.rerender({ name: KEY });
    expect(operations[0]).toBe(`read:${KEY}`);
    expect(storage.setItem).toHaveBeenCalledWith(KEY, '{"field":"saved"}');
    expect(JSON.parse(entries.get(KEY)!)).toEqual({ field: "saved" });
    expect(onStorageError).toHaveBeenCalledTimes(1);
  });

  test("does not carry expiry suppression through a failed different-key activation", () => {
    const { storage, entries, operations } = createStorage({
      [KEY]: '{"field":"expired","_timestamp":1000}',
    });
    const error = new Error("Other key cannot be read");
    storage.getItem.mockImplementation((key) => {
      operations.push(`read:${key}`);
      if (key === "other") throw error;
      return entries.get(key) ?? null;
    });
    const watch = () => ({ field: "default" });
    const setValue = vi.fn();
    const onStorageError = vi.fn();
    const onTimeout = vi.fn();
    const form = renderHook(
      ({ name }: { name: string }) =>
        useFormPersist(name, {
          storage,
          watch,
          setValue,
          timeout: 1000,
          onStorageError,
          onTimeout,
        }),
      { initialProps: { name: KEY }, ...(strict ? { wrapper } : {}) }
    );
    expect(entries.has(KEY)).toBe(false);
    expect(onTimeout).toHaveBeenCalledTimes(1);
    form.rerender({ name: "other" });
    expect(onStorageError).toHaveBeenCalledExactlyOnceWith(error);
    storage.setItem.mockClear();
    operations.length = 0;
    form.rerender({ name: KEY });
    expect(operations[0]).toBe(`read:${KEY}`);
    expect(storage.setItem).toHaveBeenCalledWith(
      KEY,
      JSON.stringify({ field: "default", _timestamp: NOW })
    );
    expect(JSON.parse(entries.get(KEY)!)).toEqual({
      field: "default",
      _timestamp: NOW,
    });
    expect(setValue).not.toHaveBeenCalled();
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(onStorageError).toHaveBeenCalledTimes(1);
  });

  test("reports a new failure once for each activation, even when returning to the old key", () => {
    const { storage } = createStorage();
    const error = new Error("Still unavailable");
    storage.getItem.mockImplementation(() => {
      throw error;
    });
    const onStorageError = vi.fn();
    const options = { storage, onStorageError };
    const form = renderForm({ name: KEY, options }, strict);
    form.rerender({ name: "other", options });
    form.rerender({ name: KEY, options });
    form.rerender({ name: null, options });
    act(() => form.result.current.clear());
    form.rerender({ name: KEY, options });
    expect(storage.getItem.mock.calls.map(([key]) => key)).toEqual([
      KEY,
      "other",
      KEY,
      KEY,
    ]);
    expect(onStorageError).toHaveBeenCalledTimes(4);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  test("isolates failed hooks even when they share a supplied storage object", () => {
    const { storage, entries } = createStorage();
    const error = new Error("Only this entry cannot be read");
    storage.getItem.mockImplementation((key) => {
      if (key === KEY) throw error;
      return entries.get(key) ?? null;
    });
    const failedHandler = vi.fn();
    const healthyHandler = vi.fn();
    const failed = renderForm(
      { name: KEY, options: { storage, onStorageError: failedHandler } },
      strict
    );
    const healthy = renderForm(
      { name: "healthy", options: { storage, onStorageError: healthyHandler } },
      strict
    );
    act(() => failed.result.current.setValue("field", "unsaved"));
    act(() => healthy.result.current.setValue("field", "saved"));
    expect(entries.has(KEY)).toBe(false);
    expect(JSON.parse(entries.get("healthy")!).field).toBe("saved");
    expect(failedHandler).toHaveBeenCalledExactlyOnceWith(error);
    expect(healthyHandler).not.toHaveBeenCalled();
    act(() => healthy.result.current.clear());
    expect(entries.has("healthy")).toBe(false);
  });

  test("isolates hooks using the same key and storage after a transient read failure", () => {
    const { storage, entries } = createStorage({ [KEY]: '{"field":"saved"}' });
    const error = new Error("First hook cannot read");
    storage.getItem.mockImplementationOnce(() => {
      throw error;
    });
    const failedHandler = vi.fn();
    const healthyHandler = vi.fn();
    const failed = renderForm(
      { name: KEY, options: { storage, onStorageError: failedHandler } },
      strict
    );
    const healthy = renderForm(
      { name: KEY, options: { storage, onStorageError: healthyHandler } },
      strict
    );
    expect(healthy.result.current.getValues().field).toBe("saved");
    act(() =>
      healthy.result.current.setValue("field", "saved by healthy hook")
    );
    act(() =>
      failed.result.current.setValue("field", "unsaved by failed hook")
    );
    act(() => failed.result.current.clear());
    expect(JSON.parse(entries.get(KEY)!).field).toBe("saved by healthy hook");
    expect(failedHandler).toHaveBeenCalledExactlyOnceWith(error);
    expect(healthyHandler).not.toHaveBeenCalled();
  });

  test("an old clear callback cannot suspend or revive another activation", () => {
    const { storage, entries } = createStorage({
      [KEY]: '{"field":"original saved value"}',
      other: '{"field":"other saved value"}',
    });
    const onStorageError = vi.fn();
    const options = { storage, onStorageError };
    const form = renderForm({ name: KEY, options }, strict);
    const oldClear = form.result.current.clear;
    form.rerender({ name: "other", options });
    const error = new Error("Old target cannot be removed");
    storage.removeItem.mockImplementation((key) => {
      if (key === KEY) throw error;
      entries.delete(key);
    });
    act(() => oldClear());
    expect(onStorageError).toHaveBeenCalledExactlyOnceWith(error);
    act(() => form.result.current.setValue("field", "new target stays active"));
    expect(JSON.parse(entries.get("other")!).field).toBe(
      "new target stays active"
    );
    act(() => form.result.current.clear());
    expect(entries.has("other")).toBe(false);

    storage.removeItem.mockImplementation((key) => {
      entries.delete(key);
    });
    form.rerender({ name: KEY, options });
    expect(form.result.current.getValues().field).toBe("original saved value");
    act(() => oldClear());
    expect(entries.has(KEY)).toBe(true);
    act(() => form.result.current.clear());
    expect(entries.has(KEY)).toBe(false);
    expect(onStorageError).toHaveBeenCalledTimes(1);
  });

  test("handles a lazy localStorage adapter getter failure at the method boundary", () => {
    const error = new DOMException("localStorage denied", "SecurityError");
    const localGetter = vi
      .spyOn(window, "localStorage", "get")
      .mockImplementation(() => {
        throw error;
      });
    const sessionGetter = vi.spyOn(window, "sessionStorage", "get");
    const storage: Storage = {
      get length() {
        return window.localStorage.length;
      },
      key: (index) => window.localStorage.key(index),
      clear: () => window.localStorage.clear(),
      getItem: (key) => window.localStorage.getItem(key),
      setItem: (key, value) => window.localStorage.setItem(key, value),
      removeItem: (key) => window.localStorage.removeItem(key),
    };
    const onStorageError = vi.fn();
    const form = renderForm(
      { name: KEY, options: { storage, onStorageError } },
      strict
    );
    act(() => form.result.current.setValue("field", "local edit"));
    act(() => form.result.current.clear());
    expect(onStorageError).toHaveBeenCalledExactlyOnceWith(error);
    expect(localGetter).toHaveBeenCalledTimes(1);
    expect(sessionGetter).not.toHaveBeenCalled();
    expect(form.result.current.getValues().field).toBe("local edit");
  });

  test("uses supplied-storage identity rather than the default getter's returned object", () => {
    const first = createStorage();
    const second = createStorage({ [KEY]: '{"field":"latest saved data"}' });
    const error = new Error("First backend cannot be read");
    first.storage.getItem.mockImplementation(() => {
      throw error;
    });
    const getter = vi
      .spyOn(window, "sessionStorage", "get")
      .mockReturnValue(first.storage);
    const onStorageError = vi.fn();
    const form = renderForm({ name: KEY, options: { onStorageError } }, strict);
    getter.mockReturnValue(second.storage);
    act(() => form.result.current.setValue("field", "unsaved edit"));
    form.rerender({ name: KEY, options: { onStorageError } });
    act(() => form.result.current.clear());
    expect(second.storage.getItem).not.toHaveBeenCalled();
    expect(second.storage.setItem).not.toHaveBeenCalled();
    expect(second.storage.removeItem).not.toHaveBeenCalled();
    expect(getter).toHaveBeenCalledTimes(1);

    form.rerender({
      name: KEY,
      options: { storage: second.storage, onStorageError },
    });
    expect(form.result.current.getValues().field).toBe("latest saved data");
    expect(onStorageError).toHaveBeenCalledExactlyOnceWith(error);
    expect(getter).toHaveBeenCalledTimes(1);
    act(() => form.result.current.setValue("field", "active again"));
    expect(JSON.parse(second.entries.get(KEY)!).field).toBe("active again");
  });

  test("preserves storage method receivers and never reads the default getter for supplied storage", () => {
    const getter = vi
      .spyOn(window, "sessionStorage", "get")
      .mockImplementation(() => {
        throw new Error("Default storage should not be accessed");
      });
    const { storage } = createStorage({ [KEY]: '{"field":"saved"}' });
    const onStorageError = vi.fn();
    const form = renderForm(
      { name: KEY, options: { storage, onStorageError } },
      strict
    );
    act(() => form.result.current.setValue("field", "edited"));
    act(() => form.result.current.clear());
    for (const method of [
      storage.getItem,
      storage.setItem,
      storage.removeItem,
    ]) {
      expect(method).toHaveBeenCalled();
      expect(
        method.mock.contexts.every((receiver) => receiver === storage)
      ).toBe(true);
    }
    expect(getter).not.toHaveBeenCalled();
    expect(onStorageError).not.toHaveBeenCalled();
  });

  test("does no persistence work for a null key, including the error callback and watch", () => {
    const getter = vi
      .spyOn(window, "sessionStorage", "get")
      .mockImplementation(() => {
        throw new Error("Storage denied");
      });
    const watch = vi.fn(() => ({ field: "default" }));
    const setValue = vi.fn();
    const serialize = vi.fn(JSON.stringify);
    const deserialize = vi.fn(JSON.parse);
    const onStorageError = vi.fn();
    const onDataRestored = vi.fn();
    const onTimeout = vi.fn();
    const config = {
      watch,
      setValue,
      serialize,
      deserialize,
      onStorageError,
      onDataRestored,
      onTimeout,
      timeout: 1,
    };
    const form = renderHook(
      () => useFormPersist(null, config),
      strict ? { wrapper } : {}
    );
    form.rerender();
    act(() => form.result.current.clear());
    for (const callback of [
      getter,
      watch,
      setValue,
      serialize,
      deserialize,
      onStorageError,
      onDataRestored,
      onTimeout,
    ]) {
      expect(callback).not.toHaveBeenCalled();
    }
  });
});

// Errors from application code and JSON are outside the storage opt-in boundary.
describe.each([false, true])(
  "exception boundaries with StrictMode=%s",
  (strict) => {
    beforeEach(() => {
      vi.spyOn(console, "error").mockImplementation(() => {});
    });

    test.each([
      "a thrown string",
      null,
      undefined,
      42,
      Symbol("storage failure"),
    ])("passes a thrown non-Error value unchanged: %s", (error) => {
      const { storage } = createStorage();
      storage.getItem.mockImplementation(() => {
        throw error;
      });
      const onStorageError = vi.fn();
      const form = renderForm(
        { name: KEY, options: { storage, onStorageError } },
        strict
      );
      act(() => form.result.current.clear());
      expect(onStorageError).toHaveBeenCalledExactlyOnceWith(error);
      expect(storage.getItem).toHaveBeenCalledTimes(1);
      expect(storage.setItem).not.toHaveBeenCalled();
      expect(storage.removeItem).not.toHaveBeenCalled();
    });

    test("does not swallow or reclassify an error thrown by the error handler", () => {
      const { storage } = createStorage();
      const storageError = new Error("Read failure");
      const handlerError = new Error("Error handler failure");
      storage.getItem.mockImplementation(() => {
        throw storageError;
      });
      const onStorageError = vi.fn(() => {
        throw handlerError;
      });
      expectThrown(
        () =>
          renderForm(
            { name: KEY, options: { storage, onStorageError } },
            strict
          ),
        handlerError
      );
      expect(onStorageError).toHaveBeenCalledExactlyOnceWith(storageError);
      expect(storage.getItem).toHaveBeenCalledTimes(1);
      expect(storage.setItem).not.toHaveBeenCalled();
    });

    test.each([
      "serialize",
      "deserialize",
      "watch",
      "setValue",
      "onDataRestored",
      "onTimeout",
    ] as const)("does not catch a %s exception", (callback) => {
      const { storage } = createStorage({
        [KEY]:
          callback === "serialize"
            ? "{}"
            : '{"field":"saved","_timestamp":1000}',
      });
      const error = new Error(`${callback} failed`);
      const onStorageError = vi.fn();
      const config: FormPersistConfig & {
        onStorageError: typeof onStorageError;
      } = {
        storage,
        watch: () => ({ field: "default" }),
        setValue: vi.fn(),
        onStorageError,
        ...(callback === "onTimeout" ? { timeout: 1 } : {}),
        [callback]: () => {
          throw error;
        },
      };
      expectThrown(
        () =>
          renderHook(
            () => useFormPersist(KEY, config),
            strict ? { wrapper } : {}
          ),
        error
      );
      expect(onStorageError).not.toHaveBeenCalled();
      if (callback === "onTimeout") {
        expect(storage.removeItem).not.toHaveBeenCalled();
      }
    });

    test("keeps malformed JSON and serialization errors visible", () => {
      const { storage, entries } = createStorage({ [KEY]: "malformed JSON" });
      const onStorageError = vi.fn();
      expect(() =>
        renderForm({ name: KEY, options: { storage, onStorageError } }, strict)
      ).toThrow(SyntaxError);
      expect(entries.get(KEY)).toBe("malformed JSON");
      expect(storage.setItem).not.toHaveBeenCalled();
      expect(onStorageError).not.toHaveBeenCalled();

      const empty = createStorage();
      expect(() =>
        renderForm(
          { name: KEY, options: { storage: empty.storage, onStorageError } },
          strict,
          { count: BigInt(1) }
        )
      ).toThrow(TypeError);
      expect(empty.storage.setItem).not.toHaveBeenCalled();
      expect(onStorageError).not.toHaveBeenCalled();
    });

    test("cannot intercept a supplied storage getter evaluated by the caller", () => {
      const error = new DOMException("Caller getter denied", "SecurityError");
      vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
        throw error;
      });
      const onStorageError = vi.fn();
      expectThrown(
        () =>
          renderHook(
            () =>
              useFormPersist(KEY, {
                storage: window.sessionStorage,
                watch: () => ({ field: "default" }),
                setValue: vi.fn(),
                onStorageError,
              }),
            strict ? { wrapper } : {}
          ),
        error
      );
      expect(onStorageError).not.toHaveBeenCalled();
    });
  }
);
