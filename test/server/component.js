import { suite } from 'uvu'
import * as assert from 'uvu/assert'
import { html, Partial, Component, use, mount, render, renderToStream } from '../../server.js'

const api = suite('api')
const lifecycle = suite('lifecycle')
const rendering = suite('rendering')
const state = suite('state')
const stores = suite('stores')

api('extends partial', function () {
  const MyComponent = Component(Function.prototype)
  assert.type(MyComponent, 'function')
  assert.instance(MyComponent(), Partial)
})

api('can render to promise', async function () {
  const MyComponent = Component(() => html`<div>Hello world!</div>`)
  const promise = render(MyComponent)
  assert.instance(promise, Promise, 'is promise')
  assert.is(await promise, '<div>Hello world!</div>')
})

api('can render to stream', async function () {
  const MyComponent = Component(() => html`<div>Hello world!</div>`)
  const stream = renderToStream(MyComponent)
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
  assert.is(await render(res), '<body>Hello world!</body>')

  function Main (state, emit) {
    return html`<body>Hello world!</body>`
  }
})

lifecycle('stops at yield', async function () {
  const MyComponent = Component(Main)
  const res = html`
    <div>
      ${MyComponent({ test: 'test' })}
    </div>
  `
  assert.snapshot(dedent(await render(res)), dedent`
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
  assert.is(await render(res), '<div>Hello world!</div>')

  function Main (state, emit) {
    return function * (props) {
      const value = yield Promise.resolve('world')
      assert.is(value, 'world')
      return `Hello ${value}!`
    }
  }
})

rendering('return just child', async function () {
  const Main = Component(function () {
    return Component(function () {
      return html`<div>Hello world!</div>`
    })
  })
  assert.is(await render(Main), '<div>Hello world!</div>')
})

rendering('nested component', async function () {
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
  assert.snapshot(dedent(await render(res)), dedent`
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

state('is mutable by top level component', async function () {
  const initialState = {}
  const Mutator = Component(function (state, emit) {
    assert.is(state, initialState)
    state.test = 'test'
  })
  await render(Mutator, initialState)
  assert.equal(initialState, { test: 'test' })
})

state('is not mutable by nested component', async function () {
  const initialState = {}
  const Mutator = Component(function (state, emit) {
    assert.is.not(state, initialState)
    state.test = 'test'
  })
  await render(html`<div>${Mutator}</div>`, initialState)
  assert.equal(initialState, {})
})

state('is inherited from parent', async function () {
  const initialState = { test: 'test' }
  const MainComponent = Component(Main)
  assert.is(await render(MainComponent, initialState), '<div>Hello world!</div>')
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

stores('arguments and return', async function () {
  const MainComponent = Component(Main)
  await render(MainComponent)

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
  let queue = 2
  const MainComponent = Component(Main)
  await render(MainComponent)
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
  await render(MainComponent)
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
rendering.run()
state.run()
stores.run()

function dedent (string) {
  if (Array.isArray(string)) string = string.join('')
  return string.replace(/\n\s+/g, '\n').trim()
}
