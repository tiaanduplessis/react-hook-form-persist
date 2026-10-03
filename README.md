
# react-hook-form-persist
[![package version](https://img.shields.io/npm/v/react-hook-form-persist.svg?style=flat-square)](https://npmjs.org/package/react-hook-form-persist)
[![package downloads](https://img.shields.io/npm/dm/react-hook-form-persist.svg?style=flat-square)](https://npmjs.org/package/react-hook-form-persist)
[![standard-readme compliant](https://img.shields.io/badge/readme%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme)
[![package license](https://img.shields.io/npm/l/react-hook-form-persist.svg?style=flat-square)](https://npmjs.org/package/react-hook-form-persist)
[![make a pull request](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](http://makeapullrequest.com)

Persist and populate [react-hook-form](https://react-hook-form.com/) form using storage of your choice

## 📖 Table of Contents

- [react-hook-form-persist](#react-hook-form-persist)
  - [📖 Table of Contents](#-table-of-contents)
  - [⚙️ Install](#️-install)
  - [📖 Usage](#-usage)
    - [Additional examples](#additional-examples)
    - [Conditional persistence](#conditional-persistence)
    - [Selecting fields](#selecting-fields)
    - [Custom serialization](#custom-serialization)
    - [Handling unavailable storage](#handling-unavailable-storage)
  - [📚 API](#-api)
  - [💬 Contributing](#-contributing)
  - [🪪 License](#-license)

## ⚙️ Install

Install the package locally within you project folder with your package manager:

With `npm`:
```sh
npm install react-hook-form-persist
```

With `yarn`:
```sh
yarn add react-hook-form-persist
```

With `pnpm`:
```sh
pnpm add react-hook-form-persist
```

## 📖 Usage

```jsx
import React from "react";
import ReactDOM from "react-dom";
import { useForm } from "react-hook-form";

import useFormPersist from 'react-hook-form-persist'

function App() {
  const { register, handleSubmit, watch, errors, setValue } = useForm();

  useFormPersist("storageKey", {
    watch, 
    setValue,
    storage: window.localStorage, // default window.sessionStorage
    exclude: ['baz']
  });

  const onSubmit = data => {
    console.log(data);
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <label>foo:
        <input name="foo" ref={register} />
      </label>

      <label>bar (required):
        <input name="bar" ref={register({ required: true })} />
      </label>
      {errors.required && <span>This field is required</span>}

      <label>baz (excluded):
        <input name="baz" ref={register} />
      </label>

      <input type="submit" />
    </form>
  );
}

const rootElement = document.getElementById("root");
ReactDOM.render(<App />, rootElement);

```

### Additional examples

Persist all form fields:

```js
useFormPersist('form', {watch, setValue});
```

Persist all form fields except password:

```js
useFormPersist('form', {watch, setValue, exclude: ['password']});
```

### Conditional persistence

Call the hook unconditionally and pass `null` as the key to disable persistence:

```js
const { watch, setValue } = useForm();
const { clear } = useFormPersist(persistKey ?? null, { watch, setValue });
```

Only `null` disables the hook. All string keys, including `''`, remain valid.
The hook always returns `{ clear }`; `clear()` does nothing while disabled.
While disabled, the hook does not call `watch`, access storage, invoke codecs,
restore values, or run `onDataRestored`/`onTimeout`/`onStorageError`. Existing stored data and
current form values are left intact, and edits are not persisted.

Changing from `null` to a string reads that key's latest stored data using the
current configuration, just like changing an enabled key. This also applies
when re-enabling the same key: stored values can replace edits made while
disabled. If no entry exists, the current selected values are saved. Expiration
is checked when re-enabled; disabling does not pause the entry's age. Expired
data is removed without immediately replacing it with unchanged form values.

An empty `include` list only selects no fields; it still reads storage and
handles expiration. Use a `null` key when persistence should be fully disabled.
Enabling persistence retains the normal codec and storage error behavior below.
An explicitly supplied `storage: window.localStorage` expression is evaluated
by your component before the hook is called, even when its key is `null`.

### Selecting fields

Persist only selected fields with the optional `include` allowlist:

```js
useFormPersist('form', {watch, setValue, include: ['email']});
```

- Omit `include` to persist all fields except those in `exclude`.
- Both options match exact top-level keys in the form values. Including `profile`
  persists its whole nested object; `profile.email` does not select a nested path.
- `exclude` takes precedence when a field appears in both lists.
- `include: []` selects no fields. No fields are restored or written, and
  `onDataRestored` receives `{}` when an unexpired stored entry is read.
- Selection applies after deserialization, before `setValue` and `onDataRestored`,
  and before serialization. `_timestamp` remains reserved expiration metadata;
  including or excluding it does not make it a form field or disable expiration.

Changing either list alone saves the currently selected form values; it does not
reload old values from storage or reset fields in the form. Equal-content inline
arrays are safe. Remounting, or changing the storage key, storage, deserializer,
`onDataRestored`, or `setValue` reference, reads stored data using the current
selection. Keep callbacks and any `setValue` wrapper stable (for example with
`useCallback`); changing a restoration dependency while widening the selection
can restore older stored values over current edits.

When no current fields are selected, the hook skips writing and leaves any stored
entry intact. Field selection is not a storage cleanup mechanism: old data may
remain, and a later mount with a wider selection can restore it. Call the returned
`clear()` to remove an entry explicitly. Expired entries are still removed even
when `include` is empty. A nonempty write replaces the entry with the selected
values, as with `exclude` alone.

### Custom serialization

Storage contains strings. By default, the hook uses `JSON.stringify` to save
values and `JSON.parse` to restore them. Pass `serialize` and `deserialize` to
support values such as `Date`, `BigInt`, or objects from a date library.

For a form whose `birthday` field is a `Date` and `visits` field is a `BigInt`:

```js
// Define codecs outside the component to keep their references stable.
const serialize = (data) => JSON.stringify({
  ...data,
  birthday: data.birthday.toISOString(),
  visits: data.visits.toString()
});

const deserialize = (serialized) => {
  const data = JSON.parse(serialized);
  return {
    ...data,
    birthday: new Date(data.birthday),
    visits: BigInt(data.visits)
  };
};

useFormPersist('form', { watch, setValue, serialize, deserialize });
```

Both callbacks are optional and synchronous. `serialize` receives a record of
form values after `include` and `exclude` have been applied and must return a string.
`deserialize` receives the stored string and must return a record of restored
values. Field selection also applies to the returned record, so previously stored
unselected or excluded fields are not restored. Only provide a callback if you need to change
its corresponding JSON default.

When `timeout` is configured, the hook adds a reserved `_timestamp` property to
the record before serialization. Preserve that property in both codecs, as the
example does with `...data`, so expiration still works. `_timestamp` is removed
before calling `setValue` or `onDataRestored`; do not use it as a form field.

Expired entries are removed without replacing them with unchanged defaults on
mount or subsequent renders. Changes to selected form values resume saving,
as do changes to the storage key, storage, serializer, timeout, or field selection.

Keep codec references stable, for example by defining them outside the component
or using `useCallback`. Changing `deserialize` causes stored data to be restored
again; changing `serialize` saves current values with the new serializer. A
deserializer that creates new objects on every render can otherwise cause
repeated restoration.

By default, codec errors, malformed JSON, and storage errors propagate from the hook's
effects to React. The hook does not silently discard invalid data or fall back
to defaults. Use an error boundary if you need to handle these errors, and
validate stored data in your deserializer when your format requires it.

### Handling unavailable storage

Browsers can deny access to storage, including the `window.sessionStorage`
property itself, for example in restricted cross-origin frames. Storage writes
can also fail when a quota is reached. To keep the form usable when persistence
fails, opt in with `onStorageError`:

```js
useFormPersist('form', {
  watch,
  setValue,
  onStorageError: (error) => {
    console.warn('Form changes are no longer being saved', error);
  }
});
```

Without this callback, storage errors still throw. With it, the first storage
error suspends persistence for this hook's current activation **before** calling
`onStorageError(error)` with the original thrown value. An activation is one
continuous enabled period with the same key and `storage` reference. Suspension:

- Leaves current form values intact and stops further storage access, reads,
  writes, expiry cleanup, and `clear()` calls for that activation.
- Does not treat a failed read as an empty entry, overwrite unread data with
  defaults, delete data to recover, or use an in-memory fallback. Previously
  saved data may remain; a failed removal does not mean an entry was cleared.
- Does not retry on edits, rerenders, or changes to callbacks, codecs, field
  selection, or timeout. Changing or removing `onStorageError` alone does not
  resume a suspended activation.
- Starts fresh when the key or `storage` reference changes, after a `null` key
  is re-enabled, or on a real remount. These transitions restore the latest
  stored values first, which can replace edits made while saving was suspended.
- Is local to each hook instance and survives development StrictMode effect
  replay. Keep a custom storage object's reference stable.

The handler is synchronous and is not awaited. A handler that throws propagates
its error. Only errors from obtaining the default storage or calling storage's
`getItem`, `setItem`, and `removeItem` are handled. Malformed JSON, codec errors,
and errors in `watch`, `setValue`, `onDataRestored`, or `onTimeout` still propagate.
When storage works, restoration, field selection and expiration behave as usual.
For expiry, `onTimeout` runs before removal; a failed removal then suspends
persistence and reports the error without restoring or rewriting expired data.
`clear()` uses the same policy: it throws by default, or reports and suspends
when a handler is provided. The hook cannot undo side effects performed by a
custom storage implementation before it throws.

An expression such as `storage: window.localStorage` runs in your component,
before the hook can handle errors, even when its key is `null`. To defer that
getter until the hook's guarded operations, supply a stable lazy adapter and
the error handler. This TypeScript example implements the existing `Storage`
interface; it deliberately lets errors reach the hook instead of returning a
misleading `null` on failure:

```tsx
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import useFormPersist from 'react-hook-form-persist';

function createLazyLocalStorage(): Storage {
  return {
    get length() { return window.localStorage.length; },
    key: (index) => window.localStorage.key(index),
    clear: () => window.localStorage.clear(),
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
    removeItem: (key) => window.localStorage.removeItem(key)
  };
}

function Form() {
  const { watch, setValue } = useForm();
  const [storage] = useState(createLazyLocalStorage);
  useFormPersist('form', {
    watch,
    setValue,
    storage,
    onStorageError: (error) => console.warn('Saving is unavailable', error)
  });
  // Render your fields here.
  return null;
}
```

The hook only calls the adapter's `getItem`, `setItem`, and `removeItem` methods.
Creating this adapter does not read browser storage and does not create a shared
fallback cache. Each form owns its adapter and its suspension state.

## 📚 API

For all configuration options, please see the [API docs](https://paka.dev/npm/react-hook-form-persist).

## 💬 Contributing

Got an idea for a new feature? Found a bug? Contributions are welcome! Please [open up an issue](https://github.com/tiaanduplessis/feature-flip/issues) or [make a pull request](https://makeapullrequest.com/).

### Development

Use a supported Node.js LTS release: Node 22.22.2+ or Node 24.15.0+
(`.nvmrc` selects Node 24), and pnpm 7.33.7 as pinned in `package.json`.
These requirements apply to development tools; the library still builds CJS,
ESM, and declarations with the existing Node 16 output target and peer ranges.

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm run test --run
pnpm coverage
pnpm lint
pnpm types:check
pnpm build
```

The test runner, DOM environment, and coverage provider are pinned in the
lockfile. The coverage command runs entirely from installed dependencies and
does not download a provider on demand. The scoped `tsup>esbuild` override
keeps the build tool on a version patched for
[GHSA-g7r4-m6w7-qqqr](https://github.com/evanw/esbuild/security/advisories/GHSA-g7r4-m6w7-qqqr).

## 🪪 License

[MIT © Tiaan du Plessis](./LICENSE)
    
