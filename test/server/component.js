import { suite } from 'uvu'
import * as assert from 'uvu/assert'
import { html, Partial, Component, use, mount } from '../../server.js'

const api = suite('api')

api('extends partial', function () {
  const MyComponent = Component(Function.prototype)
  assert.type(MyComponent, 'function')
  assert.instance(MyComponent(), Partial)
})

api('is iterable', async function () {
  const MyComponent = Component(() => html`<div>Hello world!</div>`)
  let string = ''
  for await (const chunk of MyComponent()) {
    string += chunk
  }
  assert.is(string, '<div>Hello world!</div>')
})

api('can render to promise', async function () {
  const MyComponent = Component(() => html`<div>Hello world!</div>`)
  const promise = MyComponent().render()
  assert.instance(promise, Promise, 'is promise')
  assert.is(await promise, '<div>Hello world!</div>')
})

api('can render to stream', async function () {
  const MyComponent = Component(() => html`<div>Hello world!</div>`)
  const stream = MyComponent().renderToStream()
  const string = await new Promise(function (resolve, reject) {
    let string = ''
    stream.on('data', function (chunk) {
      string += chunk
    })
    stream.on('end', function () {
      resolve(string)
    })
    stream.on('end', reject)
  })
  assert.is(string, '<div>Hello world!</div>')
})

api('can mount', async function () {
  const res = mount(Component(Main), 'body')
  assert.is(res.selector, 'body')
  assert.is(await res.render(), '<body>Hello world!</body>')

  function Main (state, emit) {
    return html`<body>Hello world!</body>`
  }
})

const lifecycle = suite('lifecycle')

lifecycle('stops at yield', async function () {
  const MyComponent = Component(Main)
  const res = html`
    <div>
      ${MyComponent({ test: 'test' })}
    </div>
  `
  assert.snapshot(dedent(await res.render()), dedent`
    <div>
      <span>
        Hello world!
      </span>
    </div>
  `)

  function * Main (state, emit) {
    assert.type(state, 'object')
    assert.type(emit, 'function')

    yield function * (props) {
      assert.is(props.test, 'test')

      yield function * () {
        yield html`
          <span>
            Hello world!
          </span>
        `
        assert.unreachable()
      }
      assert.unreachable()
    }
    assert.unreachable()
  }
})

lifecycle('await yielded promises', async function () {
  const res = html`<div>${Component(Main)}</div>`
  assert.is(await res.render(), '<div>Hello world!</div>')

  function Main (state, emit) {
    return function * (props) {
      const value = yield Promise.resolve('world')
      assert.is(value, 'world')
      return `Hello ${value}!`
    }
  }
})

const render = suite('render')

render('return just child', async function () {
  const Main = Component(function () {
    return Component(function () {
      return html`<div>Hello world!</div>`
    })
  })
  assert.is(await Main().render(), '<div>Hello world!</div>')
})

render('nested component', async function () {
  const Main = Component(function Main (state, emit) {
    return html`
      <span>
        Hello ${Component(Child, { test: 'fest' })}!
      </span>
    `
  })

  const res = html`
    <div>
      ${Main({ test: 'test' })}
    </div>
  `
  assert.snapshot(dedent(await res.render()), dedent`
    <div>
      <span>
        Hello world!
      </span>
    </div>
  `)

  function Child (state, emit) {
    assert.type(state, 'object')
    assert.type(emit, 'function')
    return function (props) {
      assert.is(props.test, 'fest')
      return 'world'
    }
  }
})

const state = suite('state')

state('is mutable by top level component', async function () {
  const initialState = {}
  const Mutator = Component(function (state, emit) {
    assert.is(state, initialState)
    state.test = 'test'
  })
  await Mutator().render(initialState)
  assert.equal(initialState, { test: 'test' })
})

state('is not mutable by nested component', async function () {
  const initialState = {}
  const Mutator = Component(function (state, emit) {
    assert.is.not(state, initialState)
    state.test = 'test'
  })
  await html`<div>${Mutator()}</div>`.render(initialState)
  assert.equal(initialState, {})
})

state('is inherited from parent', async function () {
  const initialState = { test: 'test' }
  const MainComponent = Component(Main)
  const res = MainComponent()
  assert.is(await res.render(initialState), '<div>Hello world!</div>')
  assert.is(initialState.child, undefined)

  function Main (state, emit) {
    return html`<div>Hello ${[ChildA, ChildB].map(Component)}</div>`
  }

  function ChildA (state, emit) {
    state.child = 'a'
    assert.is.not(state, initialState, 'is not parent state')
    assert.is(Object.getPrototypeOf(state), initialState, 'child innherit from parent')
    assert.is(state.child, 'a', 'can modify local state')
    assert.is(state.test, 'test', 'can read from parent state')
    return 'world'
  }

  function ChildB (state, emit) {
    assert.is(state.child, undefined)
    assert.is(state.test, 'test')
    return '!'
  }
})

const stores = suite('stores')

stores('arugments and return', async function () {
  const MainComponent = Component(Main)
  const res = MainComponent()
  await res.render()

  function Main (state, emit) {
    const res = use(function (_state, emitter) {
      assert.is(state, _state, 'store got component state')
      assert.type(emitter, 'object')
      return 'test'
    })
    assert.is(res, 'test')
  }
})

stores('emitter', async function () {
  let queue = 3
  const MainComponent = Component(Main)
  const res = MainComponent()
  await res.render()
  assert.is(queue, 0, 'all events triggered')

  function Main (state, emit) {
    use(function (state, emitter) {
      emitter.on('*', function (event, value) {
        assert.is(event, 'test', 'got event name')
        assert.is(value, 'test', 'got arguments')
        queue--
      })

      emitter.on('test', assert.unreachable)
      emitter.removeListener('test', assert.unreachable)

      let count = 0
      emitter.once('test', function (event, value) {
        assert.is(++count, 1, 'once is only triggered once')
        queue--
      })

      emitter.on('test', function (value) {
        assert.is(value, 'test', 'got arguments')
        queue--
      })
    })

    return function () {
      emit('test', 'test')
    }
  }
})

stores('events bubble', async function () {
  let queue = 2
  const MainComponent = Component(Main)
  const res = MainComponent()
  await res.render()
  assert.is(queue, 0, 'all events triggered')

  function Main (state, emit) {
    use(function (state, emitter) {
      emitter.on('child', function () {
        queue--
      })
    })

    return function (props) {
      return Component(Name)
    }
  }

  function Name (state, emit) {
    use(function (state, emitter) {
      emitter.on('child', function () {
        queue--
      })
    })
    emit('child', 'child')
  }
})

api.run()
lifecycle.run()
render.run()
state.run()
stores.run()

function dedent (string) {
  if (Array.isArray(string)) string = string.join('')
  return string.replace(/\n\s+/g, '\n').trim()
}
