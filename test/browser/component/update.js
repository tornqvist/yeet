import { suite } from 'uvu'
import * as assert from 'uvu/assert'
import { html, mount, render, use, Component, Lazy } from '../../../index.js'

const element = suite('element')
const rerender = suite('rerender')

element('does not update when shallow', function () {
  let name = 'planet'
  const el = document.createElement('h1')
  const Main = Component(() => html`<h1>Hello ${name}!</h1>`)

  mount(Main, el)
  assert.is(el.outerHTML, '<h1>Hello planet!</h1>')

  name = 'world'
  mount(Main, el)
  assert.is(el.outerHTML, '<h1>Hello planet!</h1>')
})

element('does update if update function provided', function () {
  window.debugger = true
  const el = document.createElement('h1')
  const Main = Component(() => (name) => html`<h1>Hello ${name}!</h1>`)

  mount(Main('planet'), el)
  assert.is(el.outerHTML, '<h1>Hello planet!</h1>')
  const [hello, planet, exlamation] = el.childNodes

  mount(Main('world'), el)
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

rerender('Lazy', async function () {
  let done
  const promise = new Promise(function (resolve) {
    done = resolve
  })
  const res = render(html`<div>Hello ${Lazy(promise, 'world', 200)}!</div>`)
  assert.is(res.outerHTML, '<div>Hello !</div>')

  await new Promise((resolve) => setTimeout(resolve, 200))
  await new Promise(function (resolve) {
    window.requestAnimationFrame(function () {
      assert.is(res.outerHTML, '<div>Hello world!</div>')
      resolve()
    })
  })

  done('planet')
  await new Promise(function (resolve) {
    window.requestAnimationFrame(function () {
      assert.is(res.outerHTML, '<div>Hello planet!</div>')
      resolve()
    })
  })
})

element.run()
rerender.run()
