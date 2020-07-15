import React from 'react'
import { render, cleanup } from '@testing-library/react'
import { useForm } from 'react-hook-form'
import useFormPersist from '../'
import MutationObserver from 'mutation-observer'

import 'babel-polyfill'

global.MutationObserver = MutationObserver

afterEach(cleanup)

const wait = () => new Promise(resolve => setTimeout(resolve, 1000))

test('Store should persist form state in storage', async () => {
  const internal = {}

  const storage = {
    getItem: jest.fn(() => {}),
    setItem: jest.fn((key, val) => {
      internal.key = key
      internal.val = JSON.parse(val)
    })
  }

  function Form () {
    const { register, handleSubmit, watch, setValue } = useForm()

    useFormPersist('foo', { watch, setValue }, { storage })

    const onSubmit = data => {
      console.log(data)
    }

    return (
      <form onSubmit={handleSubmit(onSubmit)}>
        <input name='bar' defaultValue='foo' ref={register} />
        <input type='submit' />
      </form>
    )
  }

  render(<Form />)

  await wait()

  expect(storage.getItem).toHaveBeenCalled()
  expect(storage.setItem).toHaveBeenCalled()
  expect(internal.key).toBe('foo')
})
