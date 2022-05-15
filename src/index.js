import { useEffect } from 'react'

const useFormPersist = (
  name,
  { watch, setValue, onTimeout },
  {
    storage,
    exclude = [],
    include,
    onDataRestored,
    validate = false,
    dirty = false,
    timeout = null
  } = {}
) => {
  const watchedValues = watch(include)

  const getStorage = () => storage || window.sessionStorage

  const clearStorage = () => getStorage().removeItem(name)

  useEffect(() => {
    const str = getStorage().getItem(name)
    if (str) {
      const { _timestamp = null, ...values } = JSON.parse(str)
      const dataRestored = {}
      const currTimestamp = Date.now()

      if (timeout && currTimestamp - _timestamp > timeout) {
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
            shouldDirty: dirty
          })
        }
      })

      if (onDataRestored) {
        onDataRestored(dataRestored)
      }
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
      if (timeout) {
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
