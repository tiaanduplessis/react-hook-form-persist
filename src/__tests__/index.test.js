import React from 'react'
import { act, render, fireEvent, cleanup } from '@testing-library/react'
import { useForm } from 'react-hook-form'
import useFormPersist from '../'
import MutationObserver from 'mutation-observer'

import 'babel-polyfill'

global.MutationObserver = MutationObserver

afterEach(cleanup)

const wait = () => new Promise(resolve => setTimeout(resolve, 1000))

const storageFactory = () => ({
  memory: {},
  getItem: jest.fn(function (key) {
    const value = this.memory[key]
    return typeof value === 'string' ? JSON.parse(value) : null
  }),
  setItem: jest.fn(function (key, value) {
    this.memory[key] = value
  })
})

const STORAGE_KEY = 'storageKey'

describe('Form persist hook', () => {
  test('should persist all form fields in storage', async () => {
    const storage = storageFactory()

    function Form () {
      const { register, handleSubmit, watch, setValue } = useForm()

      useFormPersist(STORAGE_KEY, { watch, setValue }, { storage })

      return (
        <form data-testid='form' onSubmit={handleSubmit(() => null)}>
          <input name='foo' defaultValue='fooValue' ref={register} />
          <input name='bar' defaultValue='barValue' ref={register} />
          <input name='baz' defaultValue='bazValue' ref={register} />
          <input type='submit' />
        </form>
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
    const storage = storageFactory()

    function Form () {
      const { register, handleSubmit, watch, setValue } = useForm()

      useFormPersist(STORAGE_KEY, { watch, setValue }, { storage, include: ['bar'] })

      return (
        <form data-testid='form' onSubmit={handleSubmit(() => null)}>
          <input name='foo' defaultValue='fooValue' ref={register} />
          <input name='bar' defaultValue='barValue' ref={register} />
          <input name='baz' defaultValue='bazValue' ref={register} />
          <input type='submit' />
        </form>
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
    const storage = storageFactory()

    function Form () {
      const { register, handleSubmit, watch, setValue } = useForm()

      useFormPersist(STORAGE_KEY, { watch, setValue }, { storage, exclude: ['baz'] })

      return (
        <form data-testid='form' onSubmit={handleSubmit(() => null)}>
          <input name='foo' defaultValue='fooValue' ref={register} />
          <input name='bar' defaultValue='barValue' ref={register} />
          <input name='baz' defaultValue='bazValue' ref={register} />
          <input type='submit' />
        </form>
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
})
