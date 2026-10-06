import React, { StrictMode, useEffect } from "react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { useForm, UseFormReturn } from "react-hook-form";

import useFormPersist from "../src";

const KEY = "async-defaults-form";
const defaults = {
  title: "loaded title",
  details: "loaded details",
  privateNote: "loaded private note",
};
type Values = typeof defaults;

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

const createStorage = (initial: string | null) => {
  let entry = initial;
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

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// This recipe requires RHF's async defaults / isLoading API (7.41+).
describe.each([false, true])(
  "async RHF defaults with StrictMode=%s",
  (strict) => {
    test.each(["missing", "partial"])(
      "waits for loaded defaults before checking %s storage",
      async (kind) => {
        const initial =
          kind === "missing"
            ? null
            : JSON.stringify({
                title: "saved title",
                privateNote: "old private",
              });
        const { storage, saved } = createStorage(initial);
        const pending = deferred<Values>();
        const loadDefaults = vi.fn(() => pending.promise);
        const onDataRestored = vi.fn();
        const readyValues: Values[] = [];
        let form: UseFormReturn<Values>;
        let synchronized = false;
        function Form() {
          form = useForm<Values>({ defaultValues: loadDefaults });
          const { isLoading } = form.formState;
          const { isSynchronized } = useFormPersist(isLoading ? null : KEY, {
            ...form,
            storage,
            exclude: ["privateNote"],
            onDataRestored,
          });
          synchronized = isSynchronized;
          const values = form.watch();
          useEffect(() => {
            if (!isLoading && isSynchronized) readyValues.push({ ...values });
          }, [isLoading, isSynchronized, values]);
          return (
            <form>
              <input aria-label="title" {...form.register("title")} />
              <input aria-label="details" {...form.register("details")} />
              <input
                aria-label="private note"
                {...form.register("privateNote")}
              />
            </form>
          );
        }
        const element = strict ? (
          <StrictMode>
            <Form />
          </StrictMode>
        ) : (
          <Form />
        );
        const view = render(element);
        expect(loadDefaults).toHaveBeenCalled();
        expect(form!.formState.isLoading).toBe(true);
        expect(synchronized).toBe(false);
        expect(storage.getItem).not.toHaveBeenCalled();
        expect(storage.setItem).not.toHaveBeenCalled();
        expect(onDataRestored).not.toHaveBeenCalled();
        expect(readyValues).toEqual([]);
        expect(saved()).toEqual(initial === null ? null : JSON.parse(initial));

        await act(async () => pending.resolve({ ...defaults }));
        const title = kind === "missing" ? defaults.title : "saved title";
        expect(form!.formState.isLoading).toBe(false);
        expect(synchronized).toBe(true);
        expect(form!.getValues()).toEqual({ ...defaults, title });
        expect(screen.getByLabelText("title")).toHaveValue(title);
        expect(screen.getByLabelText("details")).toHaveValue(defaults.details);
        expect(screen.getByLabelText("private note")).toHaveValue(
          defaults.privateNote
        );
        expect(readyValues.length).toBeGreaterThan(0);
        expect(
          readyValues.every(
            (values) =>
              values.title === title && values.details === defaults.details
          )
        ).toBe(true);
        expect(storage.setItem).toHaveBeenCalled();
        expect(
          vi.mocked(storage.setItem).mock.calls.every(([, value]) => {
            const data = JSON.parse(value);
            return (
              data.title === title &&
              data.details === defaults.details &&
              !("privateNote" in data)
            );
          })
        ).toBe(true);
        expect(saved()).toEqual({ title, details: defaults.details });
        if (kind === "partial") {
          expect(onDataRestored).toHaveBeenCalledWith({ title: "saved title" });
        }

        act(() => form!.setValue("details", "edited details"));
        expect(saved()).toEqual({ title, details: "edited details" });
        // Restoration through setValue did not replace the loaded RHF defaults.
        act(() => form!.reset());
        expect(form!.getValues()).toEqual(defaults);
        expect(saved()).toEqual({
          title: defaults.title,
          details: defaults.details,
        });
        view.unmount();
      }
    );

    test("does not start persistence if async defaults resolve after unmount", async () => {
      const { storage } = createStorage('{"title":"saved title"}');
      const pending = deferred<Values>();
      const loadDefaults = () => pending.promise;
      const onDataRestored = vi.fn();
      function Form() {
        const form = useForm<Values>({ defaultValues: loadDefaults });
        useFormPersist(form.formState.isLoading ? null : KEY, {
          ...form,
          storage,
          onDataRestored,
        });
        return <input {...form.register("title")} />;
      }
      const view = render(
        strict ? (
          <StrictMode>
            <Form />
          </StrictMode>
        ) : (
          <Form />
        )
      );
      expect(storage.getItem).not.toHaveBeenCalled();
      view.unmount();
      await act(async () => pending.resolve({ ...defaults }));
      expect(storage.getItem).not.toHaveBeenCalled();
      expect(storage.setItem).not.toHaveBeenCalled();
      expect(storage.removeItem).not.toHaveBeenCalled();
      expect(onDataRestored).not.toHaveBeenCalled();
    });
  }
);
