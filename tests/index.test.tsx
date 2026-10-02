import React from "react";
import { vi, describe, test, expect, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { useForm, UseFormProps } from "react-hook-form";
import userEvent from "@testing-library/user-event";

import useFormPersist, { FormPersistConfig } from "../src";

const STORAGE_KEY = "STORAGE_KEY";

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const Form = ({
  onSubmit = () => {},
  config = {},
  useFormConfig = {},
  name = STORAGE_KEY,
}: {
  onSubmit?: any;
  config?: Omit<FormPersistConfig, "watch" | "setValue">;
  useFormConfig?: UseFormProps;
  name?: string;
}) => {
  const { register, handleSubmit, watch, setValue } = useForm(useFormConfig);

  const { clear } = useFormPersist(name, { watch, setValue, ...config });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <label>
        foo:
        <input id="foo" {...register("foo")} />
      </label>

      <label>
        bar:
        <input id="bar" {...register("bar")} />
      </label>

      <label>
        baz:
        <input id="baz" {...register("baz")} />
      </label>

      <button type="submit">submit</button>
      <button type="button" onClick={clear}>
        clear
      </button>
    </form>
  );
};

describe("react-hook-form-persist", () => {
  test("should persist fields in storage", async () => {
    const spy = vi.spyOn(window.Storage.prototype, "setItem");

    render(<Form />);

    await userEvent.type(screen.getByLabelText("foo:"), "foo");

    expect(spy).toHaveBeenCalled();

    expect(
      JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || "{}")
    ).toEqual({
      foo: "foo",
      bar: "",
      baz: "",
    });
  });

  test("should retrieve stored fields", async () => {
    const spy = vi.spyOn(window.Storage.prototype, "getItem");

    const { unmount } = render(<Form />);

    await userEvent.type(screen.getByLabelText("foo:"), "foo");

    unmount();
    render(<Form />);

    expect(spy).toHaveBeenCalled();
    expect(screen.getByLabelText("foo:")).toHaveValue("foo");
  });

  test("should not persist excluded fields", async () => {
    render(<Form config={{ exclude: ["baz", "foo"] }} />);

    await userEvent.type(screen.getByLabelText("foo:"), "foo");
    await userEvent.type(screen.getByLabelText("bar:"), "bar");
    await userEvent.type(screen.getByLabelText("baz:"), "baz");

    expect(
      JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || "{}")
    ).toEqual({
      bar: "bar",
    });
  });

  test("should support timeout config option", async () => {
    const now = Date.now();
    const { unmount } = render(<Form config={{ timeout: 1000 }} />);

    const spy = vi.spyOn(Date, "now").mockReturnValue(now);

    await userEvent.type(screen.getByLabelText("foo:"), "foo");
    await userEvent.type(screen.getByLabelText("bar:"), "bar");
    await userEvent.type(screen.getByLabelText("baz:"), "baz");

    expect(spy).toHaveBeenCalled();
    expect(
      JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || "{}")
    ).toEqual({
      bar: "bar",
      baz: "baz",
      foo: "foo",
      _timestamp: now,
    });

    unmount();
    spy.mockImplementation(() => now + 4000);
    const clearSpy = vi.spyOn(window.Storage.prototype, "removeItem");

    render(<Form config={{ timeout: 1000 }} />);

    expect(clearSpy).toHaveBeenCalled();
    expect(
      JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || "{}")
    ).toEqual({});
  });
});
