
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
    - [Custom serialization](#custom-serialization)
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
form values after `exclude` has been applied and must return a string.
`deserialize` receives the stored string and must return a record of restored
values. Exclusions also apply to the returned record, so previously stored
excluded fields are not restored. Only provide a callback if you need to change
its corresponding JSON default.

When `timeout` is configured, the hook adds a reserved `_timestamp` property to
the record before serialization. Preserve that property in both codecs, as the
example does with `...data`, so expiration still works. `_timestamp` is removed
before calling `setValue` or `onDataRestored`; do not use it as a form field.

Keep codec references stable, for example by defining them outside the component
or using `useCallback`. Changing `deserialize` causes stored data to be restored
again; changing `serialize` saves current values with the new serializer. A
deserializer that creates new objects on every render can otherwise cause
repeated restoration.

Codec errors, malformed JSON, and storage errors propagate from the hook's
effects to React. The hook does not silently discard invalid data or fall back
to defaults. Use an error boundary if you need to handle these errors, and
validate stored data in your deserializer when your format requires it.
## 📚 API

For all configuration options, please see the [API docs](https://paka.dev/npm/react-hook-form-persist).

## 💬 Contributing

Got an idea for a new feature? Found a bug? Contributions are welcome! Please [open up an issue](https://github.com/tiaanduplessis/feature-flip/issues) or [make a pull request](https://makeapullrequest.com/).

## 🪪 License

[MIT © Tiaan du Plessis](./LICENSE)
    
