import { suite } from 'uvu'
import * as assert from 'uvu/assert'
import { html, ref } from '../../server.js'

const children = suite('children')

children('from nested partials', async function () {
  const res = html`<div>${'Hello'} ${html`<span>world!</span>`}</div>`
  assert.is(await res.render(), '<div>Hello <span>world!</span></div>')
})

children('from arrays', async function () {
  const res = html`<div>${['Hello', html` `, html`<span>world!</span>`]}</div>`
  assert.is(await res.render(), '<div>Hello <span>world!</span></div>')
})

const attributes = suite('attributes')

attributes('can be async', async function () {
  const res = html`<div class="${Promise.resolve('test')}">Hello world!</div>`
  assert.is(await res.render(), '<div class="test">Hello world!</div>')
})

attributes('from array are space delimited', async function () {
  const classes = ['foo', Promise.resolve('bar')]
  const res = html`<div class="${classes}">Hello world!</div>`
  assert.is(await res.render(), '<div class="foo bar">Hello world!</div>')
})

attributes('can be spread', async function () {
  const attrs = { class: 'test', id: Promise.resolve('test') }
  const data = ['data-foo', Promise.resolve('data-bar'), { 'data-bin': Promise.resolve('baz') }]
  const res = html`<div ${attrs} ${data}>Hello world!</div>`
  assert.is(await res.render(), '<div class="test" id="test" data-foo data-bar data-bin="baz">Hello world!</div>')
})

attributes('bool props', async function () {
  const res = html`<input type="checkbox" required=${false} disabled=${true} data-hidden=${false}>`
  assert.is(await res.render(), '<input type="checkbox" disabled="disabled" data-hidden=false>')
})

attributes('can include query string', async function () {
  const res = html`<a class="${'test'}" href="/?requried=${false}&string=${'string'}" target="${'_blank'}">Click me!</a>`
  assert.is(await res.render(), '<a class="test" href="/?requried=false&string=string" target="_blank">Click me!</a>')
})

const refs = suite('ref')

refs('ref', async function () {
  const span = ref()
  const res = html`<span ref=${span}>Hello world!</span>`
  assert.is(await res.render(), '<span>Hello world!</span>')
})

children.run()
attributes.run()
refs.run()
