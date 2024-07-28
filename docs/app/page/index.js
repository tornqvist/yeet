import { html, raw, Component } from 'yeet'
import style from './index.module.css'

export default Component(function Page (state, emit) {
  return function ({ body, attributes }) {
    emit('meta', attributes)
    return html`
      <main clas="${style.container}">
        ${raw(body)}
      </main>
    `
  }
})
