import { describe, expect, test } from "vitest";
import { createValuesMatcher } from "../src/values";

describe("expired-value snapshots", () => {
  test("compares shared records by contents rather than alias identity", () => {
    const shared = { count: BigInt(1) };
    const matches = createValuesMatcher({ first: shared, second: shared });
    expect(
      matches({ first: { count: BigInt(1) }, second: { count: BigInt(1) } })
    ).toBe(true);
    shared.count = BigInt(2);
    expect(matches({ first: shared, second: shared })).toBe(false);
  });

  test("captures nested records and arrays before they are mutated", () => {
    const values = { nested: { items: [{ count: BigInt(1) }] } };
    const matches = createValuesMatcher(values);
    expect(matches({ nested: { items: [{ count: BigInt(1) }] } })).toBe(true);
    values.nested.items[0].count = BigInt(2);
    expect(matches(values)).toBe(false);
  });

  test("captures Date milliseconds, including invalid Dates", () => {
    const date = new Date(0);
    const matches = createValuesMatcher({ date });
    expect(matches({ date: new Date(0) })).toBe(true);
    date.setTime(1000);
    expect(matches({ date })).toBe(false);
    expect(matches({ date: "1970-01-01T00:00:00.000Z" })).toBe(false);
    expect(createValuesMatcher(new Date(NaN))(new Date(NaN))).toBe(true);
  });

  test("distinguishes primitive changes without JSON coercion", () => {
    const matches = createValuesMatcher({ count: BigInt(1), value: undefined });
    expect(matches({ count: BigInt(1), value: undefined })).toBe(true);
    expect(matches({ count: BigInt(1) })).toBe(false);
    expect(matches({ count: BigInt(1), other: undefined })).toBe(false);
    expect(matches({ count: 1, value: undefined })).toBe(false);
    expect(createValuesMatcher(NaN)(NaN)).toBe(true);
    expect(createValuesMatcher(0)(-0)).toBe(false);
    expect(createValuesMatcher(null)(null)).toBe(true);
  });

  test("checks sparse array length and does not confuse arrays with records", () => {
    expect(createValuesMatcher(new Array(2))(new Array(2))).toBe(true);
    expect(createValuesMatcher(new Array(2))(new Array(3))).toBe(false);
    expect(createValuesMatcher([])({})).toBe(false);
    expect(createValuesMatcher({})([])).toBe(false);
    expect(createValuesMatcher({})(null)).toBe(false);
    expect(createValuesMatcher({})(false)).toBe(false);
  });

  test("supports records with a null prototype", () => {
    const values = Object.assign(Object.create(null), { count: BigInt(1) });
    const matches = createValuesMatcher(values);
    expect(
      matches(Object.assign(Object.create(null), { count: BigInt(1) }))
    ).toBe(true);
    values.count = BigInt(2);
    expect(matches(values)).toBe(false);
  });

  test("keeps opaque values by reference and handles cycles without recursion errors", () => {
    const opaque = new Map([["key", "value"]]);
    const matches = createValuesMatcher({ opaque });
    expect(matches({ opaque })).toBe(true);
    expect(matches({ opaque: new Map([["key", "value"]]) })).toBe(false);
    const cycle: Record<string, any> = { field: "default" };
    cycle.self = cycle;
    const matchesCycle = createValuesMatcher(cycle);
    expect(matchesCycle(cycle)).toBe(true);
    cycle.field = "edited";
    expect(matchesCycle(cycle)).toBe(false);
  });
});
