import { suite } from 'uvu'
import * as assert from 'uvu/assert'
import { html, Component, render } from '../../../examples/rewrite/lib.js'

const element = suite('element')
const children = suite('children')
const fragment = suite('fragment')

element('one-off', function () {
  const res = render(Component(() => html`<h1>Hello planet!</h1>`))
  assert.is(res.outerHTML, '<h1>Hello planet!</h1>')
})

element('w/ lifecycle', function () {
  const res = render(Component(() => () => () => html`<h1>Hello planet!</h1>`))
  assert.is(res.outerHTML, '<h1>Hello planet!</h1>')
})

children('return just child', function () {
  const Main = Component(function () {
    return Component(function () {
      return html`<div>Hello world!</div>`
    })
  })
  assert.is(render(Main).outerHTML, '<div>Hello world!</div>')
})

children('nested component', function () {
  const Main = Component(function Main (state, emit) {
    return html`
      <span>
        Hello ${Component(Child, { test: 'fest' })}!
      </span>
    `
  })

  const res = html`
    <div>
      ${Main({ test: 'test' })}
    </div>
  `
  assert.snapshot(dedent(render(res).outerHTML), dedent`
    <div>
      <span>
        Hello world!
      </span>
    </div>
  `)

  function Child (state, emit) {
    return function (props) {
      return 'world'
    }
  }
})

children('array of components', function () {
  const children = new Array(3).fill(Child).map(Component)
  const Main = Component(function () {
    return function () {
      return html`<ul>${children.map((Child, index) => Child(index + 1))}</ul>`
    }
  })

  assert.snapshot(render(Main).outerHTML, dedent`
    <ul><li>1</li><li>2</li><li>3</li></ul>
  `)

  function Child () {
    return (num) => html`<li>${num}</li>`
  }
})

fragment('can render fragment', function () {
  assert.snapshot(dedent(render(html`
    <ul>
      ${Component(Main)}
    </ul>
  `).outerHTML), dedent`
    <ul>
    <li>1</li>
    <li>2</li>
    <li>3</li>
    </ul>
  `)

  function Main () {
    return function () {
      return html`
        <li>1</li>
        <li>2</li>
        <li>3</li>
      `
    }
  }
})

element.run()
children.run()
fragment.run()

function dedent (string) {
  if (Array.isArray(string)) string = string.join('')
  return string.replace(/\n\s+/g, '\n').trim()
}
