****<div align="center">
  <h1 hidden>yeet</h1>
  <!--<img alt="yeet" src="https://raw.githubusercontent.com/abskmj/hukum/HEAD/.images/terminal.gif">-->
  <!--https://raw.githubusercontent.com/tornqvist/yeet/1.0.0-rc.1/.images/terminal.gif-->
  <p>Teeny-weeny front end framework </p>
  <!-- Stability -->
  <a href="https://nodejs.org/api/documentation.html#documentation_stability_index">
    <img src="https://img.shields.io/badge/stability-experimental-orange.svg?style=flat-square"
      alt="API stability" />
  </a>
  <!-- NPM version -->
  <a href="https://npmjs.org/package/yeet">
    <img src="https://img.shields.io/npm/v/yeet.svg?style=flat-square"
      alt="NPM version" />
  </a>
  <!-- Build Status -->
  <a href="https://github.com/tornqvist/yeet/actions">
    <img src="https://img.shields.io/github/workflow/status/tornqvist/yeet/CI?style=flat-square"
      alt="Build Status" />
  </a>
  <!-- Size -->
  <a href="https://npmjs.org/package/yeet">
    <img src="https://img.shields.io/bundlephobia/minzip/yeet?label=size&style=flat-square">
  </a>
  <!-- Downloads -->
  <a href="https://npmjs.org/package/yeet">
    <img src="https://img.shields.io/npm/dt/yeet?style=flat-square"
      alt="Download" />
  </a>
  <!-- Standard -->
  <a href="https://standardjs.com">
    <img src="https://img.shields.io/badge/code%20style-standard-brightgreen.svg?style=flat-square"
      alt="Standard" />
  </a>
  <hr>
</div>

## Features
- **No transpilation** – it's all plain vanilla JavaScript
- **Small size** – Weighing in at `3kb`, you'll barely notice it
- **Minimal API** – Only a handfull functions to learn
- **No magic** – Prototypal state and events
- **It's fast** – Both on server and client

## Example
```js
import { html, mount, use, Component } from 'https://cdn.skypack.dev/yeet'

mount(Component(App), 'body')

function App (state, emit) {
  use(store)

  return function () {
    return html`
      <body>
        <p>Clicked ${state.count} times</p>
        <button onclick=${() => emit('increment'))}>Click me</button>
      </body>
    `
  }
}

function store (state, emitter) {
  state.count = 0
  emitter.on('increment', function () {
    state.count++
    emitter.emit('render')
  })
}
```

## Why yeet?
Building interactive and performant websites shouldn't require a whole lot of
dependencies, a bundler, or even Node.js for that matter. The JavaScript
language has all the capabilities required built right in, without sacrificing
either developer or user experience.

Frameworks are tools and tools should be interchangeable and easy to replace.
That's why yeet rely on the lowest common denominator – the DOM. There are no
unneccessary abstractions such as virtual DOM, synthetic events or template
syntax to learn. Only functions and prototypes.

If you know JavaScript you already know most there is to know about yeet. And
anything new you learn from using yeet is directly benefitial to anything else
you might want to use JavaScript for.

## Prototypal state
The state object in yeet is shared between components using prototypes. You can
think of the state object as a shared context which components can use to read
from and write to.

However, a component can only ever mutate it's own state, it can only read from
the parent state, yet they are the same object – what?! This is achieved using
prototypes. The prototype of a component's state object is the parent
component's state object.

<details>
<summary>About prototypal inheritance</summary>

JavaScript prototypes are the mechanism for inheriting properties and behavior
from one object to another. What is facinating about prototypes are that they
are live – meaning that any change made to an object is immediately made
available to all other objects whose prototype chain includes said object.

```js
const parent = {}
const child = Object.create(parent)

parent.name = 'world'
console.log(`Hello ${parent.name}`) // Hello world
console.log(`Hello ${child.name}`) // Hello world

child.name = 'planet'
console.log(`Hello ${parent.name}`) // Hello world
console.log(`Hello ${child.name}`) // Hello planet
```

Read more about [Object prototypes][Object prototypes].

</details>

To modify a parent state object, one can use events to communicate up the
component tree (or prototype chain, if you will).

## Events
Events are the core mechanism for communication up the component tree. Yeet
adhers to the dogma "data down, events up", which is to say that data should be
passed down the component tree, either with state or as arguments. When
something happens, e.g. the user clicks a button, an event should be emitted
which bubbles up the component tree, notifying components which may then mutate
their state and issue a re-render.

## Components
Components can be usefull in situations when you need a locally contained state,
want to use some third party library which or want to know when components mount
or unmout in the DOM.

Components in yeet use [generator functions][generator functions] to control the
component lifecycle. By using generators yeet can step through your component
and pause execution until the appropiate time, e.g. when the component has
updated or is removed from the DOM. This allows you to retain local variables
which persist throughout the component lifespan without meddling with `this` or
learning new state management techinques, they're just regular ol' variables.

```js
import { html, ref, mount, Component } from 'https://cdn.skypack.dev/yeet'
import mapboxgl from 'https://cdn.skypack.dev/mapbox-gl'

const state = { center: [18.0704503, 59.3244897] }

mount(Component(Map), '#app', state)

function * Map (state, emit) {
  const container = ref()
  let map

  yield function * () {
    yield html`<div id="app" ref=${container}></div>`

    map = map || new mapboxgl.Map({
      container: container.current,
      center: state.center
    })
  }

  map.destroy()
}
```

### Generators
Using generators allows you to keep local variables accessible throughout the
component lifecycle. If you are already familiar with generators there's not
really that much to learn.

If you are new to generators, learning yeet will only further build your
JavaScript toolset, there is nothing here which you cannot use in other
contexts.

A generator function is a special kind of function which can pause execution
midway and allows us to inspect intermediate values before procceding with
execution. A generator function has two caracteristics which set it appart from
regular functions, and asterics (`*`) after the `function` keyword and the
`yield` keyword.

<details>
<summary>The anatomy of a generator function</summary>

```js
//       ↓ This thing makes it a generator function
function * createGenerator (list) {
  for (const num of list) {
    yield num // ← Pause here
  }
  return 'finished!'
}

//                ↓ Call it like any other function
const generator = createGenerator([1, 2, 3])

// We can now step through the generator
generator.next() // { value: 1, done: false }
generator.next() // { value: 2, done: false }
generator.next() // { value: 3, done: false }
generator.next() // { value: 'finished!', done: true }
```

</details>

By yielding in a yeet component you are telling yeet to halt execution and save
the rest of the function for later, e.g. when the component has updated or when
it is removed from the DOM. A yeet component's lifecycle is thereby clearly laid
out in chronological order, from top to bottom.

```js
function * Caffeine (state, emit) {
  // ↓ Setup variables (only happens once per component lifetime)

  let timeout
  let seconds = 5

  function reset () {
    seconds = 5
    emit('render')
  }

  // ↓ Provide yeet with the component render function
  yield function * () {
    // ↓ Tell yeet to render this before continuing
    yield html`
      <p>${seconds
        ? `Click the button within ${seconds} seconds.`
        : 'Did you fall asleep?'}</p>
      <button onclick=${reset}>I'm awake!</button>
    `

    // ↓ Continue once the component has mounted/updated
    if (seconds) {
      timeout = setTimeout(function () {
        seconds--
        emit('render')
      }, 1000)
    }
  }

  // ↓ Continue when removed from the DOM (only happens once)
  clearTimeout(timeout)
}
```

#### Lifecycle
Generators are used to declare the lifecycle of yeet components. Only functions
and html partials (returned by the `html` and `svg` tags) carry any special
meaning when using `yield` (with the exception of promises during SSR). When a
yeet component yields a function, that is the function which will be used for any
consecutive re-renders. Anything that comes after `yield` will be executed once
the components is removed from the DOM (e.g. replaced by another element).

```js
function MyComponent () {
  // Happens only once, during setup
  yield function () {
    // Happens every time the component updates
  }
  // Happens only once, when the component is removed/replaced
}
```

They yielded function may also be a generator function. This can be used to
perform side effects such as setting up subscriptions, manually changing the DOM
or initializing some third party library. This is handled asynchrounous, meaning
the DOM will have updated and the changes may have been made visible to the user
before the generator finishes.

```js
function MyComponent () {
  return function * () {
    // Happens before every update
    yield html`<h1>Hello planet!</h1>`
    // Happens after every update
  }
}
```

If you require immediate access to the rendered element, e.g. to synchronously
mutate or inspect the rendered element _before_ the page updates, you may yield
yet another function. _Note: Use with causion, this may have a negative impact
on performance._

```js
function MyComponent () {
  return function () {
    return function * () {
      // Happens before every update
      yield html`<h1>Hello planet!</h1>`
      // Happens SYNCHRONOUSLY after every update
    }
  }
}
```

#### Arguments (a.k.a. `props`)
Even though all components have access to the shared state, you'll probably need
to supply your components with some arguments to configure behavior or forward
particular properties. You can either provide extra arguments to the `Component`
function or you can call the function returned by `Component` with any number of
arguments.

```js
function Reaction (state, emit) {
  // ↓ Arguments are provided to the inner function
  return function ({ emoji }) {
    return html`<button onclick=${() => emit('reaction', emoji)}>${emoji}</button>`
  }
}

// ↓ Declare component on beforehand
const ReactionComponent = Component(Reaction)

// ↓ Declare component and arguments on beforehand
const SadReaction = Component(Reaction, { emoji: '😢' })

html`
  <form>
    ${Component(Reaction, { emoji: '😀' })} <!-- ← Declare component inline -->
    ${ReactionComponent({ emoji: '😐' })}
    ${SadReaction}
  </form>
`
```

#### Lists and Keys
In most situations yeet does an excellent job at keeping track of which
component goes where. This is in part handled by identifying which template tags
(the `html` and `svg` tag functions) that are used. Template litterals are
unique and yeet leverage this to keep track of which template tag goes where.

When it comes to components, yeet use your component function as a unique key to
keep track of which compontent is tied to which element in the DOM.

When it comes to lists of identical components, this becomes difficult and yeet
needs a helping hand in keeping track. In these situations, you can provide a
unique key to each component which will be used to make sure that everything
keeps running smoothly.

```js
function Exponential (state, emit) {
  let exponent = 1

  function increment () {
    exponent++
    emit('render')
  }

  return function ({ num }) {
    return html`
      <li>
        <button onclick=${increment}>${Math.pow(num, exponent)}</button>
      </li>
    `
  }
}

const numbers = [1, 2, 3, 4, 5]
return html`
  <ol>
    ${numbers.map((num) => Component(Exponential, { num, key: num }))}
  </ol>
`
```

### Stores
Stores are the mechanism for sharing behavior between components, or even apps.
A store can subscribe to events, mutate the local state and issue re-renders.

```js
import { html, use, Component } from 'https://cdn.skypack.dev/yeet'

function Parent (state, emit) {
  use(counter) // ← Use the counter store with this component

  return function () {
    return html`
      ${Component(Increment)}
      <output>${state.count}</output>
      ${Component(Decrement)}
    `
  }
}

function Increment (state, emit) {
  return html`<button onclick=${() => emit('increment')}>+</button>`
}

function Decrement (state, emit) {
  return html`<button onclick=${() => emit('decrement')}>-</button>`
}

function counter (state, emitter) {
  state.count = 0 // ← Define some initial state

  emitter.on('increment', function () {
    state.count++
    emitter.emit('render')
  })

  emitter.on('decrement', function () {
    state.count--
    emitter.emit('render')
  })
}
```

#### Events
How you choose to name your events is entirely up to you. There's only one
exception: the `render` event has special meaning and will re-render the closest
component in the component tree. The `render` event does not bubble.

## Server rendering (SSR)
Yeet has first class support for server rendering. Server rendering is dependent
on the `stream` module and therefore only works in Node.js, at the moment. There
are plans to support server rendered templates, meaning any backend could render
the actual HTML and yeet would wire up functionality using the pre-existing
markup.

### Node.js
Rendering on the server supports fully asynchronous components. Whereas
components can `yield` anything, on the client only functions and html partials
(prduced by the `html` and `svg` tags) carry any special meaning, anything else
yeet just ignores. However, on the server you may yield promises which yeet will
resolve while rendering.

```js
import { html, use } from 'yeet'

function User (state, emit) {
  const get = use(api) // ←
  return function () {
    //           ↓ Expose the promise to yeet during server render
    const user = yield get(`/users/${state.user.id}`)
    return html`<h1>${user ? user.name : 'Loading…'}</h1>`
  }
}

function api (state, emit) {
  if (!state.cache) state.cache = {} // ← Use existing cache if available

  //     ↓ Return a function for lazyily reading from the cache
  return function (url) {
    if (url in state.cache) return state.cache[url] // ← Read from cache

    const promise = fetchData(url).then(function (data) {
      state.cache[url] = data // ← Store response in cache
      emitter.emit('render') // ← Re-render with response in cache
      return data // ← Return repsonse for server side rendering
    })

    // Only expose the promise while server side rendering
    return typeof window === 'undefined' ? null : promise
  }
}
```

### Server rendered templates (non-Node.js)
_Coming soon…_

## API
The API is intentionally small.

### html

### svg

### raw

### ref

### use

### mount

### render

### renderToStream

### Component

### EventEmitter

## Attribution
There wouldn't be a yeet if there hadn't been a [choo][choo]. Yeet borrows a lot
of the core concepts such as a shared state and event emitter from choo. The
idea of yeet was born from proof of conept work done by
[Renée Kooi][goto-bus-stop].

## TODO
[ ] Server rendered templates (non-Node.js)

[choo]: https://github.com/choojs/choo
[goto-bus-stop]: https://github.com/goto-bus-stop
[Object prototypes]: https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Objects/Object_prototypes
[generator functions]: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/function*
