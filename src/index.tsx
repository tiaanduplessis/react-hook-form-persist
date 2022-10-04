import { useEffect } from 'react'
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

  const getStorage = () => storage || window.sessionStorage

  const clearStorage = () => getStorage().removeItem(name)

  useEffect(() => {
    const str = getStorage().getItem(name)

    if (str) {
      const { _timestamp = null, ...values } = JSON.parse(str)
      const dataRestored: { [key: string]: any } = {}
      const currTimestamp = Date.now()

      if (timeout && (currTimestamp - _timestamp) > timeout) {
        onTimeout && onTimeout()
        clearStorage()
        return
      }

      Object.keys(values).forEach((key) => {
        const shouldSet = !exclude.includes(key)
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

      return () => getStorage().setItem(name, JSON.stringify(dataRestored));
    }
  }, [
    storage,
    name,
    onDataRestored,
    setValue
  ])

  useEffect(() => {

    const values = exclude.length
      ? Object.entries(watchedValues)
        .filter(([key]) => !exclude.includes(key))
        .reduce((obj, [key, val]) => Object.assign(obj, { [key]: val }), {})
      : Object.assign({}, watchedValues)

    if (Object.entries(values).length) {
      if (timeout !== undefined) {
        values._timestamp = Date.now()
      }
      getStorage().setItem(name, JSON.stringify(values))
    }
  }, [watchedValues, timeout])

  return {
    clear: () => getStorage().removeItem(name)
  }
}

export default useFormPersist
