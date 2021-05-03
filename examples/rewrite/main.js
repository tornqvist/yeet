import './style.css'
import { html, render, mount, Component } from './lib.js'

const target = document.getElementById('app')

main('world')

const world = render(html`<button onclick=${() => main('world')}>world</button>`)
const planet = render(html`<button onclick=${() => main('planet')}>planet</button>`)
const none = render(html`<button onclick=${() => main(null)}>null</button>`)

document.body.append(world, planet, none)

function main (name) {
  mount(target, html`
    <div id="app">
      ${new Component(Greeting, name)}
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
        <summary>Hello ${name}</summary>
        <p>Lorem ipsum dolor sit amet</p>
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
