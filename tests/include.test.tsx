import React, { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";

import useFormPersist, { FormPersistConfig } from "../src";

const KEY = "included-form";
const NOW = 3001;
type Options = Omit<FormPersistConfig, "watch" | "setValue">;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <StrictMode>{children}</StrictMode>
);
const storedValues = () => JSON.parse(sessionStorage.getItem(KEY)!);
const renderForm = (
  defaultValues: Record<string, any>,
  options: Options = {},
  strict = false
) => {
  const hook = renderHook(
    (options: Options) => {
      const form = useForm({ defaultValues });
      const persisted = useFormPersist(KEY, {
        watch: form.watch,
        setValue: form.setValue,
        ...options,
      });
      return { ...form, ...persisted };
    },
    { initialProps: options, ...(strict ? { wrapper } : {}) }
  );
  return {
    ...hook,
    rerender: (next: Options = options) => {
      options = next;
      hook.rerender(next);
    },
  };
};

beforeEach(() => {
  sessionStorage.clear();
  vi.spyOn(Date, "now").mockReturnValue(NOW);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe.each([false, true])("include with StrictMode=%s", (strict) => {
  test("selects top-level fields in both directions, with exclude winning", () => {
    const onDataRestored = vi.fn();
    const serialize = vi.fn(JSON.stringify);
    const selected = {
      email: "saved",
      profile: { name: "saved" },
      items: [1, 2],
    };
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ ...selected, password: "old", other: "old" })
    );
    const options = {
      include: ["email", "profile", "items", "password", "missing"],
      exclude: ["password"],
      onDataRestored,
      serialize,
    };
    const defaults = {
      email: "default",
      profile: { name: "default" },
      items: [],
      password: "default",
      other: "default",
    };
    const form = renderForm(defaults, options, strict);
    expect(form.result.current.getValues()).toEqual({
      ...defaults,
      ...selected,
    });
    expect(onDataRestored).toHaveBeenCalledWith(selected);
    expect(serialize).toHaveBeenLastCalledWith(selected);
    expect(storedValues()).toEqual(selected);
    act(() => form.result.current.setValue("email", "first edit"));
    expect(storedValues().email).toBe("first edit");
    act(() => form.result.current.setValue("profile.name", "nested edit"));
    act(() => form.result.current.setValue("items.0", 3));
    expect(storedValues()).toEqual({
      email: "first edit",
      profile: { name: "nested edit" },
      items: [3, 2],
    });
    form.unmount();
    const remounted = renderForm(defaults, options, strict);
    expect(remounted.result.current.getValues()).toEqual({
      ...defaults,
      email: "first edit",
      profile: { name: "nested edit" },
      items: [3, 2],
    });
  });

  test("does not interpret dotted allowlist entries as nested paths", () => {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ profile: { name: "saved" }, email: "saved" })
    );
    const onDataRestored = vi.fn();
    const form = renderForm(
      { profile: { name: "default" }, email: "default" },
      { include: ["profile.name", "email"], onDataRestored },
      strict
    );
    expect(form.result.current.getValues()).toEqual({
      profile: { name: "default" },
      email: "saved",
    });
    expect(onDataRestored).toHaveBeenCalledWith({ email: "saved" });
    expect(storedValues()).toEqual({ email: "saved" });
  });

  test.each([[], ["missing"], ["_timestamp"]].map((include) => ({ include })))(
    "does not restore, save or remove data with no selected fields: %j",
    ({ include }) => {
      const stored = JSON.stringify({ email: "saved", _timestamp: NOW });
      sessionStorage.setItem(KEY, stored);
      const onDataRestored = vi.fn();
      const serialize = vi.fn(JSON.stringify);
      const form = renderForm(
        { email: "default", _timestamp: "form value" },
        { include, serialize, onDataRestored },
        strict
      );
      expect(form.result.current.getValues()).toEqual({
        email: "default",
        _timestamp: "form value",
      });
      expect(onDataRestored).toHaveBeenCalledWith({});
      expect(serialize).not.toHaveBeenCalled();
      expect(sessionStorage.getItem(KEY)).toBe(stored);
      act(() => form.result.current.setValue("email", "edited"));
      expect(sessionStorage.getItem(KEY)).toBe(stored);
      act(() => form.result.current.clear());
      expect(sessionStorage.getItem(KEY)).toBeNull();
    }
  );

  test("does not create an entry for an empty allowlist, even with a timeout", () => {
    const serialize = vi.fn(JSON.stringify);
    renderForm(
      { email: "default" },
      { include: [], timeout: 1000, serialize },
      strict
    );
    expect(sessionStorage.getItem(KEY)).toBeNull();
    expect(serialize).not.toHaveBeenCalled();
  });

  test("uses defaults when stored fields are not selected", () => {
    sessionStorage.setItem(KEY, JSON.stringify({ secret: "old" }));
    const onDataRestored = vi.fn();
    renderForm(
      { email: "default", secret: "default" },
      { include: ["email"], onDataRestored },
      strict
    );
    expect(onDataRestored).toHaveBeenCalledWith({});
    expect(storedValues()).toEqual({ email: "default" });
  });

  test("changes selection by saving current values without reloading stale data", () => {
    const original = JSON.stringify({ email: "stale", other: "stale" });
    sessionStorage.setItem(KEY, original);
    const onDataRestored = vi.fn();
    const form = renderForm(
      { email: "default", other: "default" },
      { include: [], onDataRestored },
      strict
    );
    expect(sessionStorage.getItem(KEY)).toBe(original);
    onDataRestored.mockClear();
    form.rerender({ include: ["email"], onDataRestored });
    expect(storedValues()).toEqual({ email: "default" });
    expect(form.result.current.getValues()).toEqual({
      email: "default",
      other: "default",
    });
    expect(onDataRestored).not.toHaveBeenCalled();
    form.rerender({ include: [], onDataRestored });
    act(() => form.result.current.setValue("email", "edited while disabled"));
    expect(storedValues()).toEqual({ email: "default" });
    form.rerender({
      include: ["email", "other"],
      exclude: ["other"],
      onDataRestored,
    });
    expect(storedValues()).toEqual({ email: "edited while disabled" });
    form.rerender({ onDataRestored });
    expect(storedValues()).toEqual({
      email: "edited while disabled",
      other: "default",
    });
  });

  test("preserves custom Date/BigInt codecs and timeout metadata", () => {
    const serialize = vi.fn((values: Record<string, any>) =>
      JSON.stringify({
        ...values,
        date: values.date.toISOString(),
        count: String(values.count),
      })
    );
    const deserialize = (str: string) => {
      const data = JSON.parse(str);
      return { ...data, date: new Date(data.date), count: BigInt(data.count) };
    };
    sessionStorage.setItem(
      KEY,
      JSON.stringify({
        date: new Date(1000),
        count: "2",
        secret: "old",
        _timestamp: NOW,
      })
    );
    const onDataRestored = vi.fn();
    const options = {
      include: ["date", "count", "_timestamp"],
      exclude: ["_timestamp"],
      serialize,
      deserialize,
      timeout: 1000,
      onDataRestored,
    };
    const form = renderForm(
      {
        date: new Date(0),
        count: BigInt(1),
        secret: "default",
        _timestamp: "ignored",
      },
      options,
      strict
    );
    expect(onDataRestored).toHaveBeenCalledWith({
      date: new Date(1000),
      count: BigInt(2),
    });
    expect(serialize).toHaveBeenLastCalledWith({
      date: new Date(1000),
      count: BigInt(2),
      _timestamp: NOW,
    });
    act(() => form.result.current.setValue("count", BigInt(3)));
    expect(storedValues()).toEqual({
      date: new Date(1000).toISOString(),
      count: "3",
      _timestamp: NOW,
    });
  });

  test("ignores unselected edits after expiry and saves the first selected nested edit", () => {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ email: "expired", _timestamp: 1000 })
    );
    const serialize = vi.fn(JSON.stringify);
    const onTimeout = vi.fn();
    const form = renderForm(
      { profile: { items: ["default"] }, email: "default" },
      { include: ["profile"], timeout: 1000, serialize, onTimeout },
      strict
    );
    form.rerender();
    act(() => form.result.current.setValue("email", "unselected edit"));
    expect(sessionStorage.getItem(KEY)).toBeNull();
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(serialize).not.toHaveBeenCalled();
    act(() => form.result.current.setValue("profile.items.0", "selected edit"));
    expect(storedValues()).toEqual({
      profile: { items: ["selected edit"] },
      _timestamp: NOW,
    });
  });

  test("keeps expiry cleanup for an empty allowlist and resumes on selection changes", () => {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ email: "expired", _timestamp: 1000 })
    );
    const onTimeout = vi.fn();
    const onDataRestored = vi.fn();
    const form = renderForm(
      { email: "default" },
      { include: [], timeout: 1000, onTimeout, onDataRestored },
      strict
    );
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(onDataRestored).not.toHaveBeenCalled();
    form.rerender();
    act(() => form.result.current.setValue("email", "edited"));
    expect(sessionStorage.getItem(KEY)).toBeNull();
    form.rerender({
      include: ["email"],
      timeout: 1000,
      onTimeout,
      onDataRestored,
    });
    expect(storedValues()).toEqual({ email: "edited", _timestamp: NOW });
  });

  test("preserves registration and first input edits after expiry", async () => {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ email: "expired", _timestamp: 1000 })
    );
    const Form = () => {
      const form = useForm();
      useFormPersist(KEY, {
        watch: form.watch,
        setValue: form.setValue,
        include: ["email"],
        timeout: 1000,
      });
      return (
        <>
          <input aria-label="email" {...form.register("email")} />
          <input aria-label="secret" {...form.register("secret")} />
        </>
      );
    };
    const view = render(<Form />, strict ? { wrapper } : {});
    view.rerender(<Form />);
    await userEvent.type(screen.getByLabelText("secret"), "private");
    expect(sessionStorage.getItem(KEY)).toBeNull();
    await userEvent.type(screen.getByLabelText("email"), "a");
    expect(storedValues()).toEqual({ email: "a", _timestamp: NOW });
  });
});

test("uses equal-content inline arrays without restoring or writing unchanged mock values", () => {
  const values = { email: "default", secret: "default" };
  const watch = () => values;
  const setValue = vi.fn();
  const deserialize = vi.fn(JSON.parse);
  const serialize = vi.fn(JSON.stringify);
  const onDataRestored = vi.fn();
  sessionStorage.setItem(
    KEY,
    JSON.stringify({ email: "saved", secret: "old" })
  );
  const form = renderHook(() =>
    useFormPersist(KEY, {
      watch,
      setValue,
      include: ["email"],
      exclude: ["secret"],
      deserialize,
      serialize,
      onDataRestored,
    })
  );
  form.rerender();
  form.rerender();
  expect(deserialize).toHaveBeenCalledTimes(1);
  expect(onDataRestored).toHaveBeenCalledTimes(1);
  expect(setValue).toHaveBeenCalledTimes(1);
  expect(serialize).not.toHaveBeenCalled();
});

test("passes restore flags only to selected fields", () => {
  sessionStorage.setItem(
    KEY,
    JSON.stringify({ email: "saved", secret: "old" })
  );
  const setValue = vi.fn();
  renderHook(() =>
    useFormPersist(KEY, {
      watch: () => ({}),
      setValue,
      include: ["email"],
      validate: true,
      dirty: true,
      touch: true,
    })
  );
  expect(setValue).toHaveBeenCalledTimes(1);
  expect(setValue).toHaveBeenCalledWith("email", "saved", {
    shouldValidate: true,
    shouldDirty: true,
    shouldTouch: true,
  });
});

test("selection changes save unchanged watched values despite the previous restoration guard", () => {
  sessionStorage.setItem(
    KEY,
    JSON.stringify({ email: "saved", secret: "old" })
  );
  const values = { email: "current", secret: "current" };
  const watch = () => values;
  const setValue = vi.fn();
  const form = renderHook(
    ({ include }) => useFormPersist(KEY, { watch, setValue, include }),
    { initialProps: { include: ["email"] } }
  );
  form.rerender({ include: ["secret"] });
  expect(storedValues()).toEqual({ secret: "current" });
  expect(setValue).toHaveBeenCalledTimes(1);
});

test("equal inline inclusion arrays preserve expiry suppression with callback changes", () => {
  sessionStorage.setItem(
    KEY,
    JSON.stringify({ email: "expired", _timestamp: 1000 })
  );
  const form = renderHook(() => {
    const form = useForm({
      defaultValues: { email: "default", secret: "default" },
    });
    useFormPersist(KEY, {
      watch: form.watch,
      setValue: form.setValue,
      include: ["email"],
      timeout: 1000,
      deserialize: (str) => JSON.parse(str),
      onDataRestored: () => {},
    });
    return form;
  });
  form.rerender();
  form.rerender();
  act(() => form.result.current.setValue("secret", "edit"));
  expect(sessionStorage.getItem(KEY)).toBeNull();
});

test("applies changed selections when an explicit decoder change reloads storage", () => {
  const form = renderForm(
    { email: "default", secret: "default" },
    { include: ["email"] }
  );
  sessionStorage.setItem(
    KEY,
    JSON.stringify({ email: "saved", secret: "saved" })
  );
  const onDataRestored = vi.fn();
  form.rerender({
    include: ["secret"],
    deserialize: (str) => JSON.parse(str),
    onDataRestored,
  });
  expect(form.result.current.getValues()).toEqual({
    email: "default",
    secret: "saved",
  });
  expect(onDataRestored).toHaveBeenCalledWith({ secret: "saved" });
  expect(storedValues()).toEqual({ secret: "saved" });
});

test("filters unsupported unselected values before the default serializer", () => {
  renderForm({ email: "default", secret: BigInt(1) }, { include: ["email"] });
  expect(storedValues()).toEqual({ email: "default" });
});

test("preserves codec errors even when the allowlist is empty", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  sessionStorage.setItem(KEY, "bad JSON");
  expect(() => renderForm({ email: "default" }, { include: [] })).toThrow(
    SyntaxError
  );
  expect(sessionStorage.getItem(KEY)).toBe("bad JSON");
});

test("propagates serialization errors for selected values", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const error = new Error("unsupported selected value");
  expect(() =>
    renderForm(
      { email: "default" },
      {
        include: ["email"],
        serialize: () => {
          throw error;
        },
      }
    )
  ).toThrow(error);
  expect(sessionStorage.getItem(KEY)).toBeNull();
});
