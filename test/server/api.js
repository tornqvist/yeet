import { suite } from 'uvu'
import * as assert from 'uvu/assert'
import { html, Partial, mount } from '../../server.js'

const partial = suite('partial')

partial('returned by html', function () {
  const partial = html`<div>Hello world!</div>`
  assert.instance(partial, Partial)
})

partial('is iterable', async function () {
  const partial = html`<div>Hello world!</div>`
  let string = ''
  for await (const chunk of partial) {
    string += chunk
  }
  assert.is(string, '<div>Hello world!</div>')
})

partial('can render to promise', async function () {
  const partial = html`<div>Hello world!</div>`
  const promise = partial.render()
  assert.instance(promise, Promise, 'is promise')
  assert.is(await promise, '<div>Hello world!</div>')
})

partial('can render to stream', async function () {
  const partial = html`<div>Hello world!</div>`
  const stream = partial.renderToStream()
  const string = await new Promise(function (resolve, reject) {
    let string = ''
    stream.on('data', function (chunk) {
      string += chunk
    })
    stream.on('end', function () {
      resolve(string)
    })
    stream.on('end', reject)
  })
  assert.is(string, '<div>Hello world!</div>')
})

const mounting = suite('mount')

mounting('decorates partial', async function () {
  const initialState = {}
  const res = mount(html`<body>Hello planet!</body>`, 'body', initialState)
  assert.instance(res, Partial)
  assert.is(res.state, initialState)
  assert.is(res.selector, 'body')
  assert.is(await res.render(), '<body>Hello planet!</body>')
})

partial.run()
mounting.run()
