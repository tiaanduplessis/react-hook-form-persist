import { useEffect } from 'react'

const useFormPersist = (
  storageKey,
  { watch, setValue },
  {
    storage = window.sessionStorage,
    exclude = [],
    include,
    onDataRestored
  } = {}
) => {
  const watchedValues = watch(include)

  const values = exclude.length
    ? Object.entries(watchedValues)
      .filter(([key]) => !exclude.includes(key))
      .reduce((obj, [key, val]) => Object.assign(obj, { [key]: val }), {})
    : Object.assign({}, watchedValues)

  useEffect(() => {
    const storageItem = storage.getItem(storageKey)

    if (storageItem === null) return

    const values = JSON.parse(storageItem)

    const dataRestored = {}
    Object.keys(values).forEach((key) => {
      dataRestored[key] = values[key]
      setValue(key, values[key])
    })

    if (onDataRestored) {
      onDataRestored(dataRestored)
    }
  }, [
    storage,
    storageKey,
    onDataRestored,
    setValue
  ])

  useEffect(() => {
    storage.setItem(storageKey, JSON.stringify(values))
  })

  return {
    clear: () => storage.removeItem(storageKey)
  }
}

export default useFormPersist
