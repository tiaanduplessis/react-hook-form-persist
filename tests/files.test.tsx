import React, { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";

import useFormPersist from "../src";

const KEY = "file-form";
const stored = () => JSON.parse(localStorage.getItem(KEY)!);

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

test("a native file input rejects programmatic filename restoration", () => {
  const input = document.createElement("input");
  input.type = "file";
  expect(() => {
    input.value = "previous-upload.txt";
  }).toThrow(DOMException);
  expect(input.value).toBe("");
  expect(input.files).toHaveLength(0);
});

describe.each([false, true])(
  "file field exclusion, StrictMode=%s",
  (strict) => {
    describe.each([
      { name: "exclude", selection: { exclude: ["attachment"] } },
      { name: "include", selection: { include: ["title"] } },
    ])("$name", ({ selection }) => {
      test.each(["previous-upload.txt", { 0: {} }])(
        "omits new files and ignores a previously stored file value: %j",
        async (previousFile) => {
          const restored = vi.fn();
          const serialize = vi.fn(JSON.stringify);
          const Form = () => {
            const { register, watch, setValue } = useForm({
              defaultValues: { title: "", attachment: null },
            });
            useFormPersist(KEY, {
              watch,
              setValue,
              storage: localStorage,
              serialize,
              onDataRestored: restored,
              ...selection,
            });
            return (
              <form>
                <input aria-label="title" {...register("title")} />
                <input
                  aria-label="attachment"
                  type="file"
                  {...register("attachment")}
                />
              </form>
            );
          };
          const element = strict ? (
            <StrictMode>
              <Form />
            </StrictMode>
          ) : (
            <Form />
          );
          localStorage.setItem(
            KEY,
            JSON.stringify({ title: "saved title", attachment: previousFile })
          );
          const first = render(element);
          expect(screen.getByLabelText("title")).toHaveValue("saved title");
          expect(restored).toHaveBeenCalledWith({ title: "saved title" });
          const input = screen.getByLabelText("attachment") as HTMLInputElement;
          expect(input.value).toBe("");
          expect(input.files).toHaveLength(0);

          const file = new File(["synthetic test content"], "example.txt", {
            type: "text/plain",
          });
          await userEvent.upload(input, file);
          expect(input.files).toHaveLength(1);
          expect(input.files![0]).toBe(file);
          await userEvent.type(screen.getByLabelText("title"), " edited");
          expect(stored()).toEqual({ title: "saved title edited" });
          for (const [values] of serialize.mock.calls) {
            expect(values).not.toHaveProperty("attachment");
          }
          first.unmount();
          render(element);
          expect(screen.getByLabelText("title")).toHaveValue(
            "saved title edited"
          );
          const reopened = screen.getByLabelText(
            "attachment"
          ) as HTMLInputElement;
          expect(reopened.value).toBe("");
          expect(reopened.files).toHaveLength(0);
          expect(stored()).toEqual({ title: "saved title edited" });
          await userEvent.type(screen.getByLabelText("title"), " again");
          expect(stored()).toEqual({ title: "saved title edited again" });
        }
      );
    });
  }
);
