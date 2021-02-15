import { suite } from 'uvu'
import * as assert from 'uvu/assert'
import { html, mount, Component } from '../../../index.js'

const element = suite('element')

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

element.run()
