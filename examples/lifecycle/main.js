import { html, mount, Component } from '../../index.js'
import './style.css'

mount(Component(Caffeine), document.getElementById('app'))

function * Caffeine (state, emit) {
  // ↓ Setup variables (only happens once per component lifetime)

  let interval
  let seconds = 5

  function reset () {
    seconds = 5
    interval = null
    clearInterval(interval)
    emit('render')
  }

  // ↓ Provide yeet with the component render function and halt
  yield function * () {
    // ↓ Tell yeet to render this before continuing
    yield html`
      <div id="app">
        <p>${seconds
          ? `Click the button within ${seconds} seconds.`
          : 'Did you fall asleep?'}</p>
        <button onclick=${reset}>I'm awake!</button>
        </div>
    `

    // ↓ Continue here once the component has mounted/updated
    if (!interval) {
      interval = setInterval(function () {
        seconds--
        if (!seconds) clearInterval(interval)
        emit('render')
      }, 1000)
    }
  }

  // ↓ Continue here when removed from the DOM (only happens once)
  clearInterval(interval)
}
