import React, { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useForm } from "react-hook-form";

import useFormPersist from "../src";
import { isSafeField } from "../src/fields";

const KEY = "reserved-fields";
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <StrictMode>{children}</StrictMode>
);
const reservedPaths = ["__proto__", "constructor", "prototype"].flatMap(
  (key) => [
    key,
    `profile.${key}.label`,
    `profile[${key}].label`,
    `profile['${key}'].label`,
    `profile["${key}"].label`,
    `items[0].${key}.label`,
  ]
);

beforeEach(() => sessionStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe.each([false, true])("reserved fields with StrictMode=%s", (strict) => {
  const options = strict ? { wrapper } : {};

  test.each(reservedPaths)("omits %s before callbacks and storage", (name) => {
    const values = JSON.parse(
      JSON.stringify({ [name]: { label: "fixture" }, safe: "saved" })
    );
    const setValue = vi.fn();
    const onDataRestored = vi.fn();
    const defaults = { safe: "default" };
    sessionStorage.setItem(KEY, JSON.stringify(values));
    const restored = renderHook(
      () =>
        useFormPersist(KEY, {
          watch: () => defaults,
          setValue,
          onDataRestored,
          include: [name, "safe"],
        }),
      options
    );
    expect(setValue.mock.calls.map(([key]) => key)).toEqual(
      strict ? ["safe", "safe"] : ["safe"]
    );
    for (const [data] of onDataRestored.mock.calls) {
      expect(data).toEqual({ safe: "saved" });
      expect(Object.keys(data)).toEqual(["safe"]);
      expect(Object.getPrototypeOf(data)).toBe(Object.prototype);
    }
    expect(Object.prototype).not.toHaveProperty("label");
    restored.unmount();

    sessionStorage.clear();
    const serialize = vi.fn(JSON.stringify);
    renderHook(
      () =>
        useFormPersist(KEY, {
          watch: () => values,
          setValue,
          serialize,
          include: [name, "safe"],
        }),
      options
    );
    expect(serialize).toHaveBeenLastCalledWith({ safe: "saved" });
    expect(Object.getPrototypeOf(serialize.mock.calls.at(-1)![0])).toBe(
      Object.prototype
    );
    expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual({ safe: "saved" });
    expect(Object.keys(values)).toEqual([name, "safe"]);
  });

  test.each(["__proto__", "constructor", "prototype"])(
    "omits a whole field containing nested %s without mutating its value",
    (name) => {
      const nested = JSON.parse(
        JSON.stringify({ label: "keep in original", [name]: "fixture" })
      );
      const values = { profile: { items: [nested] }, safe: "saved" };
      const setValue = vi.fn();
      const onDataRestored = vi.fn();
      const serialize = vi.fn(JSON.stringify);
      const deserialize = vi.fn(() => values);
      sessionStorage.setItem(KEY, "custom codec input");
      const restored = renderHook(
        () =>
          useFormPersist(KEY, {
            watch: () => ({ safe: "default" }),
            setValue,
            onDataRestored,
            deserialize,
          }),
        options
      );
      expect(setValue.mock.calls.every(([key]) => key === "safe")).toBe(true);
      expect(onDataRestored).toHaveBeenLastCalledWith({ safe: "saved" });
      restored.unmount();

      sessionStorage.clear();
      renderHook(
        () => useFormPersist(KEY, { watch: () => values, setValue, serialize }),
        options
      );
      expect(serialize).toHaveBeenLastCalledWith({ safe: "saved" });
      expect(Object.keys(nested)).toEqual(["label", name]);
      expect(values.profile.items[0]).toBe(nested);
      expect(Object.getPrototypeOf(nested)).toBe(Object.prototype);
    }
  );

  test("returns an ordinary empty callback and saves safe defaults when all stored fields are omitted", () => {
    const stored = JSON.parse('{"__proto__":{"label":"fixture"}}');
    const onDataRestored = vi.fn();
    const setValue = vi.fn();
    sessionStorage.setItem(KEY, JSON.stringify(stored));
    renderHook(
      () =>
        useFormPersist(KEY, {
          watch: () => ({ safe: "default" }),
          setValue,
          onDataRestored,
        }),
      options
    );
    expect(onDataRestored.mock.calls[0][0]).toEqual({});
    expect(Object.getPrototypeOf(onDataRestored.mock.calls[0][0])).toBe(
      Object.prototype
    );
    expect(setValue.mock.calls.every(([key]) => key === "safe")).toBe(true);
    expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual({
      safe: "default",
    });
  });

  test("keeps storage intact when no safe values remain to write", () => {
    const stored = '{"constructor":"fixture"}';
    const onDataRestored = vi.fn();
    const serialize = vi.fn(JSON.stringify);
    const setValue = vi.fn();
    sessionStorage.setItem(KEY, stored);
    renderHook(
      () =>
        useFormPersist(KEY, {
          watch: () => JSON.parse(stored),
          setValue,
          onDataRestored,
          serialize,
        }),
      options
    );
    expect(setValue).not.toHaveBeenCalled();
    expect(onDataRestored).toHaveBeenLastCalledWith({});
    expect(serialize).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(KEY)).toBe(stored);
  });

  test("restores and edits ordinary nested fields with real RHF", () => {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({
        profile: { label: "stored", items: [{ count: 1 }] },
        omitted: { constructor: "fixture" },
      })
    );
    const onDataRestored = vi.fn();
    const form = renderHook(() => {
      const methods = useForm({
        defaultValues: {
          profile: { label: "default", items: [{ count: 0 }] },
          omitted: { label: "default" },
        },
      });
      useFormPersist(KEY, {
        watch: methods.watch,
        setValue: methods.setValue,
        onDataRestored,
      });
      return methods;
    }, options);
    expect(onDataRestored).toHaveBeenLastCalledWith({
      profile: { label: "stored", items: [{ count: 1 }] },
    });
    expect(form.result.current.getValues("omitted")).toEqual({
      label: "default",
    });
    act(() => form.result.current.setValue("profile.items.0.count", 2));
    expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual({
      profile: { label: "stored", items: [{ count: 2 }] },
      omitted: { label: "default" },
    });
  });

  test("rejects every alias of a shared unsafe value", () => {
    const shared = { prototype: "fixture" };
    const values = { first: shared, second: shared, safe: "value" };
    const serialize = vi.fn(JSON.stringify);
    renderHook(
      () =>
        useFormPersist(KEY, {
          watch: () => values,
          setValue: vi.fn(),
          serialize,
        }),
      options
    );
    expect(serialize).toHaveBeenLastCalledWith({ safe: "value" });
    expect(values.first).toBe(values.second);
    expect(shared).toEqual({ prototype: "fixture" });
  });

  test("preserves accepted value identity for codecs and restoration callbacks", () => {
    const profile = {
      constructorName: "ordinary",
      items: [{ label: "value" }],
    };
    const date = new Date(0);
    const values = { profile, date };
    const onDataRestored = vi.fn();
    const setValue = vi.fn();
    sessionStorage.setItem(KEY, "custom");
    const restored = renderHook(
      () =>
        useFormPersist(KEY, {
          watch: () => ({}),
          setValue,
          deserialize: () => values,
          onDataRestored,
        }),
      options
    );
    expect(onDataRestored.mock.calls[0][0].profile).toBe(profile);
    expect(onDataRestored.mock.calls[0][0].date).toBe(date);
    expect(setValue.mock.calls.find(([key]) => key === "profile")![1]).toBe(
      profile
    );
    restored.unmount();

    sessionStorage.clear();
    const serialize = vi.fn((_data: Record<string, any>) => "custom");
    renderHook(
      () =>
        useFormPersist(KEY, {
          watch: () => values,
          setValue,
          serialize,
          deserialize: () => values,
        }),
      options
    );
    expect(serialize.mock.calls[0][0].profile).toBe(profile);
    expect(serialize.mock.calls[0][0].date).toBe(date);
    expect(sessionStorage.getItem(KEY)).toBe("custom");
  });

  test("does not inspect nested values in excluded fields", () => {
    const ignored = Object.defineProperty({}, "label", {
      enumerable: true,
      get: () => {
        throw new Error("excluded value was inspected");
      },
    });
    const serialize = vi.fn(JSON.stringify);
    renderHook(
      () =>
        useFormPersist(KEY, {
          watch: () => ({ ignored, safe: "value" }),
          setValue: vi.fn(),
          exclude: ["ignored"],
          serialize,
        }),
      options
    );
    expect(serialize).toHaveBeenLastCalledWith({ safe: "value" });
  });
});

describe("field safety boundaries", () => {
  test("checks nested and inherited enumerable paths", () => {
    const inherited = Object.create({ "constructor.label": "fixture" });
    inherited.safe = "value";
    expect(isSafeField("profile", inherited)).toBe(false);
    expect(isSafeField("profile", [{ "nested['__proto__']": "fixture" }])).toBe(
      false
    );
    expect(isSafeField("profile", { "nested[prototype]": "fixture" })).toBe(
      false
    );
  });

  test("matches RHF path normalization without rejecting similar ordinary names", () => {
    expect(isSafeField("profile.__pro|to__.label", "fixture")).toBe(false);
    expect(isSafeField("profile['constr'uctor'].label", "fixture")).toBe(false);
    expect(isSafeField("profile'__proto__'.label", "fixture")).toBe(false);
    expect(isSafeField('profile"constructor".label', "fixture")).toBe(false);
    for (const key of [
      "constructorName",
      "prototypeLabel",
      "__proto__label",
      "toString",
      "hasOwnProperty",
      "profile.label",
      "items[0].label",
      "",
    ]) {
      expect(isSafeField(key, { label: "value" })).toBe(true);
    }
  });

  test("accepts unchanged opaque values, null-prototype records, shared references, and cycles", () => {
    const cycle: Record<string, any> = { label: "value" };
    cycle.self = cycle;
    const shared = { count: 1 };
    const value = {
      cycle,
      first: shared,
      second: shared,
      date: new Date(0),
      set: new Set(["value"]),
      map: new Map([["label", "value"]]),
      file: new File(["fixture"], "fixture.txt"),
      record: Object.assign(Object.create(null), { label: "value" }),
      empty: null,
      missing: undefined,
      count: BigInt(1),
    };
    expect(isSafeField("field", value)).toBe(true);
    expect(value.cycle).toBe(cycle);
    expect(value.first).toBe(shared);
    cycle.prototype = "fixture";
    expect(isSafeField("field", value)).toBe(false);
  });

  test("does not swallow errors from custom enumerable accessors", () => {
    const error = new Error("custom accessor");
    const value = Object.defineProperty({}, "label", {
      enumerable: true,
      get: () => {
        throw error;
      },
    });
    expect(() => isSafeField("field", value)).toThrow(error);
  });

  test("rejects reserved nested names without invoking their getters", () => {
    const getter = vi.fn(() => {
      throw new Error("reserved accessor");
    });
    const value = Object.defineProperty({}, "constructor", {
      enumerable: true,
      get: getter,
    });
    expect(isSafeField("field", value)).toBe(false);
    expect(getter).not.toHaveBeenCalled();
  });
});
