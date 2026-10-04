import React, { StrictMode, useState } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Controller, useFieldArray, useForm } from "react-hook-form";

import useFormPersist from "../src";

const KEY = "array-form";
const choices = [
  { value: "alpha", label: "Alpha" },
  { value: "beta", label: "Beta" },
  { value: "gamma", label: "Gamma" },
];
type FormValues = { title: string; filters: typeof choices };
const saved = () => JSON.parse(localStorage.getItem(KEY)!);

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const Modal = ({ children }: { children: React.ReactNode }) => {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button onClick={() => setOpen(!open)}>
        {open ? "close modal" : "open modal"}
      </button>
      {open && children}
    </>
  );
};
const renderModal = (form: React.ReactElement, strict: boolean) =>
  render(
    strict ? (
      <StrictMode>
        <Modal>{form}</Modal>
      </StrictMode>
    ) : (
      <Modal>{form}</Modal>
    )
  );
const reopen = async () => {
  await userEvent.click(screen.getByText("close modal"));
  await userEvent.click(screen.getByText("open modal"));
};

describe.each([false, true])("array restoration, StrictMode=%s", (strict) => {
  test.each([false, true])(
    "preserves controlled object selections on remount and first edits, shouldUnregister=%s",
    async (shouldUnregister) => {
      let getValues: () => FormValues;
      const Form = () => {
        const form = useForm<FormValues>({
          defaultValues: { title: "", filters: [] },
          shouldUnregister,
        });
        getValues = form.getValues;
        useFormPersist(KEY, {
          watch: form.watch,
          setValue: form.setValue,
          storage: localStorage,
        });
        return (
          <form>
            <input aria-label="title" {...form.register("title")} />
            <Controller
              name="filters"
              control={form.control}
              render={({ field }) => (
                <select
                  aria-label="filters"
                  multiple
                  name={field.name}
                  ref={field.ref}
                  value={field.value.map((item) => item.value)}
                  onBlur={field.onBlur}
                  onChange={(event) =>
                    field.onChange(
                      Array.from(event.target.selectedOptions, (option) =>
                        choices.find((item) => item.value === option.value)
                      )
                    )
                  }
                >
                  {choices.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              )}
            />
          </form>
        );
      };
      renderModal(<Form />, strict);
      await userEvent.type(screen.getByLabelText("title"), "saved title");
      await userEvent.selectOptions(screen.getByLabelText("filters"), [
        "alpha",
        "beta",
      ]);
      const initial = { title: "saved title", filters: choices.slice(0, 2) };
      expect(saved()).toEqual(initial);
      const writes = vi.spyOn(Storage.prototype, "setItem");

      for (let cycle = 0; cycle < 3; cycle++) {
        writes.mockClear();
        await reopen();
        expect(screen.getByLabelText("filters")).toHaveValue(["alpha", "beta"]);
        expect(screen.getByLabelText("title")).toHaveValue(initial.title);
        expect(getValues!()).toEqual(initial);
        expect(saved()).toEqual(initial);
        // Final state alone misses a transient write of stale empty defaults.
        for (const [key, value] of writes.mock.calls) {
          if (key === KEY) expect(JSON.parse(value)).toEqual(initial);
        }
      }

      await userEvent.deselectOptions(
        screen.getByLabelText("filters"),
        "alpha"
      );
      expect(saved().filters).toEqual([choices[1]]);
      await userEvent.selectOptions(screen.getByLabelText("filters"), "gamma");
      expect(saved().filters).toEqual(choices.slice(1));
      await reopen();
      expect(screen.getByLabelText("filters")).toHaveValue(["beta", "gamma"]);
      await userEvent.deselectOptions(screen.getByLabelText("filters"), [
        "beta",
        "gamma",
      ]);
      expect(saved().filters).toEqual([]);
      await reopen();
      expect(screen.getByLabelText("filters")).toHaveValue([]);
      expect(getValues!().filters).toEqual([]);
      expect(saved().filters).toEqual([]);
    }
  );

  test("restores registered useFieldArray rows and persists row edits, additions and removals", async () => {
    const Form = () => {
      const { control, register, watch, setValue } = useForm<FormValues>({
        defaultValues: { title: "", filters: [] },
      });
      const { fields, append, remove } = useFieldArray({
        control,
        name: "filters",
      });
      useFormPersist(KEY, { watch, setValue, storage: localStorage });
      return (
        <form>
          <button type="button" onClick={() => append(choices[0])}>
            add alpha
          </button>
          <button type="button" onClick={() => append(choices[1])}>
            add beta
          </button>
          <button type="button" onClick={() => remove(0)}>
            remove first
          </button>
          {fields.map((field, index) => (
            <div key={field.id}>
              <input
                aria-label={`filter ${index}`}
                {...register(`filters.${index}.label`)}
              />
              <input type="hidden" {...register(`filters.${index}.value`)} />
            </div>
          ))}
        </form>
      );
    };
    renderModal(<Form />, strict);
    await userEvent.click(screen.getByText("add alpha"));
    await userEvent.click(screen.getByText("add beta"));
    expect(saved().filters).toEqual(choices.slice(0, 2));
    await reopen();
    expect(screen.getByLabelText("filter 0")).toHaveValue("Alpha");
    expect(screen.getByLabelText("filter 1")).toHaveValue("Beta");
    expect(saved().filters).toEqual(choices.slice(0, 2));
    await userEvent.type(screen.getByLabelText("filter 0"), " edited");
    expect(saved().filters[0].label).toBe("Alpha edited");
    await userEvent.click(screen.getByText("remove first"));
    expect(saved().filters).toEqual([choices[1]]);
    await reopen();
    expect(screen.getByLabelText("filter 0")).toHaveValue("Beta");
    expect(screen.queryByLabelText("filter 1")).toBeNull();
    await userEvent.click(screen.getByText("remove first"));
    expect(saved().filters).toEqual([]);
    await reopen();
    expect(screen.queryByLabelText("filter 0")).toBeNull();
    expect(saved().filters).toEqual([]);
  });
});
