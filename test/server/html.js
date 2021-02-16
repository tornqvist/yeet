import { suite } from 'uvu'
import * as assert from 'uvu/assert'
import { html, raw, ref, render } from '../../server.js'

const children = suite('children')
const attributes = suite('attributes')
const refs = suite('ref')
const rawPartial = suite('raw')

children('text is escaped', async function () {
  const partial = html`<div>${'<script src="evil.com/xss.js"></script>'}</div>`
  assert.is(await render(partial), '<div>&lt;script src=&quot;evil.com/xss.js&quot;&gt;&lt;/script&gt;</div>')
})

children('can be comment', async function () {
  assert.is(await render(html`<!--comment-->`), '<!--comment-->')
  assert.is(await render(html`<div><!--comment--></div>`), '<div><!--comment--></div>')
  assert.is(await render(html`<div><!--${'many'} ${'comments'}--></div>`), '<div><!--many comments--></div>')
})

children('from nested partials', async function () {
  const partial = html`<div>${'Hello'} ${html`<span>world!</span>`}</div>`
  assert.is(await render(partial), '<div>Hello <span>world!</span></div>')
})

children('from arrays', async function () {
  const partial = html`<div>${['Hello', html` `, html`<span>world!</span>`]}</div>`
  assert.is(await render(partial), '<div>Hello <span>world!</span></div>')
})

attributes('can be async', async function () {
  const partial = html`<div class="${Promise.resolve('test')}">Hello world!</div>`
  assert.is(await render(partial), '<div class="test">Hello world!</div>')
})

attributes('from array are space delimited', async function () {
  const classes = ['foo', Promise.resolve('bar')]
  const partial = html`<div class="${classes}">Hello world!</div>`
  assert.is(await render(partial), '<div class="foo bar">Hello world!</div>')
})

attributes('can be spread', async function () {
  const attrs = { class: 'test', id: Promise.resolve('test') }
  const data = ['data-foo', Promise.resolve('data-bar'), { 'data-bin': Promise.resolve('baz') }]
  const partial = html`<div ${attrs} ${data}>Hello world!</div>`
  assert.is(await render(partial), '<div class="test" id="test" data-foo data-bar data-bin="baz">Hello world!</div>')
})

attributes('bool props', async function () {
  const partial = html`<input type="checkbox" required=${false} disabled=${true} data-hidden=${false}>`
  assert.is(await render(partial), '<input type="checkbox" disabled data-hidden=false>')
})

attributes('can include query string', async function () {
  const partial = html`<a class="${'test'}" href="/?requried=${false}&string=${'string'}" target="${'_blank'}">Click me!</a>`
  assert.is(await render(partial), '<a class="test" href="/?requried=false&string=string" target="_blank">Click me!</a>')
})

refs('are stripped', async function () {
  const span = ref()
  const partial = html`<span ref=${span}>Hello world!</span>`
  assert.is(await render(partial), '<span>Hello world!</span>')
})

rawPartial('is not escaped', async function () {
  const partial = html`<div>${raw('<script>alert("Hello planet!")</script>')}</div>`
  assert.is(await render(partial), '<div><script>alert("Hello planet!")</script></div>')
})

children.run()
attributes.run()
refs.run()
rawPartial.run()
