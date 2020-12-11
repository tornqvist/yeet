import { suite } from 'uvu'
import * as assert from 'uvu/assert'
import { html, mount } from '../../index.js'

const test = suite('mount')

test('shallow mount on DOM', function () {
  const div = document.createElement('div')
  mount(html`<div class="test">Hello world!</div>`, div)
  assert.equal(div.className, 'test')
  assert.equal(div.textContent, 'Hello world!')
  assert.equal(div.outerHTML, '<div class="test">Hello world!</div>')
})

test('append children', function () {
  const div = document.createElement('div')
  mount(html`<div><span>Hello</span> <span>world!</span></div>`, div)
  assert.equal(div.childElementCount, 2)
  assert.equal(div.textContent, 'Hello world!')
  assert.equal(div.outerHTML, '<div><span>Hello</span> <span>world!</span></div>')
})

test('mount children', function () {
  const div = document.createElement('div')
  div.innerHTML = '<span>Hello</span> <span>world!</span>'
  const children = Array.from(div.children)
  mount(html`<div><span>Hi</span> <span>planet!</span></div>`, div)
  assert.equal(div.childElementCount, 2)
  assert.equal(div.textContent, 'Hi planet!')
  assert.ok(children.every((child, i) => child.isSameNode(div.children[i])))
  assert.equal(div.outerHTML, '<div><span>Hi</span> <span>planet!</span></div>')
})

test.run()
