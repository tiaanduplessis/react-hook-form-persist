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

const KEY = "expired-form";
const NOW = 3001;
const expired = JSON.stringify({ field: "expired", _timestamp: 1000 });
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <StrictMode>{children}</StrictMode>
);
type Options = Omit<FormPersistConfig, "watch" | "setValue">;

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  vi.spyOn(Date, "now").mockReturnValue(NOW);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const renderForm = (
  defaultValues: Record<string, any>,
  options: Options = {},
  strict = false
) =>
  renderHook(
    () => {
      const form = useForm({ defaultValues });
      useFormPersist(KEY, {
        watch: form.watch,
        setValue: form.setValue,
        timeout: 1000,
        ...options,
      });
      return form;
    },
    strict ? { wrapper } : {}
  );

describe.each([false, true])("timeout with StrictMode=%s", (strict) => {
  test("keeps expired data absent across equal-content renders, then saves edits", () => {
    sessionStorage.setItem(KEY, expired);
    const onTimeout = vi.fn();
    const onDataRestored = vi.fn();
    const serialize = vi.fn(JSON.stringify);
    const form = renderForm(
      { field: "default" },
      { onTimeout, onDataRestored, serialize },
      strict
    );

    for (let index = 0; index < 3; index++) {
      vi.mocked(Date.now).mockReturnValue(NOW + index * 1000);
      form.rerender();
      expect(sessionStorage.getItem(KEY)).toBeNull();
    }
    expect(serialize).not.toHaveBeenCalled();
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(onDataRestored).not.toHaveBeenCalled();
    expect(form.result.current.getValues()).toEqual({ field: "default" });

    act(() => form.result.current.setValue("field", "edited"));
    expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual({
      field: "edited",
      _timestamp: NOW + 2000,
    });
    act(() => form.result.current.setValue("field", "default"));
    expect(JSON.parse(sessionStorage.getItem(KEY)!).field).toBe("default");
  });

  test("still saves defaults when there is no stored entry", () => {
    renderForm({ field: "default" }, {}, strict);
    expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual({
      field: "default",
      _timestamp: NOW,
    });
  });

  test("ignores input registration but persists the first user edit", async () => {
    sessionStorage.setItem(KEY, expired);
    const Form = () => {
      const form = useForm();
      useFormPersist(KEY, {
        watch: form.watch,
        setValue: form.setValue,
        timeout: 1000,
      });
      return <input aria-label="field" {...form.register("field")} />;
    };
    const view = render(<Form />, strict ? { wrapper } : {});
    expect(screen.getByLabelText("field")).toHaveValue("");
    expect(sessionStorage.getItem(KEY)).toBeNull();
    view.rerender(<Form />);
    expect(sessionStorage.getItem(KEY)).toBeNull();
    await userEvent.type(screen.getByLabelText("field"), "new");
    expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual({
      field: "new",
      _timestamp: NOW,
    });
  });

  test("does not invoke custom serializers while discarding expired values", () => {
    sessionStorage.setItem(KEY, `custom:${expired}`);
    const serialize = vi.fn(() => {
      throw new Error("serialization must wait for an edit");
    });
    const form = renderForm(
      { count: BigInt(1), date: new Date(0) },
      {
        serialize,
        deserialize: (value) => JSON.parse(value.slice(7)),
      },
      strict
    );
    form.rerender();
    expect(serialize).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(KEY)).toBeNull();
  });

  test("ignores excluded changes and detects mutable nested values with custom codecs", () => {
    sessionStorage.setItem(KEY, expired);
    const serialize = vi.fn((values: Record<string, any>) =>
      JSON.stringify({ ...values, count: String(values.count) })
    );
    const form = renderForm(
      {
        nested: { items: [{ text: "default" }] },
        date: new Date(0),
        count: BigInt(1),
        secret: "default-secret",
      },
      { serialize, exclude: ["secret"] },
      strict
    );
    act(() => form.result.current.setValue("secret", "edited-secret"));
    expect(sessionStorage.getItem(KEY)).toBeNull();
    expect(serialize).not.toHaveBeenCalled();

    act(() => form.result.current.setValue("nested.items.0.text", "edited"));
    expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual({
      nested: { items: [{ text: "edited" }] },
      date: "1970-01-01T00:00:00.000Z",
      count: "1",
      _timestamp: NOW,
    });
  });

  test.each(["date", "count"])("detects the first %s edit", (field) => {
    sessionStorage.setItem(KEY, expired);
    const serialize = (values: Record<string, any>) =>
      JSON.stringify({ ...values, count: String(values.count) });
    const form = renderForm(
      { date: new Date(0), count: BigInt(1) },
      { serialize },
      strict
    );
    act(() =>
      form.result.current.setValue(
        field,
        field === "date" ? new Date(1000) : BigInt(2)
      )
    );
    expect(JSON.parse(sessionStorage.getItem(KEY)!)[field]).toBe(
      field === "date" ? "1970-01-01T00:00:01.000Z" : "2"
    );
  });

  test("persists changes made by onTimeout", () => {
    sessionStorage.setItem(KEY, expired);
    const onTimeout = vi.fn();
    renderHook(
      () => {
        const form = useForm({ defaultValues: { field: "default" } });
        useFormPersist(KEY, {
          watch: form.watch,
          setValue: form.setValue,
          timeout: 1000,
          onTimeout: () => {
            onTimeout();
            form.setValue("field", "changed in callback");
          },
        });
      },
      strict ? { wrapper } : {}
    );
    expect(onTimeout).toHaveBeenCalledTimes(1);
    expect(JSON.parse(sessionStorage.getItem(KEY)!)).toEqual({
      field: "changed in callback",
      _timestamp: NOW,
    });
  });
});

test.each(["serialize", "timeout", "exclude", "name", "storage"])(
  "persists unchanged values when %s changes after expiry",
  (option) => {
    sessionStorage.setItem(KEY, expired);
    const initialProps = {
      name: KEY,
      storage: sessionStorage,
      serialize: JSON.stringify as (values: Record<string, any>) => string,
      timeout: 1000,
      exclude: [] as string[],
    };
    const form = renderHook(
      ({ name, ...options }) => {
        const form = useForm({
          defaultValues: { field: "default", secret: "secret" },
        });
        useFormPersist(name, {
          watch: form.watch,
          setValue: form.setValue,
          ...options,
        });
      },
      { initialProps, wrapper }
    );
    expect(sessionStorage.getItem(KEY)).toBeNull();
    const next = {
      ...initialProps,
      [option]: {
        serialize: (values: Record<string, any>) => JSON.stringify(values),
        timeout: 2000,
        exclude: ["secret"],
        name: "new-form",
        storage: localStorage,
      }[option],
    };
    form.rerender(next);
    expect(JSON.parse(next.storage.getItem(next.name)!)).toEqual({
      field: "default",
      ...(option === "exclude" ? {} : { secret: "secret" }),
      _timestamp: NOW,
    });
  }
);

test("keeps suppression when only callback, decoder or equal exclusions change", () => {
  sessionStorage.setItem(KEY, expired);
  const form = renderHook(() => {
    const form = useForm({ defaultValues: { field: "default" } });
    useFormPersist(KEY, {
      watch: form.watch,
      setValue: form.setValue,
      timeout: 1000,
      exclude: ["secret"],
      deserialize: (value) => JSON.parse(value),
      onDataRestored: () => {},
      onTimeout: () => {},
    });
  });
  form.rerender();
  form.rerender();
  expect(sessionStorage.getItem(KEY)).toBeNull();
});

test("restores newly available storage after an earlier entry expired", () => {
  sessionStorage.setItem(KEY, expired);
  const form = renderHook(
    ({ deserialize }) => {
      const form = useForm({ defaultValues: { field: "default" } });
      useFormPersist(KEY, {
        watch: form.watch,
        setValue: form.setValue,
        timeout: 1000,
        deserialize,
      });
      return form;
    },
    { initialProps: { deserialize: JSON.parse } }
  );
  sessionStorage.setItem(
    KEY,
    JSON.stringify({ field: "fresh", _timestamp: NOW })
  );
  form.rerender({ deserialize: (value) => JSON.parse(value) });
  expect(form.result.current.getValues().field).toBe("fresh");
  expect(JSON.parse(sessionStorage.getItem(KEY)!).field).toBe("fresh");
});
