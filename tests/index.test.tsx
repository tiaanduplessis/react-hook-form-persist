import React from 'react'
import { vi, describe, test, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useForm } from 'react-hook-form'
import userEvent from '@testing-library/user-event'

import useFormPersist, { FormPersistConfig } from '../src'

const STORAGE_KEY = 'STORAGE_KEY'

beforeEach(() => {
  window.sessionStorage.clear()
})


const Form = ({ onSubmit = () => {}, config = {}, name = STORAGE_KEY }: { onSubmit?: any, config?: Omit<FormPersistConfig, 'watch' | 'setValue'>, name?: string | null }) => {
  const { register, handleSubmit, watch, setValue } = useForm()

  useFormPersist(name, { watch, setValue, ...config })

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <label>foo:
        <input id="foo" {...register('foo')} />
      </label>

      <label>bar:
        <input id="bar" {...register('bar')} />
      </label>

      <label>baz:
        <input id="baz" {...register('baz')} />
      </label>

      <button type="submit">submit</button>
    </form>
  )
}

describe('react-hook-form-persist', () => {
  test('should persist fields in storage', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem')

    render(<Form />)

    await userEvent.type(screen.getByLabelText('foo:'), 'foo')

    expect(spy).toHaveBeenCalled()

    expect(JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || "{}")).toEqual({
      foo: 'foo',
      bar: '',
      baz: ''
    })
  })

  test('should not persist when no name is present', async () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem')

    render(<Form name={null} />)

    await userEvent.type(screen.getByLabelText('foo:'), 'foo')

    expect(spy).not.toHaveBeenCalled()
  })

  test('should retrieve stored fields', async () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem')

    const { unmount } = render(<Form />)

    await userEvent.type(screen.getByLabelText('foo:'), 'foo')

    unmount()
    render(<Form />)

    expect(spy).toHaveBeenCalled()
    expect(screen.getByLabelText('foo:')).toHaveValue('foo')
  })

  test('should not persist excluded fields', async () => {
    render(<Form config={{ exclude: ['baz', 'foo'] }} />)

    await userEvent.type(screen.getByLabelText('foo:'), 'foo')
    await userEvent.type(screen.getByLabelText('bar:'), 'bar')
    await userEvent.type(screen.getByLabelText('baz:'), 'baz')

    expect(JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || "{}")).toEqual({
      bar: 'bar'
    })
  })

  test('should support timeout config option', async () => {
    const now = Date.now()
    const { unmount } = render(<Form config={{ timeout: 1000 }} />)

    const spy = vi.spyOn(Date, 'now').mockReturnValue(now)

    await userEvent.type(screen.getByLabelText('foo:'), 'foo')
    await userEvent.type(screen.getByLabelText('bar:'), 'bar')
    await userEvent.type(screen.getByLabelText('baz:'), 'baz')

    expect(spy).toBeCalled()
    expect(JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || "{}")).toEqual({
      bar: 'bar',
      baz: 'baz',
      foo: 'foo',
      _timestamp: now
    })

    unmount()
    spy.mockImplementation(() => now + 4000)
    const clearSpy = vi.spyOn(Storage.prototype, 'removeItem')

    render(<Form config={{ timeout: 1000 }} />)

    expect(clearSpy).toBeCalled()
    expect(JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || "{}")).toEqual({})
  })

})
