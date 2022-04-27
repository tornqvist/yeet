import { suite } from 'uvu'
import * as assert from 'uvu/assert'
import { html, mount, Component } from '../../../index.js'

const test = suite('mount')

test('can mount', function () {
  const div = document.createElement('div')

  div.innerHTML = '<h1>Hello world!</h1>'
  const h1 = div.firstChild
  const text = h1.firstChild

  mount(Component(Main), div)

  assert.is(div.firstChild, h1)
  assert.is(div.firstChild.firstChild, text)
  assert.is(div.innerHTML, '<h1>Hello world!</h1>')

  function Main (state, emit) {
    return html`<h1>Hello world!</h1>`
  }
})

test('updates in place', async function () {
  const div = document.createElement('div')

  div.innerHTML = '<h1>Hello <em>world</em>!</h1>'
  const h1 = div.firstChild
  const childNodes = [...h1.childNodes]

  mount(html`<h1>Hi ${Component(Main)}!</h1>`, div)

  assert.is(div.firstChild, h1, 'same h1')
  h1.childNodes.forEach(
    (child, i) => assert.is(child, childNodes[i], `same child ${i}`)
  )
  assert.is(div.innerHTML, '<h1>Hi <em>world</em>!</h1>')

  await new Promise(resolve => setTimeout(resolve, 100))

  assert.is(div.firstChild, h1, 'same h1')
  h1.childNodes.forEach(
    (child, i) => assert.is(child, childNodes[i], `same child ${i}`)
  )
  assert.is(div.innerHTML, '<h1>Hi <em>planet</em>!</h1>')

  function Main (state, emit) {
    return function * () {
      yield new Promise((resolve) => setTimeout(resolve, 100))
      return html`<em>planet</em>`
    }
  }
})

test('remove unused nodes', function () {
  const div = document.createElement('div')
  div.innerHTML = 'Hello <span>world!</span>'
  mount(Component(() => html`Hello ${null}`), div)
  assert.is(div.innerHTML, 'Hello ')
})

test.run()
