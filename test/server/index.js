import { suite } from 'uvu'
import * as assert from 'uvu/assert'
import { html, Partial, Component, use, mount } from '../../server.js'

const api = suite('api')

api('html returns partial', function () {
  const partial = html`<div>Hello world!</div>`
  assert.instance(partial, Partial)
})

api('partial is iterable', async function () {
  const partial = html`<div>Hello world!</div>`
  let string = ''
  for await (const chunk of partial) {
    string += chunk
  }
  assert.is(string, '<div>Hello world!</div>')
})

api('partial can render to promise', async function () {
  const partial = html`<div>Hello world!</div>`
  const promise = partial.render()
  assert.instance(promise, Promise, 'is promise')
  assert.is(await promise, '<div>Hello world!</div>')
})

api('partial can render to stream', async function () {
  const partial = html`<div>Hello world!</div>`
  const stream = partial.renderToStream()
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

api('mount', async function () {
  const res = mount(html`<body>Hello planet!</body>`, 'body')
  assert.instance(res, Partial)
  assert.is(res.selector, 'body')
  assert.is(await res.render(), '<body>Hello planet!</body>')
})

const render = suite('render')

render('nested partials', async function () {
  const res = html`<div>${'Hello'} ${html`<span>world!</span>`}</div>`
  assert.is(await res.render(), '<div>Hello <span>world!</span></div>')
})

render('arrays', async function () {
  const res = html`<div>${['Hello', html` `, html`<span>world!</span>`]}</div>`
  assert.is(await res.render(), '<div>Hello <span>world!</span></div>')
})

render('async attributes', async function () {
  const res = html`<div class="${Promise.resolve('test')}">Hello world!</div>`
  assert.is(await res.render(), '<div class="test">Hello world!</div>')
})

render('array attributes to space delimited strings', async function () {
  const classes = ['foo', Promise.resolve('bar')]
  const res = html`<div class="${classes}">Hello world!</div>`
  assert.is(await res.render(), '<div class="foo bar">Hello world!</div>')
})

render('spread attributes', async function () {
  const attrs = { class: 'test', id: Promise.resolve('test') }
  const data = ['data-foo', Promise.resolve('data-bar'), { 'data-bin': Promise.resolve('baz') }]
  const res = html`<div ${attrs} ${data}>Hello world!</div>`
  assert.is(await res.render(), '<div class="test" id="test" data-foo data-bar data-bin="baz">Hello world!</div>')
})

render('bool props', async function () {
  const res = html`<input type="checkbox" required=${false} disabled=${true} data-hidden=${false}>`
  assert.is(await res.render(), '<input type="checkbox" disabled="disabled" data-hidden=false>')
})

const component = suite('component')

component('can render', async function () {
  const Main = Component(function * Main (state, emit) {
    assert.type(state, 'object')
    assert.type(emit, 'function')

    yield function * (props) {
      assert.is(props.test, 'test')

      yield function * () {
        yield html`
          <span>
            Hello ${Component(Child, { test: 'fest' })}!
          </span>
        `
        assert.unreachable()
      }
      assert.unreachable()
    }
    assert.unreachable()
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

component('is provided initial state', async function () {
  const initialState = { test: 'test' }
  const res = html`<div>${Component(Main)}</div>`
  assert.is(await res.render(initialState), '<div>Hello world!</div>')

  function * Main (state, emit) {
    assert.is(state.test, 'test')
    assert.is(state, initialState)
    return 'Hello world!'
  }
})

component('inherits state from parent', async function () {
  const initialState = { test: 'test' }
  const res = html`<div>${Component(Main)}</div>`
  assert.is(await res.render(initialState), '<div>Hello world!</div>')
  assert.is(initialState.child, undefined)

  function Main (state, emit) {
    return html`Hello ${[ChildA, ChildB].map(Component)}`
  }

  function ChildA (state, emit) {
    state.child = 'a'
    assert.is(state.child, 'a')
    assert.is(state.test, 'test')
    assert.is.not(state, initialState)
    return 'world'
  }

  function ChildB (state, emit) {
    assert.is(state.child, undefined)
    assert.is(state.test, 'test')
    return '!'
  }
})

component('stores', async function () {
  let queue = 4
  const initialState = {}
  const res = html`<div>${Component(Main)}</div>`
  assert.is(await res.render(initialState), '<div>Hello <span>world</span>!</div>')
  assert.is(queue, 0, 'no pending tests')

  function Main (state, emit) {
    use(function (state, emitter) {
      assert.is(initialState, state)
      state.store = 'test'

      const events = ['test', 'child']
      emitter.on('*', function (event, value) {
        assert.is(event, value, 'event name match value')
        assert.is(event, events.shift(), 'emitter in order')
        if (!events.length) queue--
      })

      emitter.on('test', assert.unreachable)
      emitter.removeListener('test', assert.unreachable)

      let count = 0
      emitter.once('*', function (event, value) {
        assert.is(++count, 1, 'only triggered once')
        queue--
      })

      emitter.on('test', function (value) {
        assert.is(value, 'test', 'triggered by own emit')
        queue--
      })

      emitter.on('child', function (value) {
        assert.is(value, 'child', 'triggered by child emit')
        queue--
      })
    })

    return function (props) {
      emit('test', 'test')
      return html`Hello ${Component(Name)}!`
    }
  }

  function Name (state, emit) {
    assert.not(initialState === state)
    assert.is(Object.getPrototypeOf(state), initialState)

    return function () {
      emit('child', 'child')
      return html`<span>world</span>`
    }
  }
})

component('await yielded promises', async function () {
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

api.run()
render.run()
component.run()

function dedent (string) {
  if (Array.isArray(string)) string = string.join('')
  return string.replace(/\n\s+/g, '\n').trim()
}
