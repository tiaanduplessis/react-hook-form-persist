
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

Persist only the email field:

```js
useFormPersist('form', {watch, setValue, include: ['email'] });
```





## 📚 API

For all configuration options, please see the [API docs](https://paka.dev/npm/react-hook-form-persist).

## 💬 Contributing

Got an idea for a new feature? Found a bug? Contributions are welcome! Please [open up an issue](https://github.com/tiaanduplessis/feature-flip/issues) or [make a pull request](https://makeapullrequest.com/).

## 🪪 License

[MIT © Tiaan du Plessis](./LICENSE)
    
