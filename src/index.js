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
    timeout = null,
  } = {}
) => {
  const values = watch(include)
  const getStorage = () => storage || window.sessionStorage
  const clearStorage = () => {
    getStorage().removeItem(name)
  }

  useEffect(() => {
    const str = getStorage().getItem(name)
    if (str) {
      const { _timestamp = null, ...values } = JSON.parse(str)
      const dataRestored = {}
      const currTimestamp = Date.now()
      if (timeout && currTimestamp - _timestamp > timeout) {
        onTimeout && onTimeout();
        clearStorage();
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
  }, [name])

  useEffect(() => {
    const _timestamp = Date.now()
    getStorage().setItem(name, JSON.stringify({ ...values, _timestamp }))
  })

  return {
    clear: () => getStorage().removeItem(name)
  }
}

export default useFormPersist
