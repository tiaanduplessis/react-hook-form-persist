
# react-hook-form-persist
[![package version](https://img.shields.io/npm/v/react-hook-form-persist.svg?style=flat-square)](https://npmjs.org/package/react-hook-form-persist)
[![package downloads](https://img.shields.io/npm/dm/react-hook-form-persist.svg?style=flat-square)](https://npmjs.org/package/react-hook-form-persist)
[![standard-readme compliant](https://img.shields.io/badge/readme%20style-standard-brightgreen.svg?style=flat-square)](https://github.com/RichardLitt/standard-readme)
[![package license](https://img.shields.io/npm/l/react-hook-form-persist.svg?style=flat-square)](https://npmjs.org/package/react-hook-form-persist)
[![make a pull request](https://img.shields.io/badge/PRs-welcome-brightgreen.svg?style=flat-square)](http://makeapullrequest.com)

> Persist and populate [react-hook-form](https://react-hook-form.com/) form using storage of your choice

## Table of Contents

- [Usage](#usage)
- [Install](#install)
- [Contribute](#contribute)
- [License](#License)

## Usage

```js
import React from "react";
import ReactDOM from "react-dom";
import useForm from "react-hook-form"

import useFormPersist from 'react-hook-form-persist'

function App() {
  const { register, handleSubmit, watch, errors, setValue } = useForm();

  useFormPersist("foo", {watch, setValue}, {
    storage: window.localStorage, // default window.sessionStorage
    exclude: ['foo']
  });


  const onSubmit = data => {
    console.log(data);
  };


  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input name="example" defaultValue="test" ref={register} />

      <input name="exampleRequired" ref={register({ required: true })} />
      {errors.exampleRequired && <span>This field is required</span>}

      <input name="foo" defaultValue="bar" ref={register} />

      <input name="bar" defaultValue="foo" ref={register} />

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
useFormPersist('form', {watch, setValue}, { exclude: ['password'] });
```

Persist only the email field:

```js
useFormPersist('form', {watch, setValue}, { include: ['email'] });
```


## Install

This project uses [node](https://nodejs.org) and [npm](https://www.npmjs.com).

```sh
$ npm install react-hook-form-persist
$ # OR
$ yarn add react-hook-form-persist
```

## Contribute

1. Fork it and create your feature branch: `git checkout -b my-new-feature`
2. Commit your changes: `git commit -am "Add some feature"`
3. Push to the branch: `git push origin my-new-feature`
4. Submit a pull request

## License

MIT © Tiaan du Plessis
