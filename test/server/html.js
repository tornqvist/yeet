import { suite } from 'uvu'
import * as assert from 'uvu/assert'
import { html, ref, render } from '../../server.js'

const children = suite('children')
const attributes = suite('attributes')
const refs = suite('ref')

children('from nested partials', async function () {
  const res = html`<div>${'Hello'} ${html`<span>world!</span>`}</div>`
  assert.is(await render(res), '<div>Hello <span>world!</span></div>')
})

children('from arrays', async function () {
  const res = html`<div>${['Hello', html` `, html`<span>world!</span>`]}</div>`
  assert.is(await render(res), '<div>Hello <span>world!</span></div>')
})

attributes('can be async', async function () {
  const res = html`<div class="${Promise.resolve('test')}">Hello world!</div>`
  assert.is(await render(res), '<div class="test">Hello world!</div>')
})

attributes('from array are space delimited', async function () {
  const classes = ['foo', Promise.resolve('bar')]
  const res = html`<div class="${classes}">Hello world!</div>`
  assert.is(await render(res), '<div class="foo bar">Hello world!</div>')
})

attributes('can be spread', async function () {
  const attrs = { class: 'test', id: Promise.resolve('test') }
  const data = ['data-foo', Promise.resolve('data-bar'), { 'data-bin': Promise.resolve('baz') }]
  const res = html`<div ${attrs} ${data}>Hello world!</div>`
  assert.is(await render(res), '<div class="test" id="test" data-foo data-bar data-bin="baz">Hello world!</div>')
})

attributes('bool props', async function () {
  const res = html`<input type="checkbox" required=${false} disabled=${true} data-hidden=${false}>`
  assert.is(await render(res), '<input type="checkbox" disabled data-hidden=false>')
})

attributes('can include query string', async function () {
  const res = html`<a class="${'test'}" href="/?requried=${false}&string=${'string'}" target="${'_blank'}">Click me!</a>`
  assert.is(await render(res), '<a class="test" href="/?requried=false&string=string" target="_blank">Click me!</a>')
})

refs('ref', async function () {
  const span = ref()
  const res = html`<span ref=${span}>Hello world!</span>`
  assert.is(await render(res), '<span>Hello world!</span>')
})

children.run()
attributes.run()
refs.run()
