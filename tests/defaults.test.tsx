import React, { StrictMode } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { Controller, useForm, UseFormReturn } from "react-hook-form";

import useFormPersist, { FormPersistConfig } from "../src";

const KEY = "defaults-form";
const defaults = {
  title: "default title",
  details: "default details",
  privateNote: "private default",
};
type Values = typeof defaults;
type Options = Omit<FormPersistConfig, "watch" | "setValue" | "storage">;

const createStorage = (initial?: Record<string, unknown>) => {
  let entry = initial === undefined ? null : JSON.stringify(initial);
  const storage: Storage = {
    length: entry === null ? 0 : 1,
    key: vi.fn(() => KEY),
    clear: vi.fn(() => {
      entry = null;
    }),
    getItem: vi.fn(() => entry),
    setItem: vi.fn((_key, value) => {
      entry = value;
    }),
    removeItem: vi.fn(() => {
      entry = null;
    }),
  };
  return { storage, saved: () => (entry === null ? null : JSON.parse(entry)) };
};

const renderForm = (
  storage: Storage,
  options: Options,
  strict: boolean,
  initialDefaults = defaults
) => {
  let form: UseFormReturn<Values>;
  function Form({ defaultValues }: { defaultValues: Values }) {
    form = useForm({ defaultValues });
    // Subscribe to both fields: older RHF versions update them lazily.
    void form.formState.isDirty;
    void form.formState.dirtyFields;
    useFormPersist(KEY, { ...form, storage, ...options });
    return (
      <form>
        <input aria-label="title" {...form.register("title")} />
        <input aria-label="details" {...form.register("details")} />
        <input aria-label="private note" {...form.register("privateNote")} />
      </form>
    );
  }
  const element = (defaultValues: Values) =>
    strict ? (
      <StrictMode>
        <Form defaultValues={defaultValues} />
      </StrictMode>
    ) : (
      <Form defaultValues={defaultValues} />
    );
  const view = render(element(initialDefaults));
  return {
    ...view,
    form: () => form!,
    rerender: (defaultValues = initialDefaults) =>
      view.rerender(element(defaultValues)),
  };
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe.each([false, true])("RHF defaults with StrictMode=%s", (strict) => {
  test("overlays partial saved fields and keeps missing and excluded defaults", () => {
    const { storage, saved } = createStorage({
      title: "saved title",
      privateNote: "old private note",
    });
    const onDataRestored = vi.fn();
    const options = {
      include: ["title", "details", "privateNote"],
      exclude: ["privateNote"],
      onDataRestored,
    };
    const view = renderForm(storage, options, strict);
    const expected = { title: "saved title", details: defaults.details };
    expect(screen.getByLabelText("title")).toHaveValue("saved title");
    expect(screen.getByLabelText("details")).toHaveValue(defaults.details);
    expect(screen.getByLabelText("private note")).toHaveValue(
      defaults.privateNote
    );
    expect(view.form().getValues()).toEqual({
      ...defaults,
      title: "saved title",
    });
    expect(onDataRestored).toHaveBeenCalledWith({ title: "saved title" });
    expect(storage.setItem).toHaveBeenCalled();
    expect(
      vi.mocked(storage.setItem).mock.calls.every(([, value]) => {
        const data = JSON.parse(value);
        return (
          data.title === "saved title" &&
          data.details === defaults.details &&
          !("privateNote" in data)
        );
      })
    ).toBe(true);
    expect(saved()).toEqual(expected);
    view.rerender();
    expect(saved()).toEqual(expected);
    act(() => view.form().setValue("details", "edited details"));
    expect(saved()).toEqual({ ...expected, details: "edited details" });
    view.unmount();
    renderForm(storage, options, strict);
    expect(screen.getByLabelText("details")).toHaveValue("edited details");
    expect(screen.getByLabelText("private note")).toHaveValue(
      defaults.privateNote
    );
  });

  test.each([null, false, 0, ""])(
    "restores the explicit value %j instead of substituting a default",
    (value) => {
      const { storage, saved } = createStorage({ field: value });
      let form: UseFormReturn<{ field: string | number | boolean | null }>;
      const onDataRestored = vi.fn();
      function Form() {
        form = useForm<{ field: string | number | boolean | null }>({
          defaultValues: { field: "default" },
        });
        useFormPersist(KEY, { ...form, storage, onDataRestored });
        return (
          <Controller
            name="field"
            control={form.control}
            render={({ field }) => (
              <output data-testid="field">{JSON.stringify(field.value)}</output>
            )}
          />
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
      expect(form!.getValues().field).toBe(value);
      expect(screen.getByTestId("field").textContent).toBe(
        JSON.stringify(value)
      );
      expect(onDataRestored).toHaveBeenCalledWith({ field: value });
      expect(storage.setItem).toHaveBeenCalled();
      expect(
        vi
          .mocked(storage.setItem)
          .mock.calls.every(([, data]) => JSON.parse(data).field === value)
      ).toBe(true);
      expect(saved()).toEqual({ field: value });
    }
  );

  test("initializes all form defaults when storage is missing, saving only selected fields", () => {
    const { storage, saved } = createStorage();
    const onDataRestored = vi.fn();
    const view = renderForm(
      storage,
      { exclude: ["privateNote"], onDataRestored },
      strict
    );
    expect(view.form().getValues()).toEqual(defaults);
    expect(screen.getByLabelText("private note")).toHaveValue(
      defaults.privateNote
    );
    expect(saved()).toEqual({
      title: defaults.title,
      details: defaults.details,
    });
    // StrictMode may read the entry created by its first effect pass.
    expect(
      onDataRestored.mock.calls.every(
        ([data]) => data.title === defaults.title && !("privateNote" in data)
      )
    ).toBe(true);
  });

  test("keeps the RHF reset and dirty baseline after restoring saved values", () => {
    const { storage, saved } = createStorage({ title: "saved title" });
    const view = renderForm(
      storage,
      { dirty: true, exclude: ["privateNote"] },
      strict
    );
    expect(view.form().formState.isDirty).toBe(true);
    expect(view.form().formState.dirtyFields.title).toBe(true);

    act(() =>
      view.form().setValue("title", defaults.title, { shouldDirty: true })
    );
    expect(view.form().formState.isDirty).toBe(false);
    expect(view.form().formState.dirtyFields).toEqual({});

    act(() => view.form().setValue("title", "edited", { shouldDirty: true }));
    expect(view.form().formState.isDirty).toBe(true);
    view.rerender({ ...defaults, title: "replacement prop" });
    expect(view.form().getValues().title).toBe("edited");

    act(() => view.form().reset());
    expect(view.form().getValues()).toEqual(defaults);
    expect(screen.getByLabelText("title")).toHaveValue(defaults.title);
    expect(view.form().formState.isDirty).toBe(false);
    expect(view.form().formState.dirtyFields).toEqual({});
    expect(saved()).toEqual({
      title: defaults.title,
      details: defaults.details,
    });
  });
});
