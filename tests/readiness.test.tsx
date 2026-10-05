import React, { StrictMode, useCallback, useEffect, useState } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useForm } from "react-hook-form";

import useFormPersist, { FormPersistConfig } from "../src";

const KEY = "readiness-form";
const NOW = 3001;
type Options = Omit<FormPersistConfig, "watch" | "setValue">;
type Props = { name: string | null; options?: Options };
type Snapshot = { name: string | null; ready: boolean; field: string };
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <StrictMode>{children}</StrictMode>
);

const createStorage = (initial: Record<string, string> = {}) => {
  const entries = new Map(Object.entries(initial));
  const storage = {
    get length() {
      return entries.size;
    },
    key: vi.fn((index: number) => [...entries.keys()][index] ?? null),
    clear: vi.fn(() => entries.clear()),
    getItem: vi.fn((key: string) => entries.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      entries.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      entries.delete(key);
    }),
  };
  return { storage, entries };
};

const renderForm = (initialProps: Props, strict = false) => {
  const renders: Snapshot[] = [];
  const readyEffects: Snapshot[] = [];
  const hook = renderHook(
    ({ name, options }: Props) => {
      const form = useForm({
        defaultValues: { field: "default", secret: "private" },
      });
      const persisted = useFormPersist(name, {
        watch: form.watch,
        setValue: form.setValue,
        ...options,
      });
      const field = form.watch("field");
      const ready = persisted.isSynchronized;
      renders.push({ name, ready, field });
      useEffect(() => {
        if (ready) readyEffects.push({ name, ready, field });
      }, [name, options?.storage, ready, field]);
      return { ...form, ...persisted };
    },
    { initialProps, ...(strict ? { wrapper } : {}) }
  );
  return { ...hook, renders, readyEffects };
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

describe.each([false, true])(
  "restoration readiness with StrictMode=%s",
  (strict) => {
    test("starts false and gates effects on restored values", () => {
      sessionStorage.setItem(KEY, JSON.stringify({ field: "saved" }));
      const onDataRestored = vi.fn();
      const hook = renderForm(
        { name: KEY, options: { onDataRestored } },
        strict
      );
      expect(hook.renders[0]).toEqual({
        name: KEY,
        ready: false,
        field: "default",
      });
      expect(hook.result.current.isSynchronized).toBe(true);
      expect(hook.readyEffects.length).toBeGreaterThan(0);
      expect(hook.readyEffects.every(({ field }) => field === "saved")).toBe(
        true
      );
      expect(onDataRestored).toHaveBeenCalledWith({ field: "saved" });
      expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual({
        field: "saved",
        secret: "private",
      });
      const clear = hook.result.current.clear;
      act(() => hook.result.current.setValue("field", "edited"));
      expect(hook.result.current.isSynchronized).toBe(true);
      expect(hook.result.current.clear).toBe(clear);
      act(() => hook.result.current.clear());
      expect(hook.result.current.isSynchronized).toBe(true);
      expect(sessionStorage.getItem(KEY)).toBeNull();
    });

    test.each(["empty", "empty object", "excluded", "unsafe"])(
      "settles with %s data and preserves applicable defaults",
      (kind) => {
        if (kind !== "empty") {
          const data =
            kind === "empty object"
              ? "{}"
              : kind === "unsafe"
              ? '{"__proto__.polluted":"unsafe"}'
              : '{"field":"excluded"}';
          sessionStorage.setItem(KEY, data);
        }
        const options = kind === "excluded" ? { exclude: ["field"] } : {};
        const hook = renderForm({ name: KEY, options }, strict);
        expect(hook.renders[0].ready).toBe(false);
        expect(hook.result.current.isSynchronized).toBe(true);
        expect(hook.readyEffects.length).toBeGreaterThan(0);
        expect(
          hook.readyEffects.every(({ field }) => field === "default")
        ).toBe(true);
      }
    );

    test("settles after successful expiry without recreating unchanged data", () => {
      sessionStorage.setItem(KEY, '{"field":"expired","_timestamp":1000}');
      const onTimeout = vi.fn();
      const onDataRestored = vi.fn();
      const options = { timeout: 1000, onTimeout, onDataRestored };
      const hook = renderForm({ name: KEY, options }, strict);
      expect(hook.result.current.isSynchronized).toBe(true);
      expect(hook.readyEffects.every(({ field }) => field === "default")).toBe(
        true
      );
      expect(onTimeout).toHaveBeenCalledTimes(1);
      expect(onDataRestored).not.toHaveBeenCalled();
      expect(sessionStorage.getItem(KEY)).toBeNull();
      hook.rerender({ name: KEY, options });
      expect(sessionStorage.getItem(KEY)).toBeNull();
      act(() => hook.result.current.setValue("field", "edited"));
      expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual({
        field: "edited",
        secret: "private",
        _timestamp: NOW,
      });
    });

    test("resets on key changes including a previously synchronized key", () => {
      sessionStorage.setItem(KEY, '{"field":"first"}');
      sessionStorage.setItem("second", '{"field":"second"}');
      const hook = renderForm({ name: KEY }, strict);
      for (const [name, value] of [
        ["second", "second"],
        [KEY, "latest first"],
      ]) {
        sessionStorage.setItem(name, JSON.stringify({ field: value }));
        const renderCount = hook.renders.length;
        const effectCount = hook.readyEffects.length;
        hook.rerender({ name });
        const renders = hook.renders.slice(renderCount);
        const effects = hook.readyEffects.slice(effectCount);
        expect(renders[0].ready).toBe(false);
        expect(hook.result.current.isSynchronized).toBe(true);
        expect(effects.length).toBeGreaterThan(0);
        expect(effects.every(({ field }) => field === value)).toBe(true);
        expect(
          renders
            .filter(({ ready }) => ready)
            .every(({ field }) => field === value)
        ).toBe(true);
      }
    });

    test("resets on storage identity changes before consumers can see old values", () => {
      sessionStorage.setItem(KEY, '{"field":"session"}');
      localStorage.setItem(KEY, '{"field":"local"}');
      const hook = renderForm({ name: KEY }, strict);
      const renderCount = hook.renders.length;
      const effectCount = hook.readyEffects.length;
      hook.rerender({ name: KEY, options: { storage: localStorage } });
      expect(hook.renders[renderCount].ready).toBe(false);
      expect(hook.result.current.isSynchronized).toBe(true);
      expect(hook.readyEffects.slice(effectCount)).toEqual([
        { name: KEY, ready: true, field: "local" },
      ]);
    });

    test("stays false while disabled and checks again when re-enabled", () => {
      sessionStorage.setItem(KEY, '{"field":"saved"}');
      const hook = renderForm({ name: null }, strict);
      expect(hook.renders.every(({ ready }) => !ready)).toBe(true);
      expect(hook.readyEffects).toEqual([]);
      hook.rerender({ name: KEY });
      expect(hook.result.current.isSynchronized).toBe(true);
      hook.rerender({ name: null });
      expect(hook.result.current.isSynchronized).toBe(false);
      sessionStorage.setItem(KEY, '{"field":"latest"}');
      const renderCount = hook.renders.length;
      const effectCount = hook.readyEffects.length;
      hook.rerender({ name: KEY });
      expect(hook.renders[renderCount].ready).toBe(false);
      expect(hook.readyEffects.slice(effectCount)).toEqual([
        { name: KEY, ready: true, field: "latest" },
      ]);
    });

    test("settles for empty string keys and custom codecs", () => {
      sessionStorage.setItem("", 'custom:{"field":"decoded"}');
      const serialize = (data: Record<string, any>) =>
        `custom:${JSON.stringify(data)}`;
      const deserialize = (data: string) => JSON.parse(data.slice(7));
      const hook = renderForm(
        { name: "", options: { serialize, deserialize } },
        strict
      );
      expect(hook.result.current.isSynchronized).toBe(true);
      expect(hook.readyEffects.every(({ field }) => field === "decoded")).toBe(
        true
      );
    });

    test.each(["getter", "read", "expiry removal"])(
      "does not report handled initial %s failures as ready",
      (operation) => {
        const error = new Error("Storage denied");
        const { storage, entries } = createStorage({
          [KEY]: '{"field":"saved","_timestamp":1000}',
        });
        const fail = () => {
          throw error;
        };
        const onStorageError = vi.fn();
        if (operation === "getter") {
          vi.spyOn(window, "sessionStorage", "get").mockImplementation(fail);
        } else if (operation === "read") {
          storage.getItem.mockImplementation(fail);
        } else {
          storage.removeItem.mockImplementation(fail);
        }
        const options = {
          ...(operation === "getter" ? {} : { storage }),
          onStorageError,
          timeout: 1000,
        };
        const hook = renderForm({ name: KEY, options }, strict);
        expect(hook.result.current.isSynchronized).toBe(false);
        expect(hook.readyEffects).toEqual([]);
        expect(onStorageError).toHaveBeenCalledTimes(1);
        expect(onStorageError).toHaveBeenCalledWith(error);
        expect(storage.setItem).not.toHaveBeenCalled();
        expect(entries.has(KEY)).toBe(true);
        act(() => hook.result.current.setValue("field", "local edit"));
        hook.rerender({ name: KEY, options });
        expect(hook.result.current.isSynchronized).toBe(false);
        expect(onStorageError).toHaveBeenCalledTimes(1);
        hook.rerender({
          name: KEY,
          options: { storage: createStorage().storage },
        });
        expect(hook.result.current.isSynchronized).toBe(true);
      }
    );

    test("does not reuse readiness when the next key cannot be read", () => {
      const { storage } = createStorage({ [KEY]: '{"field":"saved"}' });
      const options = { storage, onStorageError: vi.fn() };
      const hook = renderForm({ name: KEY, options }, strict);
      storage.getItem.mockImplementation(() => {
        throw new Error("Read denied");
      });
      const effectCount = hook.readyEffects.length;
      hook.rerender({ name: "failed", options });
      expect(hook.result.current.isSynchronized).toBe(false);
      expect(hook.readyEffects.slice(effectCount)).toEqual([]);
    });

    test.each(["write", "clear"])(
      "keeps initial readiness after a handled %s failure",
      (operation) => {
        const { storage } = createStorage();
        const error = new Error("Storage denied");
        const fail = () => {
          throw error;
        };
        const onStorageError = vi.fn();
        if (operation === "write") storage.setItem.mockImplementation(fail);
        const hook = renderForm(
          { name: KEY, options: { storage, onStorageError } },
          strict
        );
        if (operation === "clear") {
          storage.removeItem.mockImplementation(fail);
          act(() => hook.result.current.clear());
        }
        expect(hook.result.current.isSynchronized).toBe(true);
        expect(onStorageError).toHaveBeenCalledTimes(1);
        expect(onStorageError).toHaveBeenCalledWith(error);
      }
    );

    test("does not mark a target ready if its restoration callback disables it", () => {
      sessionStorage.setItem(KEY, '{"field":"saved"}');
      const readiness: boolean[] = [];
      const hook = renderHook(
        () => {
          const [name, setName] = useState<string | null>(KEY);
          const form = useForm({ defaultValues: { field: "default" } });
          const onDataRestored = useCallback(() => setName(null), []);
          const persisted = useFormPersist(name, { ...form, onDataRestored });
          readiness.push(persisted.isSynchronized);
          return persisted;
        },
        strict ? { wrapper } : {}
      );
      expect(hook.result.current.isSynchronized).toBe(false);
      expect(readiness.every((ready) => !ready)).toBe(true);
    });

    test("starts false on a real remount and does no background work after unmount", async () => {
      const { storage } = createStorage({ [KEY]: '{"field":"saved"}' });
      const options = { storage };
      const hook = renderForm({ name: KEY, options }, strict);
      hook.unmount();
      const reads = storage.getItem.mock.calls.length;
      const writes = storage.setItem.mock.calls.length;
      await act(async () => {
        await Promise.resolve();
      });
      expect(storage.getItem).toHaveBeenCalledTimes(reads);
      expect(storage.setItem).toHaveBeenCalledTimes(writes);
      const remounted = renderForm({ name: KEY, options }, strict);
      expect(remounted.renders[0].ready).toBe(false);
      expect(remounted.result.current.isSynchronized).toBe(true);
      expect(
        remounted.readyEffects.every(({ field }) => field === "saved")
      ).toBe(true);
    });

    test.each([
      "read",
      "deserialize",
      "setValue",
      "onDataRestored",
      "onTimeout",
      "expiry removal",
    ])(
      "propagates %s errors without committing a ready result",
      (operation) => {
        vi.spyOn(console, "error").mockImplementation(() => {});
        const error = new Error(`Failed ${operation}`);
        const fail = () => {
          throw error;
        };
        const { storage } = createStorage({
          [KEY]: '{"field":"saved","_timestamp":1000}',
        });
        const onStorageError = vi.fn();
        const options: Options = { storage };
        if (operation === "read") storage.getItem.mockImplementation(fail);
        if (operation === "deserialize") options.deserialize = fail;
        if (operation === "onDataRestored") options.onDataRestored = fail;
        if (["onTimeout", "expiry removal"].includes(operation))
          options.timeout = 1000;
        if (operation === "onTimeout") options.onTimeout = fail;
        if (operation === "expiry removal")
          storage.removeItem.mockImplementation(fail);
        if (!["read", "expiry removal"].includes(operation))
          options.onStorageError = onStorageError;
        const readyEffects: boolean[] = [];
        expect(() =>
          renderHook(
            () => {
              const form = useForm({ defaultValues: { field: "default" } });
              const result = useFormPersist(KEY, {
                ...options,
                watch: form.watch,
                setValue: operation === "setValue" ? fail : form.setValue,
              });
              useEffect(() => {
                if (result.isSynchronized) readyEffects.push(true);
              });
              return result;
            },
            strict ? { wrapper } : {}
          )
        ).toThrow(error);
        expect(readyEffects).toEqual([]);
        expect(onStorageError).not.toHaveBeenCalled();
      }
    );
  }
);
