import { useCallback, useEffect, useRef, useState } from 'react'
import { SetFieldValue } from 'react-hook-form'

export interface FormPersistConfig {
  storage?: Storage;
  watch: (names?: string | string[]) => any;
  setValue: SetFieldValue<any>;
  exclude?: string[];
  onDataRestored?: (data: any) => void;
  validate?: boolean;
  dirty?: boolean;
  touch?: boolean;
  onTimeout?: () => void;
  timeout?: number;
}

const useFormPersist = (
  name: string,
  {
    storage,
    watch,
    setValue,
    exclude = [],
    onDataRestored,
    validate = false,
    dirty = false,
    touch = false,
    onTimeout,
    timeout
  }: FormPersistConfig
) => {
  const watchedValues = watch()
  const [localExclude] = useState<string[]>(exclude)

  const getStorage = useCallback(() => storage || window.sessionStorage, [storage])
  const clearStorage = useCallback(() => getStorage().removeItem(name), [getStorage, name])
  const onTimeoutCallback = useCallback(() => onTimeout && onTimeout(), [onTimeout])
  const _mounted = useRef(true)

  useEffect(() => {
    const str = getStorage().getItem(name)

    if (str && _mounted.current) {
      const { _timestamp = null, ...values } = JSON.parse(str)
      const dataRestored: { [key: string]: any } = {}
      const currTimestamp = Date.now()

      if (timeout && (currTimestamp - _timestamp) > timeout) {
        onTimeoutCallback()
        clearStorage()
        return
      }

      Object.keys(values).forEach((key) => {
        const shouldSet = !localExclude.includes(key)
        if (shouldSet) {
          dataRestored[key] = values[key]
          setValue(key, values[key], {
            shouldValidate: validate,
            shouldDirty: dirty,
            shouldTouch: touch
          })
        }
      })

      if (onDataRestored) {
        onDataRestored(dataRestored)
      }
    }

    return () => {
      _mounted.current = false
    }
  }, [
    storage,
    name,
    onDataRestored,
    setValue,
    clearStorage,
    dirty,
    localExclude,
    getStorage,
    onTimeoutCallback,
    timeout,
    touch,
    validate
  ])

  useEffect(() => {

    const values = localExclude.length
      ? Object.entries(watchedValues)
        .filter(([key]) => !localExclude.includes(key))
        .reduce((obj, [key, val]) => Object.assign(obj, { [key]: val }), {})
      : Object.assign({}, watchedValues)

    if (Object.entries(values).length ) {
      if (timeout !== undefined) {
        values._timestamp = Date.now()
      }
      getStorage().setItem(name, JSON.stringify(values))
    }

    return () => {
      _mounted.current = false
    }
  }, [
    watchedValues,
    timeout,
    localExclude,
    getStorage,
    name,
  ])

  return {
    clear: () => getStorage().removeItem(name)
  }
}

export default useFormPersist
