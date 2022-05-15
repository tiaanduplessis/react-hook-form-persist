import React from 'react'
import { act, render, fireEvent, cleanup } from '@testing-library/react'
import { useForm } from 'react-hook-form'
import MutationObserver from 'mutation-observer'
import 'babel-polyfill'

import useFormPersist from '../'

global.MutationObserver = MutationObserver

const STORAGE_KEY = 'storageKey'

const wait = () => new Promise(resolve => setTimeout(resolve, 1000))

const storageMock = () => ({
  memory: {},
  getItem: jest.fn(function (key) {
    const value = this.memory[key]
    return typeof value === 'string' ? JSON.parse(value) : null
  }),
  setItem: jest.fn(function (key, value) {
    this.memory[key] = value
  })
})

const FormComponentMock = ({ register, handleSubmit }) => (
  <form data-testid='form' onSubmit={handleSubmit(() => null)}>
    <label>foo:
      <input name='foo' defaultValue='fooValue' ref={register} />
    </label>

    <label>bar:
      <input name='bar' defaultValue='barValue' ref={register} />
    </label>

    <label>baz:
      <input name='baz' defaultValue='bazValue' ref={register} />
    </label>

    <input type='submit' />
  </form>
)

afterEach(cleanup)

describe('Form persist hook', () => {
  test('should persist all form fields in storage', async () => {
    const storage = storageMock()

    function Form () {
      const { register, handleSubmit, watch, setValue } = useForm()

      useFormPersist(STORAGE_KEY, { watch, setValue }, { storage })

      return (
        <FormComponentMock
          register={register}
          handleSubmit={handleSubmit}
        />
      )
    }

    act(() => {
      const { getByTestId } = render(<Form />)
      fireEvent.submit(getByTestId('form'))
    })

    await wait()

    expect(storage.getItem).toHaveBeenCalled()
    expect(storage.setItem).toHaveBeenCalled()
    expect(storage.getItem(STORAGE_KEY)).toEqual({
      foo: 'fooValue',
      bar: 'barValue',
      baz: 'bazValue'
    })
  })

  test('should persist only specified fields in storage', async () => {
    const storage = storageMock()

    function Form () {
      const { register, handleSubmit, watch, setValue } = useForm()

      useFormPersist(STORAGE_KEY, { watch, setValue }, { storage, include: ['bar'] })

      return (
        <FormComponentMock
          register={register}
          handleSubmit={handleSubmit}
        />
      )
    }

    act(() => {
      const { getByTestId } = render(<Form />)
      fireEvent.submit(getByTestId('form'))
    })

    await wait()

    expect(storage.getItem).toHaveBeenCalled()
    expect(storage.setItem).toHaveBeenCalled()
    expect(storage.getItem(STORAGE_KEY)).toEqual({ bar: 'barValue' })
  })

  test('should not persist excluded fields in storage', async () => {
    const storage = storageMock()

    function Form () {
      const { register, handleSubmit, watch, setValue } = useForm()

      useFormPersist(STORAGE_KEY, { watch, setValue }, { storage, exclude: ['baz'] })

      return (
        <FormComponentMock
          register={register}
          handleSubmit={handleSubmit}
        />
      )
    }

    act(() => {
      const { getByTestId } = render(<Form />)
      fireEvent.submit(getByTestId('form'))
    })

    await wait()

    expect(storage.getItem).toHaveBeenCalled()
    expect(storage.setItem).toHaveBeenCalled()
    expect(storage.getItem(STORAGE_KEY)).toEqual({
      foo: 'fooValue',
      bar: 'barValue'
    })
  })

  test('should have timeout for storage of config option is provided', async () => {
    const mockTime = 10
    const timeout = 1000 * 100
    const mockTimePreTimeout = mockTime + timeout / 2

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

    render(<Form />)
    await wait()
    expect(internal.val._timestamp).toBe(mockTimePreTimeout)
  })

  test('should remove expired items from storage', async () => {
    const mockTime = 10
    const timeout = 1000 * 100
    const mockTimePostTimeout = mockTime + timeout * 2

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

    Date.now = jest.fn(() => mockTimePostTimeout)
    render(<Form />)
    await wait()
    expect(storage.removeItem).toHaveBeenCalled()
  })
})
