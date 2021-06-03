import './style.css'
import * as assert from 'uvu/assert'
import { html, svg, render, mount, Component, use } from './lib.js'

const target = document.getElementById('app')

// main('world')

const el = document.createElement('h1')
document.body.append(el)
const Main = Component(() => (name) => html`<h1>Hello ${name}!</h1>`)

mount(el, Main('planet'))
assert.is(el.outerHTML, '<h1>Hello planet!</h1>')
const [hello, planet, exlamation] = el.childNodes

mount(el, Main('world'))
assert.is(el.outerHTML, '<h1>Hello world!</h1>')
assert.ok(hello.isSameNode(el.childNodes[0]))
assert.not.ok(planet.isSameNode(el.childNodes[1]))
assert.ok(exlamation.isSameNode(el.childNodes[2]))

function main (name) {
  mount(target, html`
    <div id="app">
      ${new Component(Greeting, name)}
      <!-- name is ${name} -->
      <button onclick=${() => main('world')}>world</button>
      <button onclick=${() => main('planet')}>planet</button>
      <button onclick=${() => main(null)}>null</button>
    </div>
  `)
}

function Greeting (state, emit) {
  return function (name) {
    if (!name) return html`<p>Nothing here</p>`
    return new Component(Child, name)
  }
}

function Child (state, emit) {
  let isOpen = false
  return function (name) {
    return html`
      <details open=${isOpen} ontoggle=${ontoggle}>
        <summary ${{ class: ['Foo', 'bar'] }}>Hello ${name}</summary>
        ${html`
          <p data-name="${name}">${html`Lorem ipsum dolor sit amet`}</p>
          <p>Lorem ipsum dolor sit amet</p>
          ${html`<!-- name is ${name} -->`}
          <p>${html`${['Lorem ipsum ', html`<em>dolor</em>`, ' sit amet']}`}</p>
        `}
        <svg viewBox="0 0 100 100" width="100" height="100">
          ${svg`<circle r="50" cx="50" cy="50" />`}
        </svg><br>
        <button onclick=${onclick}>Close</button>
      </details>
    `
  }

  function ontoggle () {
    isOpen = this.open
  }

  function onclick () {
    isOpen = false
    emit('render')
  }
}
