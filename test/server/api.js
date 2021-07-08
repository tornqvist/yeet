import { suite } from 'uvu'
import { Readable } from 'stream'
import * as assert from 'uvu/assert'
import { html, Partial, mount, render } from '../../server.js'

const partial = suite('partial')
const mounting = suite('mount')

partial('returned by html', function () {
  const partial = html`<div>Hello world!</div>`
  assert.instance(partial, Partial)
})

partial('can render to promise', async function () {
  const promise = render(html`<div>Hello world!</div>`)
  assert.instance(promise, Promise, 'is promise')
  assert.is(await promise, '<div>Hello world!</div>')
})

partial('is async iterable', async function () {
  const partial = html`<div>Hello world!</div>`
  assert.type(partial[Symbol.asyncIterator], 'function')
  let res = ''
  for await (const chunk of partial) res += chunk
  assert.is(res, '<div>Hello world!</div>')
})

partial('can render to stream', async function () {
  const stream = Readable.from(html`<div>Hello world!</div>`)
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

mounting('decorates partial', async function () {
  const initialState = {}
  const res = mount('body', html`<body>Hello planet!</body>`, initialState)
  assert.instance(res, Partial)
  assert.is(res.state, initialState)
  assert.is(res.selector, 'body')
  assert.is(await render(res), '<body>Hello planet!</body>')
})

partial.run()
mounting.run()
