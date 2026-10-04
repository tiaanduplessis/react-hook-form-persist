// RHF's supported versions interpret dotted/bracketed names slightly
// differently. Reserve these segments under both path parsers.
const hasReservedSegment = (parts: string[]) =>
  parts.some(
    (part) =>
      part === "__proto__" || part === "constructor" || part === "prototype"
  );

const isSafePath = (name: string) =>
  !hasReservedSegment(name.replace(/["'|\]]/g, "").split(/[.\[]/)) &&
  !hasReservedSegment(name.split(/[.[\]'"]/));

const isSafeValue = (value: any, seen: WeakSet<object>): boolean => {
  if (value === null || typeof value !== "object" || seen.has(value)) {
    return true;
  }
  seen.add(value);

  // Older RHF versions also visit inherited enumerable fields. Check the same
  // boundary without cloning or changing the user's values or custom codecs.
  for (const key in value) {
    if (!isSafePath(key) || !isSafeValue(value[key], seen)) {
      return false;
    }
  }
  return true;
};

export const isSafeField = (name: string, value: any): boolean =>
  isSafePath(name) && isSafeValue(value, new WeakSet<object>());
