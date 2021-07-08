import { suite } from 'uvu'
import * as assert from 'uvu/assert'
import { html, mount } from '../../index.js'

const test = suite('mount')

test('shallow mount on DOM', function () {
  const div = document.createElement('div')
  mount(div, html`<div class="test">Hello world!</div>`)
  assert.equal(div.className, 'test')
  assert.equal(div.textContent, 'Hello world!')
  assert.equal(div.outerHTML, '<div class="test">Hello world!</div>')
})

test('append children', function () {
  const div = document.createElement('div')
  mount(div, html`<div><span>Hello</span> <span>world!</span></div>`)
  assert.equal(div.childElementCount, 2)
  assert.equal(div.textContent, 'Hello world!')
  assert.equal(div.outerHTML, '<div><span>Hello</span> <span>world!</span></div>')
})

test('mount children', function () {
  const div = document.createElement('div')
  div.innerHTML = '<span>Hello</span> <span>world!</span>'
  const children = Array.from(div.children)
  mount(div, html`<div><span>Hi</span> <span>planet!</span></div>`)
  assert.equal(div.childElementCount, 2)
  assert.equal(div.textContent, 'Hi planet!')
  assert.ok(children.every((child, i) => child.isSameNode(div.children[i])))
  assert.equal(div.outerHTML, '<div><span>Hi</span> <span>planet!</span></div>')
})

test('mount children out of order', function () {
  const div = document.createElement('div')
  div.innerHTML = '<span id="one">one</span> <strong>two</strong><span id="three">three</span>'
  const [one, space, two, three] = div.childNodes
  mount(div, html`<div><strong>one</strong><span id="three">two</span> <span id="one">three</span></div>`)
  assert.is(div.childNodes[0], two)
  assert.is(div.childNodes[1], three)
  assert.is(div.childNodes[2], space)
  assert.is(div.childNodes[3], one)
  assert.is(div.innerHTML, '<strong>one</strong><span id="three">two</span> <span id="one">three</span>')
})

test('mount fragment', function () {
  const div = document.createElement('div')
  mount(div, html`Hello <span>world!</span>`)
  assert.is(div.outerHTML, '<div>Hello <span>world!</span></div>')
})

test('mount on selector', function () {
  const id = `_${Math.random().toString(36).substring(2)}`
  const div = document.createElement('div')
  div.id = id
  document.body.appendChild(div)
  mount(`#${id}`, html`<div>Hello world!</div>`)
  assert.is(div.outerHTML, `<div id="${id}">Hello world!</div>`)
  div.remove()
})

test.run()
