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
    <label htmlFor='fooInput'>foo:</label>
    <input id='fooInput' name='foo' defaultValue='fooValue' ref={register} />

    <label htmlFor='barInput'>bar:</label>
    <input id='barInput' name='bar' defaultValue='barValue' ref={register} />

    <label htmlFor='bazInput'>baz:</label>
    <input id='bazInput' name='baz' defaultValue='bazValue' ref={register} />

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
})
