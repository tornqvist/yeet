import { html, Component, mount, render, use } from './index.js'

document.body.innerHTML =
 '<div id="app"><h1>Hello planet!</h1><ul><li>1</li><li>2</li><li>3</li><li>4</li></ul></div>'

const Proxy = Component(function Proxy(state, emit) {
  use(console.log)
  return (child) => child
})

const Greeting = Component(function Greeting(state, emit) {
  use(console.log)
  return (name) => html`<h1>Hello ${name}!</h1>`
})

const App = Component(function* App(state, emit) {
  use(console.log)
  let name = 'world'
  const items = [1, 2, 3]

  yield function* () {
    // yield new Promise((resolve) => setTimeout(resolve, 500))
    yield html`
      <div id="app">
        ${Proxy(Greeting(name))}
        <ul>
          ${html`
            <li>${items[0]}</li>
            <li>${items[1]}</li>
            <li>${items[2]}</li>
          `}
        </ul>
        <button onclick=${onclick}>Update</button>
      </div>
    `

    console.log('done')

    function onclick (event) {
      name = 'planet'
      items.reverse()
      emit('render')
      event.preventDefault()
    }
  }

  console.error(new Error('Should not be here'))
})

mount(App, 'body')
