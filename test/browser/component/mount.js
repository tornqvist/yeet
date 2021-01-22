import { test } from 'uvu'
import * as assert from 'uvu/assert'
import { html, mount, Component } from '../../../index.js'

test('can mount', function () {
  const div = document.createElement('div')
  mount(Component(Main), div)
  assert.is(div.outerHTML, '<div>Hello world!</div>')

  function Main (state, emit) {
    return html`<div>Hello world!</div>`
  }
})

test.run()
