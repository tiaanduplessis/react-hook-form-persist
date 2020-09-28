import { useEffect } from 'react'

const useFormPersist = (
  name,
  { watch, setValue },
  {
    storage = window.sessionStorage,
    exlude = [],
    include,
    onDataRestored
  } = {}
) => {
  const values = watch(include)

  useEffect(() => {
    const str = storage.getItem(name)
    if (str) {
      const values = JSON.parse(str)
      const dataRestored = {}

      Object.keys(values).forEach(key => {
        const shouldSet = !exlude.includes(key)
        if (shouldSet) {
          dataRestored[key] = values[key]
          setValue(key, values[key])
        }
      })

      if (onDataRestored) {
        onDataRestored(dataRestored)
      }
    }
  }, [name])

  useEffect(() => {
    storage.setItem(name, JSON.stringify(values))
  })

  return {
    clear: () => storage.removeItem(name)
  }
}

export default useFormPersist
