import './style.css'
import { html, render, mount, Component } from './lib.js'

const target = document.getElementById('app')
let rerender

main('world')

const world = render(html`<button>world</button>`)
const planet = render(html`<button>planet</button>`)
const none = render(html`<button>null</button>`)
const rerenderer = render(html`<button>Rerednder</button>`)

world.onclick = () => main('world')
planet.onclick = () => main('planet')
none.onclick = () => main(null)
rerenderer.onclick = () => rerender()

document.body.append(world, planet, none)

function main (name) {
  mount(target, html`
    <div id="app">
      ${new Component(Greeting, name)}
    </div>
  `)
}

function Greeting (ctx) {
  console.log(ctx)
  return function (name) {
    // return html`<h1>Hello ${name}</h1>`
    switch (name) {
      case 'world': // return html`<h1>Hello ${name}</h1>`
      case 'planet': return new Component(Child, name)
      default: return html`<p>Nothing here</p>`
    }
  }
}

function Child () {
  return function (name) {
    return html`<h1>Hello ${name}</h1>`
  }
}
