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
  const res = render(html`<div>Hello world!</div>`)
  assert.instance(res, window.HTMLDivElement)
  assert.is(res.outerHTML, '<div>Hello world!</div>')
})

partial('can render fragment', function () {
  const res = render(html`<span>Hello</span> <span>world!</span>`)
  assert.instance(res, window.DocumentFragment)
  assert.is(res.childNodes.length, 3)
  assert.is(res.childElementCount, 2)
  const div = document.createElement('div')
  div.append(res)
  assert.is(div.innerHTML, '<span>Hello</span> <span>world!</span>')
})

partial('can render string', function () {
  const res = render(html`Hello world!`)
  assert.instance(res, window.Text)
  assert.is(res.nodeValue, 'Hello world!')
})

partial('html strings are not parsed as html', function () {
  const res = render(html`<div>${'<script src="evil.com/xss.js"></script>'}</div>`)
  assert.is(res.childNodes.length, 1)
  assert.is(res.firstChild.nodeName, '#text')
  assert.is(res.outerHTML, '<div>&lt;script src="evil.com/xss.js"&gt;&lt;/script&gt;</div>')
})

partial('can be comment', function () {
  assert.is(render(html`<!--comment-->`).nodeValue, 'comment')
  assert.is(render(html`<div><!--comment--></div>`).outerHTML, '<div><!--comment--></div>')
  assert.is(render(html`<div><!--${'many'} ${'comments'}--></div>`).outerHTML, '<div><!--many comments--></div>')
})

partial('trim whitespace wrapping single element nodes', function () {
  const res = render(html`
    <span>
      Hello world!
    </span>
  `)
  assert.instance(res, window.HTMLSpanElement)
  assert.snapshot(res.innerHTML, '\n     Hello world!\n    ')
})

partial('trim whitespace wrapping fragments', function () {
  const res = render(html`
    <span>Hello</span> <span>world!</span>
  `)
  assert.instance(res, window.DocumentFragment)
  assert.is(res.childNodes.length, 3)
  assert.is(res.childElementCount, 2)
  const div = document.createElement('div')
  div.append(res)
  assert.snapshot(div.innerHTML, '<span>Hello</span> <span>world!</span>')
})

partial('preserve whitespace wrapping text nodes', function () {
  const res = render(html`  Hello world!	`) // eslint-disable-line no-tabs
  assert.instance(res, window.Text)
  assert.snapshot(res.nodeValue, '  Hello world!	') // eslint-disable-line no-tabs
})

partial('preserve whitespace wrapping text nodes in fragments', function () {
  const res = render(html`  Hello <span>world!</span>	`) // eslint-disable-line no-tabs
  assert.instance(res, window.DocumentFragment)
  assert.is(res.childNodes.length, 2)
  assert.is(res.childElementCount, 1)
  const div = document.createElement('div')
  div.append(res)
  assert.snapshot(div.innerHTML, '  Hello <span>world!</span>')
})

attributes('array values are space delimited', function () {
  const classes = ['foo', 'bar']
  const res = render(html`<div class="${classes}">Hello world!</div>`)
  assert.equal(res.getAttribute('class'), classes.join(' '))
  assert.is(res.outerHTML, '<div class="foo bar">Hello world!</div>')
})

attributes('can be spread', function () {
  const attrs = { class: 'test', id: 'test' }
  const data = ['data-foo', { 'data-bar': 'baz' }]
  const res = render(html`<div ${attrs} ${data}>Hello world!</div>`)
  assert.is(res.className, 'test')
  assert.is(res.id, 'test')
  assert.is(res.dataset.foo, '')
  assert.is(res.dataset.bar, 'baz')
  assert.is(res.outerHTML, '<div class="test" id="test" data-foo="" data-bar="baz">Hello world!</div>')
})

attributes('bool props', function () {
  const res = render(html`<input type="checkbox" required=${false} disabled=${true} data-hidden=${false}>`)
  assert.is(res.required, false)
  assert.is(res.disabled, true)
  assert.is(res.dataset.hidden, 'false')
  assert.is(res.outerHTML, '<input type="checkbox" disabled="" data-hidden="false">')
})

attributes('can include query string', function () {
  const res = render(html`<a class="test" href="http://example.com/?requried=${false}&string=${'string'}" target="${'_blank'}">Click me!</a>`)
  assert.is(res.className, 'test')
  assert.is(res.href, 'http://example.com/?requried=false&string=string')
  assert.is(res.target, '_blank')
  assert.is(res.outerHTML, '<a class="test" href="http://example.com/?requried=false&amp;string=string" target="_blank">Click me!</a>')
})

refs('are assigned current', function () {
  const span = ref()
  const res = render(html`<span ref=${span}>Hello world!</span>`)
  assert.is(span.current, res)
  assert.is(res.outerHTML, '<span>Hello world!</span>')
})

refs('can be function', function () {
  let node
  const res = render(html`<span ref=${myRef}>Hello world!</span>`)
  assert.is(node, res)
  assert.is(res.outerHTML, '<span>Hello world!</span>')

  function myRef (el) {
    node = el
  }
})

rawPartial('is not escaped', function () {
  const res = render(html`<div>${raw('<script>alert("Hello planet!")</script>')}</div>`)
  assert.is(res.childNodes.length, 1)
  assert.is(res.firstChild.nodeName, 'SCRIPT')
  assert.is(res.firstChild.innerText, 'alert("Hello planet!")')
  assert.is(res.outerHTML, '<div><script>alert("Hello planet!")</script></div>')
})

children('from nested partials', function () {
  const res = render(html`<div>${'Hello'} ${html`<span>world!</span>`}</div>`)
  assert.is(res.childNodes.length, 3)
  assert.is(res.childElementCount, 1)
  assert.is(res.outerHTML, '<div>Hello <span>world!</span></div>')
})

children('from arrays', function () {
  const children = [['Hello'], html` `, html`<span>world!</span>`]
  const res = render(html`<div>${children}</div>`)
  assert.is(res.childNodes.length, 3)
  assert.is(res.childElementCount, 1)
  assert.is(res.outerHTML, '<div>Hello <span>world!</span></div>')
})

children('can be plain string', function () {
  const res = render(html`${'Hello world!'}`)
  assert.instance(res, window.DocumentFragment)
  assert.is(res.childNodes.length, 1)
  assert.is(res.textContent, 'Hello world!')
})

children('can be array of mixed content', function () {
  const res = render(html`${['Hello ', html`<span>world!</span>`]}`)
  assert.instance(res, window.DocumentFragment)
  assert.is(res.childNodes.length, 2)
  assert.is(res.childElementCount, 1)
  assert.is(res.textContent, 'Hello world!')
})

partial.run()
attributes.run()
refs.run()
rawPartial.run()
children.run()
