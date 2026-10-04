import React, { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm, UseFormReturn, useWatch } from "react-hook-form";

import useFormPersist, { FormPersistConfig } from "../src";

const KEY = "isolated-form";
const NOW = 3001;
type Options = Omit<FormPersistConfig, "watch" | "setValue">;
type Props = { name: string | null; options?: Options };
type Values = { field: string; secret: string; nested: { text: string } };
const defaults: Values = {
  field: "default",
  secret: "private",
  nested: { text: "initial" },
};

// Keep the component type outside the form: remounting it would restore again.
function Persistence({
  form,
  name,
  options,
  onRender,
  onClear,
}: Props & {
  form: UseFormReturn<Values>;
  onRender: () => void;
  onClear: (clear: () => void) => void;
}) {
  useWatch({ control: form.control, disabled: name === null });
  const { clear } = useFormPersist(name, {
    ...options,
    watch: form.getValues,
    setValue: form.setValue,
  });
  onRender();
  onClear(clear);
  return null;
}

function setup(
  initial: Props = { name: KEY },
  strict = false,
  observeDirtyFields = false
) {
  let methods: UseFormReturn<Values>;
  let clear: () => void;
  const parentRender = vi.fn();
  const childRender = vi.fn();
  const captureClear = (value: () => void) => (clear = value);
  function Form(props: Props) {
    const form = useForm<Values>({ defaultValues: defaults });
    // RHF 7.31 only tracks dirtyFields after a consumer subscribes to it.
    if (observeDirtyFields) void form.formState.dirtyFields;
    methods = form;
    parentRender();
    return (
      <form>
        <input aria-label="field" {...form.register("field")} />
        <input aria-label="secret" {...form.register("secret")} />
        <input aria-label="nested" {...form.register("nested.text")} />
        <Persistence
          {...props}
          form={form}
          onRender={childRender}
          onClear={captureClear}
        />
      </form>
    );
  }
  const element = (props: Props) =>
    strict ? (
      <StrictMode>
        <Form {...props} />
      </StrictMode>
    ) : (
      <Form {...props} />
    );
  const view = render(element(initial));
  return {
    ...view,
    parentRender,
    childRender,
    form: () => methods!,
    clear: () => clear!(),
    rerender: (props: Props = initial) => view.rerender(element(props)),
  };
}

const saved = (key = KEY) => JSON.parse(sessionStorage.getItem(key)!);

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  vi.spyOn(Date, "now").mockReturnValue(NOW);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe.each([false, true])("child persistence, StrictMode=%s", (strict) => {
  test("isolates typing and programmatic updates while continuing to write", async () => {
    const view = setup({ name: KEY }, strict);
    expect(saved()).toEqual(defaults);
    const parents = view.parentRender.mock.calls.length;
    const children = view.childRender.mock.calls.length;
    const writes = vi.spyOn(Storage.prototype, "setItem");
    await userEvent.type(screen.getByLabelText("field"), " edited");
    act(() => view.form().setValue("nested.text", "changed"));
    expect(view.parentRender).toHaveBeenCalledTimes(parents);
    expect(view.childRender.mock.calls.length).toBeGreaterThan(children);
    expect(writes).toHaveBeenCalled();
    expect(saved()).toEqual({
      ...defaults,
      field: "default edited",
      nested: { text: "changed" },
    });
  });

  test("the ordinary watch recipe rerenders its form as a positive control", async () => {
    const parentRender = vi.fn();
    function Form() {
      const { register, watch, setValue } = useForm({
        defaultValues: defaults,
      });
      useFormPersist(KEY, { watch, setValue });
      parentRender();
      return <input aria-label="field" {...register("field")} />;
    }
    render(
      strict ? (
        <StrictMode>
          <Form />
        </StrictMode>
      ) : (
        <Form />
      )
    );
    const parents = parentRender.mock.calls.length;
    await userEvent.type(screen.getByLabelText("field"), " edited");
    expect(parentRender.mock.calls.length).toBeGreaterThan(parents);
    expect(saved().field).toBe("default edited");
  });

  test("restores on repeated real remounts without transient default writes", async () => {
    const restored = {
      ...defaults,
      field: "saved",
      nested: { text: "saved nested" },
    };
    sessionStorage.setItem(KEY, JSON.stringify(restored));
    const onDataRestored = vi.fn();
    const options = { onDataRestored };
    const writes = vi.spyOn(Storage.prototype, "setItem");
    for (let round = 0; round < 3; round++) {
      writes.mockClear();
      const view = setup({ name: KEY, options }, strict);
      expect(screen.getByLabelText("field")).toHaveValue("saved");
      expect(screen.getByLabelText("nested")).toHaveValue("saved nested");
      expect(view.form().getValues()).toEqual(restored);
      expect(saved()).toEqual(restored);
      for (const [key, value] of writes.mock.calls) {
        if (key === KEY) expect(JSON.parse(value)).toEqual(restored);
      }
      view.unmount();
    }
    const view = setup({ name: KEY, options }, strict);
    await userEvent.type(screen.getByLabelText("field"), " first edit");
    expect(saved().field).toBe("saved first edit");
    expect(onDataRestored).toHaveBeenLastCalledWith(restored);
    view.unmount();
  });

  test("moving the original watch call into a child still rerenders the form", async () => {
    const parentRender = vi.fn();
    function OriginalPersistence({ form }: { form: UseFormReturn<Values> }) {
      useFormPersist(KEY, { watch: form.watch, setValue: form.setValue });
      return null;
    }
    function Form() {
      const form = useForm<Values>({ defaultValues: defaults });
      parentRender();
      return (
        <>
          <input aria-label="field" {...form.register("field")} />
          <OriginalPersistence form={form} />
        </>
      );
    }
    render(
      strict ? (
        <StrictMode>
          <Form />
        </StrictMode>
      ) : (
        <Form />
      )
    );
    const parents = parentRender.mock.calls.length;
    await userEvent.type(screen.getByLabelText("field"), " edited");
    expect(parentRender.mock.calls.length).toBeGreaterThan(parents);
    expect(saved().field).toBe("default edited");
  });

  test("preserves dirty and touched restoration flags", () => {
    sessionStorage.setItem(KEY, '{"field":"saved","secret":"old"}');
    const view = setup(
      {
        name: KEY,
        options: {
          include: ["field"],
          validate: true,
          dirty: true,
          touch: true,
        },
      },
      strict,
      true
    );
    expect(view.form().getFieldState("field")).toMatchObject({
      isDirty: true,
      isTouched: true,
    });
    expect(view.form().getFieldState("secret")).toMatchObject({
      isDirty: false,
      isTouched: false,
    });
    expect(saved()).toEqual({ field: "saved" });
  });

  test("disables without storage work and re-enables from the latest saved values", () => {
    const options = {
      onDataRestored: vi.fn(),
      serialize: vi.fn(JSON.stringify),
    };
    const read = vi.spyOn(Storage.prototype, "getItem");
    const write = vi.spyOn(Storage.prototype, "setItem");
    const remove = vi.spyOn(Storage.prototype, "removeItem");
    const view = setup({ name: null, options }, strict);
    const children = view.childRender.mock.calls.length;
    act(() => view.form().setValue("field", "disabled edit"));
    act(view.clear);
    expect(view.childRender).toHaveBeenCalledTimes(children);
    for (const spy of [
      read,
      write,
      remove,
      options.serialize,
      options.onDataRestored,
    ]) {
      expect(spy).not.toHaveBeenCalled();
    }
    view.rerender({ name: "", options });
    expect(saved("").field).toBe("disabled edit");
    act(() => view.form().setValue("field", "enabled edit"));
    expect(saved("").field).toBe("enabled edit");
    view.rerender({ name: null, options });
    act(() => view.form().setValue("field", "another disabled edit"));
    sessionStorage.setItem("", JSON.stringify({ field: "latest saved" }));
    view.rerender({ name: "", options });
    expect(view.form().getValues().field).toBe("latest saved");
    expect(saved("").field).toBe("latest saved");
    act(() => view.form().setValue("field", "first re-enabled edit"));
    expect(saved("").field).toBe("first re-enabled edit");
    sessionStorage.setItem("other", JSON.stringify({ field: "other key" }));
    view.rerender({ name: "other", options });
    expect(view.form().getValues().field).toBe("other key");
    expect(saved("other").field).toBe("other key");
  });

  test("applies selection without restoring stale values when selection changes", () => {
    const onDataRestored = vi.fn();
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ field: "old", secret: "old secret" })
    );
    const view = setup(
      { name: KEY, options: { include: [], onDataRestored } },
      strict
    );
    expect(onDataRestored).toHaveBeenLastCalledWith({});
    expect(view.form().getValues()).toEqual(defaults);
    expect(saved()).toEqual({ field: "old", secret: "old secret" });
    const restores = onDataRestored.mock.calls.length;
    view.rerender({
      name: KEY,
      options: {
        include: ["field", "secret"],
        exclude: ["secret"],
        onDataRestored,
      },
    });
    expect(saved()).toEqual({ field: "default" });
    act(() => view.form().setValue("field", "current"));
    view.rerender({
      name: KEY,
      options: {
        include: ["field", "secret"],
        exclude: ["secret"],
        onDataRestored,
      },
    });
    expect(saved()).toEqual({ field: "current" });
    expect(onDataRestored).toHaveBeenCalledTimes(restores);
    view.rerender({ name: KEY, options: { include: [], onDataRestored } });
    act(() => view.form().setValue("field", "not selected"));
    expect(saved()).toEqual({ field: "current" });
    view.rerender({
      name: KEY,
      options: { include: ["nested.text", "field"], onDataRestored },
    });
    expect(saved()).toEqual({ field: "not selected" });
    act(view.clear);
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  test("keeps an expired entry absent until a selected value changes", () => {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ field: "expired", _timestamp: 1000 })
    );
    const options = {
      include: ["nested"],
      timeout: 1000,
      onTimeout: vi.fn(),
      serialize: vi.fn(JSON.stringify),
    };
    const view = setup({ name: KEY, options }, strict);
    view.rerender();
    act(() => view.form().setValue("field", "unselected edit"));
    expect(sessionStorage.getItem(KEY)).toBeNull();
    expect(options.onTimeout).toHaveBeenCalledTimes(1);
    expect(options.serialize).not.toHaveBeenCalled();
    act(() => view.form().setValue("nested.text", "first selected edit"));
    expect(saved()).toEqual({
      nested: { text: "first selected edit" },
      _timestamp: NOW,
    });
  });

  test("expires while selection is empty and saves current values when widened", () => {
    sessionStorage.setItem(
      KEY,
      JSON.stringify({ field: "expired", _timestamp: 1000 })
    );
    const onTimeout = vi.fn();
    const onDataRestored = vi.fn();
    const view = setup(
      {
        name: KEY,
        options: { include: [], timeout: 1000, onTimeout, onDataRestored },
      },
      strict
    );
    expect(sessionStorage.getItem(KEY)).toBeNull();
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(onDataRestored).not.toHaveBeenCalled();
    act(() => view.form().setValue("field", "current"));
    view.rerender({
      name: KEY,
      options: { include: ["field"], timeout: 1000, onTimeout, onDataRestored },
    });
    expect(saved()).toEqual({ field: "current", _timestamp: NOW });
  });

  test("preserves custom codecs and never serializes stale defaults during restore", () => {
    sessionStorage.setItem(KEY, 'encoded:{"field":"saved","_timestamp":3001}');
    const serialize = vi.fn(
      (values: Record<string, any>) => `encoded:${JSON.stringify(values)}`
    );
    const deserialize = vi.fn((value: string) => JSON.parse(value.slice(8)));
    const options = {
      serialize,
      deserialize,
      include: ["field"],
      timeout: 1000,
    };
    const view = setup({ name: KEY, options }, strict);
    expect(view.form().getValues().field).toBe("saved");
    for (const [values] of serialize.mock.calls)
      expect(values).toEqual({ field: "saved", _timestamp: NOW });
    const reads = deserialize.mock.calls.length;
    act(() => view.form().setValue("field", "edited"));
    expect(deserialize).toHaveBeenCalledTimes(reads);
    expect(sessionStorage.getItem(KEY)).toBe(
      'encoded:{"field":"edited","_timestamp":3001}'
    );
  });

  test("suspends a failed activation while keeping later form edits usable", () => {
    const error = new Error("Storage denied");
    const stored = new Map([[KEY, '{"field":"unread data"}']]);
    const storage: Storage = {
      length: 1,
      key: () => KEY,
      clear: vi.fn(),
      getItem: vi.fn(() => {
        throw error;
      }),
      setItem: vi.fn((key, value) => {
        stored.set(key, value);
      }),
      removeItem: vi.fn((key) => {
        stored.delete(key);
      }),
    };
    const onStorageError = vi.fn();
    const options = { storage, onStorageError };
    const view = setup({ name: KEY, options }, strict);
    const parents = view.parentRender.mock.calls.length;
    act(() => view.form().setValue("field", "unsaved edit"));
    act(view.clear);
    expect(view.form().getValues().field).toBe("unsaved edit");
    expect(view.parentRender).toHaveBeenCalledTimes(parents);
    expect(storage.getItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect(onStorageError).toHaveBeenCalledExactlyOnceWith(error);
    vi.mocked(storage.getItem).mockImplementation(
      (key) => stored.get(key) ?? null
    );
    view.rerender({ name: null, options });
    view.rerender({ name: KEY, options });
    expect(view.form().getValues().field).toBe("unread data");
    expect(JSON.parse(stored.get(KEY)!)).toEqual({
      ...defaults,
      field: "unread data",
    });
  });

  test.each([
    "storage",
    "deserialize",
    "serialize",
    "onDataRestored",
    "onTimeout",
  ])("keeps %s errors visible", (failure) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new Error(failure);
    const fail = () => {
      throw error;
    };
    const options: Options = { onStorageError: vi.fn() };
    if (failure === "storage") {
      options.onStorageError = undefined;
      vi.spyOn(window, "sessionStorage", "get").mockImplementation(fail);
    } else if (failure === "deserialize") {
      sessionStorage.setItem(KEY, "invalid data");
      options.deserialize = fail;
    } else if (failure === "serialize") {
      options.serialize = fail;
    } else if (failure === "onDataRestored") {
      sessionStorage.setItem(KEY, '{"field":"saved"}');
      options.onDataRestored = fail;
    } else {
      sessionStorage.setItem(KEY, '{"field":"expired","_timestamp":1000}');
      options.timeout = 1000;
      options.onTimeout = fail;
    }
    expect(() => setup({ name: KEY, options }, strict)).toThrow(error);
    if (options.onStorageError)
      expect(options.onStorageError).not.toHaveBeenCalled();
  });
});
