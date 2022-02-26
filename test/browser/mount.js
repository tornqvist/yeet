import { suite } from 'uvu'
import * as assert from 'uvu/assert'
import { mount } from '../../mount.js'
import { html } from '../../rewrite.js'

const test = suite('mount')

test('mount children', function () {
  const div = document.createElement('div')
  div.innerHTML = '<div><span>Hello</span> <span>world!</span></div>'
  const children = [...div.firstElementChild.children]
  mount(html`<div><span>Hi</span> <span>planet!</span></div>`, div)
  assert.equal(div.firstElementChild.childElementCount, 2)
  assert.equal(div.textContent, 'Hi planet!')
  assert.ok(children.every(
    (child, i) => child.isSameNode(div.firstElementChild.children[i])
  ))
  assert.equal(div.innerHTML, '<div><span>Hi</span> <span>planet!</span></div>')
})

test('mount children out of order', function () {
  const div = document.createElement('div')
  div.innerHTML = '<span>one</span> <strong>two</strong> <span>three</span>'
  const [one, , two, space, three] = div.childNodes
  mount(html`<small>one</small><strong>two</strong> <span>three</span>`, div)
  assert.is.not(div.childNodes[0], one)
  assert.is(div.childNodes[1], two)
  assert.is(div.childNodes[2], space)
  assert.is(div.childNodes[3], three)
  assert.is(div.innerHTML, '<small>one</small><strong>two</strong> <span>three</span>')
})

test('mount children with missing whitespace', function () {
  const div = document.createElement('div')
  div.innerHTML = '<p><span>one</span> <strong>two</strong> <span>three</span></p>'
  const paragraph = div.firstElementChild
  const [one, two, three] = paragraph.children
  mount(html`
    <p>
      <span>one</span>
      <strong>two</strong>
      <span>three</span>
    </p>
  `, div)
  assert.is(div.firstElementChild, paragraph)
  assert.is(div.firstElementChild.children[0], one)
  assert.is(div.firstElementChild.children[1], two)
  assert.is(div.firstElementChild.children[2], three)
  assert.is(div.innerHTML, '<p>\n      <span>one</span>\n      <strong>two</strong>\n      <span>three</span>\n    </p>')
})

test('mount fragment', function () {
  const div = document.createElement('div')
  div.innerHTML = 'Hello <span>world!</span>'
  mount(html`Hello <span>world!</span>`, div)
  assert.is(div.outerHTML, '<div>Hello <span>world!</span></div>')
})

test('mount comment', function () {
  const div = document.createElement('div')
  div.innerHTML = 'Hello <!--world!-->'
  mount(html`Hello <!--${'world!'}-->`, div)
  assert.is(div.outerHTML, '<div>Hello <!--world!--></div>')
})

test('mount on selector', function () {
  const id = `_${Math.random().toString(36).substring(2)}`
  const div = document.createElement('div')
  div.id = id
  document.body.appendChild(div)
  mount(html`<div>Hello world!</div>`, `#${id}`)
  assert.is(div.outerHTML, `<div id="${id}"><div>Hello world!</div></div>`)
  div.remove()
})

test.run()
