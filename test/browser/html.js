import { suite } from 'uvu'
import * as assert from 'uvu/assert'
import { html, raw, ref, Partial, render } from '../../index.js'

const partial = suite('partial')
const attributes = suite('attributes')
const refs = suite('ref')
const rawPartial = suite('raw')
const children = suite('children')

partial('returned from html', function () {
  const res = html`<div></div>`
  assert.instance(res, Partial)
})

partial('can render element', function () {
  const div = document.createElement('div')
  render(html`<div>Hello world!</div>`, div)
  assert.instance(div.firstElementChild, window.HTMLDivElement)
  assert.is(div.innerHTML, '<div>Hello world!</div>')
})

partial('replaces existing children', function () {
  const div = document.createElement('div')
  div.innerHTML = '<span>Hello world!</span>'
  const child = div.firstChild
  render(html`<span>Hello world!</span>`, div)
  assert.not.equal(div.firstChild, child)
  assert.is(div.innerHTML, '<span>Hello world!</span>')
})

partial('can render fragment', function () {
  const div = document.createElement('div')
  render(html`<span>Hello</span> <span>world!</span>`, div)
  assert.is(div.childNodes.length, 3)
  assert.is(div.childElementCount, 2)
  assert.is(div.innerHTML, '<span>Hello</span> <span>world!</span>')
})

partial('can render string', function () {
  const div = document.createElement('div')
  render(html`Hello world!`, div)
  const [child] = div.childNodes
  assert.instance(child, window.Text)
  assert.is(child.nodeValue, 'Hello world!')
})

partial('html strings are not parsed as html', function () {
  const div = document.createElement('div')
  render(html`<div>${'<script src="evil.com/xss.js"></script>'}</div>`, div)
  assert.is(div.firstElementChild.childNodes.length, 1)
  assert.is(div.firstElementChild.firstChild.nodeName, '#text')
  assert.is(div.firstElementChild.outerHTML, '<div>&lt;script src="evil.com/xss.js"&gt;&lt;/script&gt;</div>')
})

partial('can be comment', function () {
  const div = document.createElement('div')
  render(html`<!--comment-->`, div)
  assert.is(div.firstChild.nodeValue, 'comment')
  render(html`<div><!--comment--></div>`, div)
  assert.is(div.firstElementChild.outerHTML, '<div><!--comment--></div>')
  render(html`<div><!--${'many'} ${'comments'}--></div>`, div)
  assert.is(div.firstElementChild.outerHTML, '<div><!--many comments--></div>')
})

partial('trim whitespace wrapping single element nodes', function () {
  const div = document.createElement('div')
  render(html`
    <span>
      Hello world!
    </span>
  `, div)
  assert.instance(div.firstElementChild, window.HTMLSpanElement)
  assert.snapshot(div.firstElementChild.innerHTML, '\n     Hello world!\n    ')
})

partial('trim whitespace wrapping fragments', function () {
  const div = document.createElement('div')
  render(html`
    <span>Hello</span> <span>world!</span>
  `, div)
  assert.is(div.childNodes.length, 3)
  assert.is(div.childElementCount, 2)
  assert.snapshot(div.innerHTML, '<span>Hello</span> <span>world!</span>')
})

partial('preserve whitespace wrapping text nodes', function () {
  const div = document.createElement('div')
  render(html`  Hello world!	`, div) // eslint-disable-line no-tabs
  assert.instance(div.firstChild, window.Text)
  assert.snapshot(div.firstChild.nodeValue, '  Hello world!	') // eslint-disable-line no-tabs
})

partial('preserve whitespace wrapping text nodes in fragments', function () {
  const div = document.createElement('div')
  render(html`  Hello <span>world!</span>	`, div) // eslint-disable-line no-tabs
  assert.is(div.childNodes.length, 2)
  assert.is(div.childElementCount, 1)
  assert.snapshot(div.innerHTML, '  Hello <span>world!</span>')
})

attributes('array values are space delimited', function () {
  const div = document.createElement('div')
  const classes = ['foo', 'bar']
  render(html`<div class="${classes}">Hello world!</div>`, div)
  assert.equal(div.firstElementChild.getAttribute('class'), classes.join(' '))
  assert.is(div.innerHTML, '<div class="foo bar">Hello world!</div>')
})

attributes('can be spread', function () {
  const div = document.createElement('div')
  const attrs = { class: 'test', id: 'test' }
  const data = ['data-foo', { 'data-bar': 'baz' }]
  render(html`<div ${attrs} ${data}>Hello world!</div>`, div)
  assert.is(div.firstElementChild.className, 'test')
  assert.is(div.firstElementChild.id, 'test')
  assert.is(div.firstElementChild.dataset.foo, '')
  assert.is(div.firstElementChild.dataset.bar, 'baz')
  assert.is(div.innerHTML, '<div class="test" id="test" data-foo="" data-bar="baz">Hello world!</div>')
})

attributes('bool props', function () {
  const div = document.createElement('div')
  render(html`<input type="checkbox" required=${false} disabled=${true} data-hidden=${false}>`, div)
  assert.is(div.firstElementChild.required, false)
  assert.is(div.firstElementChild.disabled, true)
  assert.is(div.firstElementChild.dataset.hidden, 'false')
  assert.is(div.innerHTML, '<input type="checkbox" disabled="" data-hidden="false">')
})

attributes('can include query string', function () {
  const div = document.createElement('div')
  render(html`<a class="test" href="http://example.com/?requried=${false}&string=${'string'}" target="${'_blank'}">Click me!</a>`, div)
  assert.is(div.firstElementChild.className, 'test')
  assert.is(div.firstElementChild.href, 'http://example.com/?requried=false&string=string')
  assert.is(div.firstElementChild.target, '_blank')
  assert.is(div.innerHTML, '<a class="test" href="http://example.com/?requried=false&amp;string=string" target="_blank">Click me!</a>')
})

refs('are assigned current', function () {
  const span = ref()
  const div = document.createElement('div')
  render(html`<span ref=${span}>Hello world!</span>`, div)
  assert.is(span.current, div.firstElementChild)
  assert.is(div.innerHTML, '<span>Hello world!</span>')
})

refs('can be function', function () {
  let node
  const div = document.createElement('div')
  render(html`<span ref=${myRef}>Hello world!</span>`, div)
  assert.is(node, div.firstElementChild)
  assert.is(div.innerHTML, '<span>Hello world!</span>')

  function myRef (el) {
    node = el
  }
})

rawPartial('is not escaped', function () {
  const div = document.createElement('div')
  render(html`<div>${raw('<script>alert("Hello planet!")</script>')}</div>`, div)
  assert.is(div.firstElementChild.childNodes.length, 1)
  assert.is(div.firstElementChild.firstChild.nodeName, 'SCRIPT')
  assert.is(div.firstElementChild.firstChild.innerText, 'alert("Hello planet!")')
  assert.is(div.innerHTML, '<div><script>alert("Hello planet!")</script></div>')
})

children('from nested partials', function () {
  const div = document.createElement('div')
  render(html`<div>${'Hello'} ${html`<span>world!</span>`}</div>`, div)
  assert.is(div.firstElementChild.childNodes.length, 3)
  assert.is(div.firstElementChild.childElementCount, 1)
  assert.is(div.innerHTML, '<div>Hello <span>world!</span></div>')
})

children('from arrays', function () {
  const div = document.createElement('div')
  const children = [['Hello'], html` `, html`<span>world!</span>`]
  render(html`<div>${children}</div>`, div)
  assert.is(div.firstElementChild.childNodes.length, 3)
  assert.is(div.firstElementChild.childElementCount, 1)
  assert.is(div.innerHTML, '<div>Hello <span>world!</span></div>')
})

children('can be plain string', function () {
  const div = document.createElement('div')
  render(html`${'Hello world!'}`, div)
  assert.is(div.childNodes.length, 1)
  assert.is(div.textContent, 'Hello world!')
})

children('can be array of mixed content', function () {
  const div = document.createElement('div')
  render(html`${['Hello ', html`<span>world!</span>`]}`, div)
  assert.is(div.childNodes.length, 2)
  assert.is(div.childElementCount, 1)
  assert.is(div.textContent, 'Hello world!')
})

partial.run()
attributes.run()
refs.run()
rawPartial.run()
children.run()
