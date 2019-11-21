import { useEffect } from 'react'

const useFormPersist = (name, { watch, setValue }, { storage = window.sessionStorage, ignore = [] } = {}) => {
  const values = watch()

  useEffect(() => {
    const str = storage.getItem(name)
    if (str) {
      const values = JSON.parse(str)
      Object.keys(values).forEach(key => {
        if (!ignore.includes(key)) {
          setValue(key, values[key])
        }
      })
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
