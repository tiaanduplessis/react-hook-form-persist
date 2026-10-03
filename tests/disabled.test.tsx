import React, { StrictMode, useCallback, useState } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useForm } from "react-hook-form";

import useFormPersist, { FormPersistConfig } from "../src";

const KEY = "conditional-form";
const NOW = 3001;
type Options = Omit<FormPersistConfig, "watch" | "setValue">;
type Props = { name: string | null; options?: Options };
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <StrictMode>{children}</StrictMode>
);
const saved = (key = KEY, storage = sessionStorage) =>
  JSON.parse(storage.getItem(key)!);
const renderForm = (initialProps: Props, strict = false) =>
  renderHook(
    ({ name, options }: Props) => {
      const form = useForm({
        defaultValues: { field: "default", secret: "private" },
      });
      const persisted = useFormPersist(name, {
        watch: form.watch,
        setValue: form.setValue,
        ...options,
      });
      return { ...form, ...persisted };
    },
    { initialProps, ...(strict ? { wrapper } : {}) }
  );

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  vi.spyOn(Date, "now").mockReturnValue(NOW);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe.each([false, true])("disabled key with StrictMode=%s", (strict) => {
  test("skips storage, codecs, restoration and expiry work, including clear", () => {
    const stored = JSON.stringify({ field: "old", _timestamp: 1000 });
    sessionStorage.setItem(KEY, stored);
    sessionStorage.setItem("null", stored);
    const getItem = vi.spyOn(Storage.prototype, "getItem");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const removeItem = vi.spyOn(Storage.prototype, "removeItem");
    const serialize = vi.fn(JSON.stringify);
    const deserialize = vi.fn(JSON.parse);
    const onTimeout = vi.fn();
    const onDataRestored = vi.fn();
    const options = {
      serialize,
      deserialize,
      onTimeout,
      onDataRestored,
      timeout: 1,
    };
    const form = renderForm({ name: null, options }, strict);
    const clear = form.result.current.clear;
    expect(typeof clear).toBe("function");
    form.rerender({ name: null, options });
    expect(form.result.current.clear).toBe(clear);
    act(() => form.result.current.setValue("field", "edited while disabled"));
    act(() => form.result.current.clear());
    for (const spy of [
      getItem,
      setItem,
      removeItem,
      serialize,
      deserialize,
      onTimeout,
      onDataRestored,
    ]) {
      expect(spy).not.toHaveBeenCalled();
    }
    expect(form.result.current.getValues().field).toBe("edited while disabled");
    getItem.mockRestore();
    expect(sessionStorage.getItem(KEY)).toBe(stored);
    expect(sessionStorage.getItem("null")).toBe(stored);
  });

  test("does not touch a denied default storage getter or subscribe to watch", () => {
    const getter = vi
      .spyOn(window, "sessionStorage", "get")
      .mockImplementation(() => {
        throw new DOMException("Storage denied", "SecurityError");
      });
    const watch = vi.fn(() => ({ field: "default" }));
    const setValue = vi.fn();
    const form = renderHook(
      () => useFormPersist(null, { watch, setValue }),
      strict ? { wrapper } : {}
    );
    form.rerender();
    act(() => form.result.current.clear());
    expect(getter).not.toHaveBeenCalled();
    expect(watch).not.toHaveBeenCalled();
    expect(setValue).not.toHaveBeenCalled();
  });

  test("restores on first enable, leaves data intact while disabled, and reads the latest value on re-enable", () => {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ field: "saved", secret: "old secret" })
    );
    const onDataRestored = vi.fn();
    const options = { onDataRestored, include: ["field"] };
    const form = renderForm({ name: null, options }, strict);
    act(() => form.result.current.setValue("field", "unsaved default"));
    form.rerender({ name: KEY, options });
    expect(form.result.current.getValues()).toEqual({
      field: "saved",
      secret: "private",
    });
    expect(saved()).toEqual({ field: "saved" });
    act(() => form.result.current.setValue("field", "first edit"));
    expect(saved()).toEqual({ field: "first edit" });
    form.rerender({ name: null, options });
    act(() => form.result.current.setValue("field", "disabled edit"));
    act(() => form.result.current.clear());
    expect(saved()).toEqual({ field: "first edit" });
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ field: "latest external save" })
    );
    form.rerender({ name: KEY, options });
    expect(form.result.current.getValues().field).toBe("latest external save");
    expect(saved()).toEqual({ field: "latest external save" });
    expect(onDataRestored).toHaveBeenLastCalledWith({
      field: "latest external save",
    });
    act(() => form.result.current.setValue("field", "first re-enabled edit"));
    expect(saved()).toEqual({ field: "first re-enabled edit" });
    form.unmount();
    const remounted = renderForm({ name: KEY, options }, strict);
    expect(remounted.result.current.getValues().field).toBe(
      "first re-enabled edit"
    );
  });

  test("saves current values when enabled without stored data and preserves empty string keys", () => {
    const form = renderForm({ name: null }, strict);
    act(() => form.result.current.setValue("field", "disabled edit"));
    form.rerender({ name: "" });
    expect(saved("")).toEqual({ field: "disabled edit", secret: "private" });
    expect(sessionStorage.getItem("null")).toBeNull();
    act(() => form.result.current.clear());
    expect(sessionStorage.getItem("")).toBeNull();
    form.unmount();
    sessionStorage.setItem("", JSON.stringify({ field: "empty key restore" }));
    expect(
      renderForm({ name: "" }, strict).result.current.getValues().field
    ).toBe("empty key restore");
  });

  test("uses a new key and the latest configuration after disabled changes", () => {
    sessionStorage.setItem(KEY, JSON.stringify({ field: "original" }));
    const form = renderForm({ name: KEY }, strict);
    const original = sessionStorage.getItem(KEY);
    form.rerender({ name: null });
    const deserialize = vi.fn((str: string) => JSON.parse(str.slice(7)));
    const serialize = vi.fn(
      (values: Record<string, any>) => `custom:${JSON.stringify(values)}`
    );
    const onDataRestored = vi.fn();
    const options = {
      storage: localStorage,
      include: ["field"],
      exclude: ["secret"],
      deserialize,
      serialize,
      onDataRestored,
    };
    localStorage.setItem(
      "other",
      'custom:{"field":"new storage","secret":"hidden"}'
    );
    form.rerender({ name: null, options });
    expect(serialize).not.toHaveBeenCalled();
    expect(deserialize).not.toHaveBeenCalled();
    form.rerender({ name: "other", options });
    expect(form.result.current.getValues().field).toBe("new storage");
    expect(onDataRestored).toHaveBeenCalledWith({ field: "new storage" });
    expect(localStorage.getItem("other")).toBe(
      'custom:{"field":"new storage"}'
    );
    expect(sessionStorage.getItem(KEY)).toBe(original);
  });

  test("does not expire disabled data, expires on enabling, then saves the first edit", () => {
    const expired = JSON.stringify({ field: "expired", _timestamp: 1000 });
    sessionStorage.setItem(KEY, expired);
    const onTimeout = vi.fn();
    const options = { timeout: 1000, onTimeout, include: ["field"] };
    const form = renderForm({ name: null, options }, strict);
    expect(sessionStorage.getItem(KEY)).toBe(expired);
    expect(onTimeout).not.toHaveBeenCalled();
    form.rerender({ name: KEY, options });
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(KEY)).toBeNull();
    form.rerender({ name: KEY, options });
    expect(sessionStorage.getItem(KEY)).toBeNull();
    act(() => form.result.current.setValue("field", "after expiry"));
    expect(saved()).toEqual({ field: "after expiry", _timestamp: NOW });
    form.rerender({ name: null, options });
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ field: "new saved", _timestamp: NOW })
    );
    form.rerender({ name: KEY, options });
    expect(form.result.current.getValues().field).toBe("new saved");
    expect(saved()).toEqual({ field: "new saved", _timestamp: NOW });
  });

  test("disables during restoration without overwriting and re-enables from the latest save", () => {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ field: "restored during callback" })
    );
    const form = renderHook(
      () => {
        const [name, setName] = useState<string | null>(KEY);
        const form = useForm({ defaultValues: { field: "default" } });
        const onDataRestored = useCallback(() => setName(null), []);
        const persisted = useFormPersist(name, {
          watch: form.watch,
          setValue: form.setValue,
          onDataRestored,
        });
        return { ...form, ...persisted, name, setName };
      },
      strict ? { wrapper } : {}
    );
    expect(form.result.current.name).toBeNull();
    expect(saved()).toEqual({ field: "restored during callback" });
    act(() => form.result.current.setValue("field", "disabled edit"));
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ field: "latest in-flight save" })
    );
    act(() => form.result.current.setName(KEY));
    expect(form.result.current.name).toBeNull();
    expect(form.result.current.getValues().field).toBe("latest in-flight save");
    expect(saved()).toEqual({ field: "latest in-flight save" });
  });
});

test("handles rapid disable/re-enable with a stable watch object and preserves restore flags", () => {
  const values = { field: "default" };
  const watch = () => values;
  const setValue = vi.fn();
  const form = renderHook(
    ({ name }: { name: string | null }) =>
      useFormPersist(name, {
        watch,
        setValue,
        include: ["field"],
        validate: true,
        dirty: true,
        touch: true,
      }),
    { initialProps: { name: null as string | null }, wrapper }
  );
  for (let round = 0; round < 3; round++) {
    sessionStorage.setItem(KEY, JSON.stringify({ field: `saved ${round}` }));
    form.rerender({ name: KEY });
    expect(saved()).toEqual({ field: `saved ${round}` });
    expect(setValue).toHaveBeenLastCalledWith("field", `saved ${round}`, {
      shouldValidate: true,
      shouldDirty: true,
      shouldTouch: true,
    });
    form.rerender({ name: null });
    act(() => form.result.current.clear());
    expect(saved()).toEqual({ field: `saved ${round}` });
  }
});

test("propagates storage and codec errors after enabling", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const form = renderForm({ name: null });
  sessionStorage.setItem(KEY, "invalid JSON");
  expect(() => form.rerender({ name: KEY })).toThrow(SyntaxError);
  expect(sessionStorage.getItem(KEY)).toBe("invalid JSON");
  const error = new DOMException("Storage denied", "SecurityError");
  const denied = renderForm({ name: null });
  vi.spyOn(window, "sessionStorage", "get").mockImplementation(() => {
    throw error;
  });
  expect(() => denied.rerender({ name: KEY })).toThrow(error);
});
