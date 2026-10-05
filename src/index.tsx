import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SetFieldValue } from "react-hook-form";
import { createValuesMatcher } from "./values";
import { createStorageActivation } from "./storage";
import { isSafeField } from "./fields";

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
  onStorageError?: (error: unknown) => void;
  timeout?: number;
  serialize?: (data: Record<string, any>) => string;
  deserialize?: (serialized: string) => Record<string, any>;
}

const useFormPersist = (
  name: string | null,
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
    onStorageError,
    timeout,
    serialize = JSON.stringify,
    deserialize = JSON.parse,
  }: FormPersistConfig
) => {
  const [previousActivation, setActivation] = useState(() =>
    createStorageActivation(name, storage)
  );
  let activation = previousActivation;
  if (activation.name !== name || activation.storage !== storage) {
    activation = createStorageActivation(name, storage);
    // Adjust only on an actual target change. Unlike effect cleanup or a memo
    // cache, this does not revive suspended storage during StrictMode replay.
    setActivation(activation);
  }
  const attemptStorage = activation.attempt;
  const [synchronizedActivation, setSynchronizedActivation] = useState<
    typeof activation | null
  >(null);

  const watchedValues = name === null ? null : watch();
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
    activation: typeof activation;
    values: any;
    name: string;
    storage: Storage;
    serialize: typeof serialize;
    includedFields: string[] | undefined;
    excludedFields: string[];
    timeout: number | undefined;
  } | null>(null);
  const expiredValues = useRef<{
    activation: typeof activation;
    matches: (values: any) => boolean;
    name: string;
    storage: Storage;
    serialize: typeof serialize;
    includedFields: string[] | undefined;
    excludedFields: string[];
    timeout: number | undefined;
  } | null>(null);

  const isSelected = (key: string, value: any) =>
    key !== "_timestamp" &&
    (includedFields === undefined || includedFields.includes(key)) &&
    !excludedFields.includes(key) &&
    isSafeField(key, value);

  const getPersistedValues = (values: any) =>
    Object.entries(values)
      .filter(([key, value]) => isSelected(key, value))
      .reduce<Record<string, any>>(
        (obj, [key, val]) => Object.assign(obj, { [key]: val }),
        {}
      );

  const getStorage = useCallback(
    (handler: FormPersistConfig["onStorageError"]) =>
      attemptStorage(() => storage || window.sessionStorage, handler),
    [attemptStorage, storage]
  );

  const clearStorage = useCallback(() => {
    if (name !== null) {
      const target = getStorage(onStorageError);
      if (target) {
        attemptStorage(() => target.value.removeItem(name), onStorageError);
      }
    }
  }, [attemptStorage, getStorage, name, onStorageError]);

  useEffect(() => {
    if (name === null) {
      restoredValues.current = null;
      expiredValues.current = null;
      return;
    }

    const target = getStorage(onStorageError);
    if (!target) {
      return;
    }
    const read = attemptStorage(
      () => target.value.getItem(name),
      onStorageError
    );
    if (!read) {
      return;
    }
    const str = read.value;

    if (str !== null) {
      const { _timestamp = null, ...values } = deserialize(str);
      // setValue updates watch on a subsequent render. Never write the stale
      // render's defaults over restored data, including StrictMode effect replay.
      restoredValues.current = {
        activation,
        values: watchedValues,
        name,
        storage: target.value,
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
          activation,
          matches: createValuesMatcher(getPersistedValues(watch())),
          name,
          storage: target.value,
          serialize,
          includedFields,
          excludedFields,
          timeout,
        };
        onTimeout && onTimeout();
        const removed = attemptStorage(
          () => target.value.removeItem(name),
          onStorageError
        );
        if (removed) {
          setSynchronizedActivation(activation);
        }
        return;
      }

      expiredValues.current = null;

      Object.entries(values).forEach(([key, value]) => {
        const shouldSet = isSelected(key, value);
        if (shouldSet) {
          dataRestored[key] = value;
          setValue(key, value, {
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

    // Publish readiness on a fresh render, after synchronous restoration and
    // callbacks succeed. The activation identity prevents a new target from
    // exposing the previous target's readiness before its values are restored.
    setSynchronizedActivation(activation);
  }, [attemptStorage, deserialize, getStorage, name, onDataRestored, setValue]);

  useEffect(() => {
    if (name === null || !activation.isActive()) {
      return;
    }

    // Keep the no-write path lazy, and reuse one resolved storage object for
    // comparisons and writing. In particular, include: [] needs no extra access.
    let target: ReturnType<typeof getStorage>;
    const getTarget = () => target || (target = getStorage(onStorageError));

    const restored = restoredValues.current;
    if (
      restored &&
      restored.activation === activation &&
      restored.values === watchedValues &&
      restored.name === name &&
      restored.storage === getTarget()?.value &&
      restored.serialize === serialize &&
      restored.includedFields === includedFields &&
      restored.excludedFields === excludedFields &&
      restored.timeout === timeout
    ) {
      return;
    }
    if (!activation.isActive()) {
      return;
    }
    restoredValues.current = null;

    const values = getPersistedValues(watchedValues);
    const expired = expiredValues.current;
    if (
      expired &&
      expired.activation === activation &&
      expired.name === name &&
      expired.storage === getTarget()?.value &&
      expired.serialize === serialize &&
      expired.includedFields === includedFields &&
      expired.excludedFields === excludedFields &&
      expired.timeout === timeout &&
      expired.matches(values)
    ) {
      return;
    }
    if (!activation.isActive()) {
      return;
    }
    expiredValues.current = null;

    if (Object.entries(values).length) {
      if (timeout !== undefined) {
        values._timestamp = Date.now();
      }
      const target = getTarget();
      if (target) {
        const serialized = serialize(values);
        attemptStorage(
          () => target.value.setItem(name, serialized),
          onStorageError
        );
      }
    }
  }, [
    attemptStorage,
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
    isSynchronized: name !== null && synchronizedActivation === activation,
  };
};

export default useFormPersist;
