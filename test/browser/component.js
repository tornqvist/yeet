import { suite } from 'uvu'
import * as assert from 'uvu/assert'
import { html, mount, Partial, Component } from '../../index.js'

const api = suite('api')

api('inherits partial', function () {
  assert.type(Component, 'function')
  assert.type(Component(Function.prototype), 'function')
  assert.instance(Component(Function.prototype), Partial)
})

api('arguments', function () {
  let called = false
  const initialState = {}
  const MyComponent = Component(function (state, emit) {
    assert.is(state, initialState)
    assert.type(emit, 'function')
    return function (str) {
      called = true
      assert.is(str, 'test')
    }
  })
  MyComponent('test').render(initialState)
  assert.ok(called)
})

api('can mount', function () {
  const div = document.createElement('div')
  mount(Component(Main), div)
  assert.is(div.outerHTML, '<div>Hello world!</div>')

  function Main (state, emit) {
    return html`<div>Hello world!</div>`
  }
})

const render = suite('render')

render('one-off element', function () {
  const res = Component(() => html`<h1>Hello planet!</h1>`).render()
  assert.is(res.outerHTML, '<h1>Hello planet!</h1>')
})

render('return just child', function () {
  const Main = Component(function () {
    return Component(function () {
      return html`<div>Hello world!</div>`
    })
  })
  assert.is(Main.render().outerHTML, '<div>Hello world!</div>')
})

render('nested component', function () {
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
  assert.snapshot(dedent(res.render().outerHTML), dedent`
    <div>
      <span>
        Hello world!
      </span>
    </div>
  `)

  function Child (state, emit) {
    return function (props) {
      return 'world'
    }
  }
})

api.run()
render.run()

function dedent (string) {
  if (Array.isArray(string)) string = string.join('')
  return string.replace(/\n\s+/g, '\n').trim()
}
