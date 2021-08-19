import { useEffect } from 'react'

const useFormPersist = (
  name,
  { watch, setValue },
  {
    storage,
    exclude = [],
    include,
    onDataRestored,
    validate = false,
    dirty = false
  } = {}
) => {
  const values = watch(include)
  const getStorage = () => storage || window.sessionStorage

  useEffect(() => {
    const str = getStorage().getItem(name)
    if (str) {
      const values = JSON.parse(str)
      const dataRestored = {}

      Object.keys(values).forEach(key => {
        const shouldSet = !exclude.includes(key)
        if (shouldSet) {
          dataRestored[key] = values[key]
          setValue(key, values[key], { shouldValidate: validate, shouldDirty: dirty })
        }
      })

      if (onDataRestored) {
        onDataRestored(dataRestored)
      }
    }
  }, [name])

  useEffect(() => {
    if (Object.entries(values).length) {
      getStorage().setItem(name, JSON.stringify(values))
    }
  })

  return {
    clear: () => getStorage().removeItem(name)
  }
}

export default useFormPersist
