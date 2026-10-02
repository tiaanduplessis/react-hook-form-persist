// Capture the contents of RHF's mutable form values without invoking the user's
// codecs. Opaque values keep their identity; arrays, records and Dates are copied
// into matchers so later nested edits cannot also mutate the baseline.
export const createValuesMatcher = (
  value: any,
  seen = new WeakSet<object>()
): ((current: any) => boolean) => {
  if (value instanceof Date) {
    const time = value.getTime();
    return (current) =>
      current instanceof Date && Object.is(current.getTime(), time);
  }

  if (value === null || typeof value !== "object") {
    return (current) => Object.is(current, value);
  }

  const prototype = Object.getPrototypeOf(value);
  if (
    (!Array.isArray(value) &&
      prototype !== Object.prototype &&
      prototype !== null) ||
    seen.has(value)
  ) {
    return (current) => Object.is(current, value);
  }
  seen.add(value);

  const keys = Object.keys(value);
  const matchers = keys.map((key) => createValuesMatcher(value[key], seen));
  seen.delete(value);
  const length = Array.isArray(value) ? value.length : undefined;
  return (current) =>
    current !== null &&
    typeof current === "object" &&
    Object.getPrototypeOf(current) === prototype &&
    (length === undefined || current.length === length) &&
    Object.keys(current).length === keys.length &&
    keys.every(
      (key, index) =>
        Object.prototype.hasOwnProperty.call(current, key) &&
        matchers[index](current[key])
    );
};
