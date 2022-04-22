import { suite } from 'uvu'
import * as assert from 'uvu/assert'
import { html, mount } from '../../index.js'

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

test('append missing children', function () {
  const ul = document.createElement('ul')
  ul.innerHTML = '<li>one</li> <li>two</li>'
  const [one, space, two] = ul.childNodes
  mount(html`<li>one</li> <li>two</li> <li>three</li>`, ul)
  assert.is(ul.childNodes[0], one)
  assert.is(ul.childNodes[1], space)
  assert.is(ul.childNodes[2], two)
  assert.is(ul.childElementCount, 3)
  assert.is(ul.innerHTML, '<li>one</li> <li>two</li> <li>three</li>')
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
  assert.is(div.innerHTML, '<p><span>one</span> <strong>two</strong> <span>three</span>\n    </p>')
})

test('mount fragment', function () {
  const div = document.createElement('div')
  div.innerHTML = 'Hello <span>world!</span>'
  mount(html`Hello <span>world!</span>`, div)
  assert.is(div.outerHTML, '<div>Hello <span>world!</span></div>')
})

test('mount fragment with missing whitespace', function () {
  const ul = document.createElement('ul')
  ul.innerHTML = '<li>one</li><li>two</li>'
  mount(html`<li>one</li> <li>two</li>`, ul)
  assert.is(ul.outerHTML, '<ul><li>one</li><li>two</li></ul>')
})

test('mount comment', function () {
  const div = document.createElement('div')
  div.innerHTML = 'Hello <!--world!-->'
  mount(html`Hello <!--${'world!'}-->`, div)
  assert.is(div.outerHTML, '<div>Hello <!--world!--></div>')
})

test('mount array', function () {
  const div = document.createElement('div')
  div.innerHTML = '<div><span>Hello</span> <span>world!</span></div>'
  const children = [...div.firstElementChild.children]
  mount(
    html`<div>${[html`<span>Hi</span>`, ' ', html`<span>planet!</span>`]}</div>`,
    div
  )
  assert.equal(div.firstElementChild.childElementCount, 2)
  assert.equal(div.textContent, 'Hi planet!')
  assert.ok(children.every(
    (child, i) => child.isSameNode(div.firstElementChild.children[i])
  ))
  assert.equal(div.innerHTML, '<div><span>Hi</span> <span>planet!</span></div>')
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
