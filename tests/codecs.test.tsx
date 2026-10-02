import React, { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useForm } from "react-hook-form";

import useFormPersist, { FormPersistConfig } from "../src";

const STORAGE_KEY = "codec-form";
type Options = Omit<FormPersistConfig, "watch" | "setValue">;
const serialize = (data: Record<string, any>) =>
  JSON.stringify({
    ...data,
    date: data.date.toISOString(),
    count: data.count.toString(),
  });
const deserialize = (serialized: string) => {
  const data = JSON.parse(serialized);
  return { ...data, date: new Date(data.date), count: BigInt(data.count) };
};

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const renderPersistedForm = (
  defaultValues: Record<string, any>,
  options: Options = {},
  strict = false
) => {
  return renderHook(
    () => {
      const form = useForm({ defaultValues });
      const persisted = useFormPersist(STORAGE_KEY, {
        watch: form.watch,
        setValue: form.setValue,
        ...options,
      });
      return { ...form, ...persisted };
    },
    strict
      ? { wrapper: ({ children }) => <StrictMode>{children}</StrictMode> }
      : {}
  );
};

describe("custom serialization", () => {
  test("restores custom data serialized as an empty string", () => {
    const serializer = () => "";
    const deserializer = vi.fn(() => ({ field: "restored" }));
    window.sessionStorage.setItem(STORAGE_KEY, "");

    const form = renderPersistedForm(
      { field: "default" },
      { serialize: serializer, deserialize: deserializer },
      true
    );

    expect(deserializer).toHaveBeenCalledWith("");
    expect(form.result.current.getValues()).toEqual({ field: "restored" });
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe("");
  });

  test.each([
    { stored: "{}", strict: false },
    { stored: "{}", strict: true },
    { stored: '{"secret":"old-secret","_timestamp":123}', strict: false },
    { stored: '{"secret":"old-secret","_timestamp":123}', strict: true },
  ])(
    "persists current values when no fields can be restored: %j",
    ({ stored, strict }) => {
      window.sessionStorage.setItem(STORAGE_KEY, stored);

      const form = renderPersistedForm(
        { public: "current", secret: "current-secret" },
        { exclude: ["secret"] },
        strict
      );

      expect(form.result.current.getValues()).toEqual({
        public: "current",
        secret: "current-secret",
      });
      expect(JSON.parse(window.sessionStorage.getItem(STORAGE_KEY)!)).toEqual({
        public: "current",
      });
    }
  );

  test("preserves JSON defaults when codecs are omitted", () => {
    const defaults = {
      text: "saved",
      nested: { enabled: true },
      items: [1, 2],
    };
    const first = renderPersistedForm(defaults);
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe(
      JSON.stringify(defaults)
    );
    first.unmount();

    const second = renderPersistedForm({ text: "default" });
    expect(second.result.current.getValues()).toEqual(defaults);
  });

  test("roundtrips Date and BigInt through react-hook-form and persists later changes", () => {
    const defaults = {
      date: new Date("2024-01-11T00:00:00.000Z"),
      count: BigInt("9007199254740993"),
    };
    const options = { serialize, deserialize };
    const first = renderPersistedForm(defaults, options);
    expect(JSON.parse(window.sessionStorage.getItem(STORAGE_KEY)!)).toEqual({
      date: "2024-01-11T00:00:00.000Z",
      count: "9007199254740993",
    });
    first.unmount();

    const second = renderPersistedForm(
      { date: new Date(0), count: BigInt(0) },
      options
    );
    expect(second.result.current.getValues()).toEqual(defaults);
    expect(second.result.current.getValues().date).toBeInstanceOf(Date);
    act(() =>
      second.result.current.setValue("count", BigInt("9007199254740995"))
    );
    expect(JSON.parse(window.sessionStorage.getItem(STORAGE_KEY)!).count).toBe(
      "9007199254740995"
    );
  });

  test("keeps persisted values over defaults during StrictMode effect replay", () => {
    const persisted = {
      date: new Date("2024-01-11T00:00:00.000Z"),
      count: BigInt(42),
    };
    window.sessionStorage.setItem(STORAGE_KEY, serialize(persisted));
    const form = renderPersistedForm(
      { date: new Date(0), count: BigInt(0) },
      { serialize, deserialize },
      true
    );
    expect(form.result.current.getValues()).toEqual(persisted);
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe(
      serialize(persisted)
    );
    act(() => form.result.current.setValue("count", BigInt(43)));
    form.unmount();

    const remounted = renderPersistedForm(
      { date: new Date(0), count: BigInt(0) },
      { serialize, deserialize },
      true
    );
    expect(remounted.result.current.getValues()).toEqual({
      ...persisted,
      count: BigInt(43),
    });
  });

  test("filters excluded values before serialization and after deserialization", () => {
    const serializer = vi.fn(JSON.stringify);
    const first = renderPersistedForm(
      { public: "value", secret: "password" },
      { exclude: ["secret"], serialize: serializer }
    );
    expect(serializer).toHaveBeenLastCalledWith({ public: "value" });
    first.unmount();
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        public: "restored",
        secret: "stored-secret",
        _timestamp: 123,
      })
    );
    const onDataRestored = vi.fn();
    const second = renderPersistedForm(
      { public: "default", secret: "default-secret" },
      { exclude: ["secret"], deserialize: JSON.parse, onDataRestored }
    );
    expect(second.result.current.getValues()).toEqual({
      public: "restored",
      secret: "default-secret",
    });
    expect(onDataRestored).toHaveBeenCalledWith({ public: "restored" });
  });

  test("passes timeout metadata through custom codecs without restoring it as a field", () => {
    vi.spyOn(Date, "now").mockReturnValue(2000);
    const serializer = vi.fn(
      (data: Record<string, any>) => `custom:${JSON.stringify(data)}`
    );
    const deserializer = (data: string) => JSON.parse(data.slice(7));
    const first = renderPersistedForm(
      { field: "saved" },
      { serialize: serializer, deserialize: deserializer, timeout: 1000 }
    );
    expect(serializer).toHaveBeenLastCalledWith({
      field: "saved",
      _timestamp: 2000,
    });
    first.unmount();

    vi.mocked(Date.now).mockReturnValue(2500);
    const onTimeout = vi.fn();
    const second = renderPersistedForm(
      { field: "default" },
      {
        serialize: serializer,
        deserialize: deserializer,
        timeout: 1000,
        onTimeout,
      }
    );
    expect(second.result.current.getValues()).toEqual({ field: "saved" });
    expect(onTimeout).not.toHaveBeenCalled();
  });

  test("removes expired custom data and does not restore or rewrite it in StrictMode", () => {
    vi.spyOn(Date, "now").mockReturnValue(3001);
    window.sessionStorage.setItem(
      STORAGE_KEY,
      `custom:${JSON.stringify({ field: "expired", _timestamp: 2000 })}`
    );
    const onTimeout = vi.fn();
    const onDataRestored = vi.fn();
    const form = renderPersistedForm(
      { field: "default" },
      {
        serialize: (data) => `custom:${JSON.stringify(data)}`,
        deserialize: (data) => JSON.parse(data.slice(7)),
        timeout: 1000,
        onTimeout,
        onDataRestored,
      },
      true
    );
    expect(form.result.current.getValues()).toEqual({ field: "default" });
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(onDataRestored).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  test("clear removes custom data so a remount uses defaults", () => {
    const first = renderPersistedForm(
      { date: new Date(0), count: BigInt(1) },
      { serialize, deserialize }
    );
    act(() => first.result.current.clear());
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    first.unmount();
    const second = renderPersistedForm(
      { date: new Date(0), count: BigInt(2) },
      { serialize, deserialize }
    );
    expect(second.result.current.getValues().count).toBe(BigInt(2));
  });

  test("uses a replacement serializer with unchanged watched values", () => {
    const values = { field: "value" };
    const watch = () => values;
    const setValue = vi.fn();
    const replacement = vi.fn(
      (data: Record<string, any>) => `custom:${JSON.stringify(data)}`
    );
    const { rerender } = renderHook(
      ({ serializer }) =>
        useFormPersist(STORAGE_KEY, { watch, setValue, serialize: serializer }),
      {
        initialProps: {
          serializer: JSON.stringify as (data: Record<string, any>) => string,
        },
      }
    );
    rerender({ serializer: replacement });
    expect(replacement).toHaveBeenCalledWith(values);
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe(
      'custom:{"field":"value"}'
    );
  });

  test("uses a replacement deserializer to restore existing data", () => {
    window.sessionStorage.setItem(STORAGE_KEY, '{"field":"value"}');
    const values = {};
    const watch = () => values;
    const setValue = vi.fn();
    const replacement = vi.fn((data: string) => ({
      field: JSON.parse(data).field.toUpperCase(),
    }));
    const { rerender } = renderHook(
      ({ deserializer }) =>
        useFormPersist(STORAGE_KEY, {
          watch,
          setValue,
          deserialize: deserializer,
        }),
      {
        initialProps: {
          deserializer: JSON.parse as (data: string) => Record<string, any>,
        },
      }
    );
    rerender({ deserializer: replacement });
    expect(replacement).toHaveBeenCalledWith('{"field":"value"}');
    expect(setValue).toHaveBeenLastCalledWith("field", "VALUE", {
      shouldValidate: false,
      shouldDirty: false,
      shouldTouch: false,
    });
  });

  test("persists to a changed key and storage with unchanged watched values", () => {
    const values = { field: "value" };
    const watch = () => values;
    const setValue = vi.fn();
    const { rerender, result } = renderHook(
      ({ name, storage }) => useFormPersist(name, { watch, setValue, storage }),
      {
        initialProps: { name: STORAGE_KEY, storage: window.sessionStorage },
      }
    );
    rerender({ name: "new-key", storage: window.localStorage });
    expect(window.localStorage.getItem("new-key")).toBe(JSON.stringify(values));
    act(() => result.current.clear());
    expect(window.localStorage.getItem("new-key")).toBeNull();
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe(
      JSON.stringify(values)
    );
  });

  test("updates exclusions with unchanged watched values", () => {
    const values = { public: "value", secret: "password" };
    const watch = () => values;
    const setValue = vi.fn();
    const { rerender } = renderHook(
      ({ exclude }) =>
        useFormPersist(STORAGE_KEY, { watch, setValue, exclude }),
      {
        initialProps: { exclude: [] as string[] },
      }
    );
    rerender({ exclude: ["secret"] });
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe(
      '{"public":"value"}'
    );
  });
});

describe("codec and storage errors", () => {
  beforeEach(() => {
    // React reports effect errors to console as well as propagating them.
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  test("propagates malformed JSON and leaves stored data unchanged", () => {
    window.sessionStorage.setItem(STORAGE_KEY, "invalid JSON");
    expect(() => renderPersistedForm({ field: "default" })).toThrow(
      SyntaxError
    );
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe("invalid JSON");
  });

  test("propagates custom deserialization errors", () => {
    window.sessionStorage.setItem(STORAGE_KEY, "custom data");
    const error = new Error("unsupported format");
    expect(() =>
      renderPersistedForm(
        {},
        {
          deserialize: () => {
            throw error;
          },
        }
      )
    ).toThrow(error);
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBe("custom data");
  });

  test("propagates custom serialization errors without writing", () => {
    const error = new Error("unsupported value");
    expect(() =>
      renderPersistedForm(
        { field: "value" },
        {
          serialize: () => {
            throw error;
          },
        }
      )
    ).toThrow(error);
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  test("preserves the default JSON error for BigInt values", () => {
    expect(() => renderPersistedForm({ count: BigInt(1) })).toThrow(TypeError);
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  test("propagates storage write errors", () => {
    const error = new Error("storage full");
    vi.spyOn(window.Storage.prototype, "setItem").mockImplementation(() => {
      throw error;
    });
    expect(() => renderPersistedForm({ field: "value" })).toThrow(error);
  });
});
