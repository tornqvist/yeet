import { suite } from 'uvu'
import * as assert from 'uvu/assert'
import { html, mount, render, use, Component } from '../../../examples/rewrite/lib.js'

const element = suite('element')
const rerender = suite('rerender')
const fragment = suite('fragment')

element('does not update when shallow', function () {
  let name = 'planet'
  const el = document.createElement('h1')
  const Main = Component(() => html`<h1>Hello ${name}!</h1>`)

  mount(el, Main)
  assert.is(el.outerHTML, '<h1>Hello planet!</h1>')

  name = 'world'
  mount(el, Main)
  assert.is(el.outerHTML, '<h1>Hello planet!</h1>')
})

element('does update if update function provided', function () {
  const el = document.createElement('h1')
  const Main = Component(() => (name) => html`<h1>Hello ${name}!</h1>`)

  mount(el, Main('planet'))
  assert.is(el.outerHTML, '<h1>Hello planet!</h1>')
  const [hello, planet, exlamation] = el.childNodes

  mount(el, Main('world'))
  assert.is(el.outerHTML, '<h1>Hello world!</h1>')
  assert.ok(hello.isSameNode(el.childNodes[0]))
  assert.not.ok(planet.isSameNode(el.childNodes[1]))
  assert.ok(exlamation.isSameNode(el.childNodes[2]))
})

rerender('rerender on render event', async function () {
  let rerender
  let value = 'world'
  const res = render(html`<div>${Component(Main)}</div>`)
  assert.is(res.outerHTML, '<div><h1>Hello world!</h1></div>')

  value = 'planet'
  rerender()
  await new Promise(function (resolve) {
    window.requestAnimationFrame(function () {
      assert.is(res.outerHTML, '<div><h1>Hello planet!</h1></div>')
      resolve()
    })
  })

  function Main (state, emit) {
    rerender = () => emit('render')
    return function onupdate () {
      return html`<h1>Hello ${value}!</h1>`
    }
  }
})

rerender('render event does not bubble', async function () {
  let rerender
  let outer = 'foo'
  let inner = 'bar'
  const res = render(html`<div>${Component(Parent)}</div>`)
  assert.is(res.outerHTML, '<div><span>foo</span><span>bar</span></div>')

  outer = 'bin'
  inner = 'baz'
  rerender()
  await new Promise(function (resolve) {
    window.requestAnimationFrame(function () {
      assert.is(res.outerHTML, '<div><span>foo</span><span>baz</span></div>')
      resolve()
    })
  })

  function Parent (state, emit) {
    use(function (state, emitter) {
      emitter.on('render', assert.unreachable)
    })
    return function () {
      return html`<span>${outer}</span>${Component(Child)}`
    }
  }

  function Child (state, emit) {
    rerender = () => emit('render')
    return function onupdate () {
      return html`<span>${inner}</span>`
    }
  }
})

rerender('update single text node', async function () {
  let rerender
  let value = 'world'
  const res = render(html`<h1>Hello ${Component(Main)}!</h1>`)
  assert.is(res.outerHTML, '<h1>Hello world!</h1>')

  value = 'planet'
  rerender()
  await new Promise(function (resolve) {
    window.requestAnimationFrame(function () {
      assert.is(res.outerHTML, '<h1>Hello planet!</h1>')
      resolve()
    })
  })

  function Main (state, emit) {
    rerender = () => emit('render')
    return function onupdate () {
      return html`${value}`
    }
  }
})

fragment('can update fragment', function () {
  const ul = document.createElement('ul')
  mount(ul, html`<ul>${Component(Main)}</ul>`)
  assert.snapshot(ul.outerHTML, '<ul><li>1</li><li>2</li><li>3</li></ul>')

  function Child () {
    return function () {
      return html`<li>2</li>`
    }
  }

  function Main () {
    return function () {
      return html`<li>1</li>${Component(Child)}<li>3</li>`
    }
  }
})

element.run()
rerender.run()
fragment.run()
