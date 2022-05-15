import React from 'react'
import { render, cleanup } from '@testing-library/react'
import { useForm } from 'react-hook-form'
import useFormPersist from '../'
import MutationObserver from 'mutation-observer'

import 'babel-polyfill'

global.MutationObserver = MutationObserver

afterEach(cleanup)

const wait = () => new Promise(resolve => setTimeout(resolve, 1000))

const mockTime = 1487076708000
const timeout = 1000 * 100
const mockTimePreTimeout = mockTime + timeout / 2
const mockTimePostTimeout = mockTime + timeout * 2
Date.now = jest.fn(() => mockTime)

test('Store should persist form state in storage', async () => {
  const internal = {}

  const storage = {
    getItem: jest.fn(() => JSON.stringify(internal.val)),
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
  expect(internal.val._timestamp).toBe(mockTime)
})

test('Store should timeout persisted storage', async () => {
  const internal = {
    val: {
      foo: 'foo', _timestamp: mockTime
    }
  }

  const storage = {
    getItem: jest.fn(() => JSON.stringify(internal.val)),
    setItem: jest.fn((key, val) => {
      internal.key = key
      internal.val = JSON.parse(val)
    }),
    removeItem: jest.fn(() => {})
  }

  function Form () {
    const { register, handleSubmit, watch, setValue } = useForm()

    useFormPersist('foo', { watch, setValue }, { storage, timeout })

    const onSubmit = (data) => {
      console.log(data)
    }

    return (
      <form onSubmit={handleSubmit(onSubmit)}>
        <input name='bar' defaultValue='foo' ref={register} />
        <input type='submit' />
      </form>
    )
  }

  Date.now = jest.fn(() => mockTimePreTimeout)
  await wait()
  render(<Form />)
  expect(internal.val._timestamp).toBe(mockTimePreTimeout)

  await wait()
  Date.now = jest.fn(() => mockTimePostTimeout)
  render(<Form />)
  expect(internal.val._timestamp).toBe(mockTimePostTimeout)
  expect(storage.removeItem).toHaveBeenCalled()
})
