import { useCallback, useEffect, useMemo, useRef } from "react";
import { SetFieldValue } from "react-hook-form";
import { createValuesMatcher } from "./values";

export interface FormPersistConfig {
  storage?: Storage;
  watch: (names?: string | string[]) => any;
  setValue: SetFieldValue<any>;
  include?: string[];
  exclude?: string[];
  onDataRestored?: (data: any) => void;
  validate?: boolean;
  dirty?: boolean;
  touch?: boolean;
  onTimeout?: () => void;
  timeout?: number;
  serialize?: (data: Record<string, any>) => string;
  deserialize?: (serialized: string) => Record<string, any>;
}

const useFormPersist = (
  name: string,
  {
    storage,
    watch,
    setValue,
    include,
    exclude = [],
    onDataRestored,
    validate = false,
    dirty = false,
    touch = false,
    onTimeout,
    timeout,
    serialize = JSON.stringify,
    deserialize = JSON.parse,
  }: FormPersistConfig
) => {
  const watchedValues = watch();
  // Callers commonly pass an inline array. Compare its contents so restoration
  // does not run again merely because the array has a new identity.
  const includeKey = JSON.stringify(include);
  const includedFields = useMemo(
    () =>
      includeKey === undefined
        ? undefined
        : (JSON.parse(includeKey) as string[]),
    [includeKey]
  );
  const excludeKey = JSON.stringify(exclude);
  const excludedFields = useMemo(
    () => JSON.parse(excludeKey) as string[],
    [excludeKey]
  );
  const restoredValues = useRef<{
    values: any;
    name: string;
    storage: Storage;
    serialize: typeof serialize;
    includedFields: string[] | undefined;
    excludedFields: string[];
    timeout: number | undefined;
  } | null>(null);
  const expiredValues = useRef<{
    matches: (values: any) => boolean;
    name: string;
    storage: Storage;
    serialize: typeof serialize;
    includedFields: string[] | undefined;
    excludedFields: string[];
    timeout: number | undefined;
  } | null>(null);

  const isSelected = (key: string) =>
    key !== "_timestamp" &&
    (includedFields === undefined || includedFields.includes(key)) &&
    !excludedFields.includes(key);

  const getPersistedValues = (values: any) =>
    Object.entries(values)
      .filter(([key]) => isSelected(key))
      .reduce<Record<string, any>>(
        (obj, [key, val]) => Object.assign(obj, { [key]: val }),
        {}
      );

  const getStorage = useCallback(
    () => storage || window.sessionStorage,
    [storage]
  );

  const clearStorage = useCallback(
    () => getStorage().removeItem(name),
    [getStorage, name]
  );

  useEffect(() => {
    const str = getStorage().getItem(name);

    if (str !== null) {
      const { _timestamp = null, ...values } = deserialize(str);
      // setValue updates watch on a subsequent render. Never write the stale
      // render's defaults over restored data, including StrictMode effect replay.
      restoredValues.current = {
        values: watchedValues,
        name,
        storage: getStorage(),
        serialize,
        includedFields,
        excludedFields,
        timeout,
      };
      const dataRestored: { [key: string]: any } = {};
      const currTimestamp = Date.now();

      if (timeout && currTimestamp - _timestamp > timeout) {
        // Read after registration, when RHF knows the input defaults. A later
        // mount render can return a fresh watch object without any user edits.
        expiredValues.current = {
          matches: createValuesMatcher(getPersistedValues(watch())),
          name,
          storage: getStorage(),
          serialize,
          includedFields,
          excludedFields,
          timeout,
        };
        onTimeout && onTimeout();
        clearStorage();
        return;
      }

      expiredValues.current = null;

      Object.keys(values).forEach((key) => {
        const shouldSet = isSelected(key);
        if (shouldSet) {
          dataRestored[key] = values[key];
          setValue(key, values[key], {
            shouldValidate: validate,
            shouldDirty: dirty,
            shouldTouch: touch,
          });
        }
      });

      // With nothing to restore, setValue cannot trigger a fresh watch snapshot.
      // Allow this render to persist defaults and remove previously excluded data.
      if (!Object.keys(dataRestored).length) {
        restoredValues.current = null;
      }

      if (onDataRestored) {
        onDataRestored(dataRestored);
      }
    }
  }, [clearStorage, deserialize, getStorage, onDataRestored, setValue]);

  useEffect(() => {
    const restored = restoredValues.current;
    if (
      restored &&
      restored.values === watchedValues &&
      restored.name === name &&
      restored.storage === getStorage() &&
      restored.serialize === serialize &&
      restored.includedFields === includedFields &&
      restored.excludedFields === excludedFields &&
      restored.timeout === timeout
    ) {
      return;
    }
    restoredValues.current = null;

    const values = getPersistedValues(watchedValues);
    const expired = expiredValues.current;
    if (
      expired &&
      expired.name === name &&
      expired.storage === getStorage() &&
      expired.serialize === serialize &&
      expired.includedFields === includedFields &&
      expired.excludedFields === excludedFields &&
      expired.timeout === timeout &&
      expired.matches(values)
    ) {
      return;
    }
    expiredValues.current = null;

    if (Object.entries(values).length) {
      if (timeout !== undefined) {
        values._timestamp = Date.now();
      }
      getStorage().setItem(name, serialize(values));
    }
  }, [
    watchedValues,
    timeout,
    includedFields,
    excludedFields,
    getStorage,
    name,
    serialize,
  ]);

  return {
    clear: clearStorage,
  };
};

export default useFormPersist;
