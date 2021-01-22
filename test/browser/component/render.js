import { suite } from 'uvu'
import * as assert from 'uvu/assert'
import { html, Component } from '../../../index.js'

const element = suite('element')
const children = suite('children')
// TODO: const fragment = suite('fragment')

element('one-off', function () {
  const res = Component(() => html`<h1>Hello planet!</h1>`).render()
  assert.is(res.outerHTML, '<h1>Hello planet!</h1>')
})

element('w/ lifecycle', function () {
  const res = Component(() => () => () => html`<h1>Hello planet!</h1>`).render()
  assert.is(res.outerHTML, '<h1>Hello planet!</h1>')
})

children('return just child', function () {
  const Main = Component(function () {
    return Component(function () {
      return html`<div>Hello world!</div>`
    })
  })
  assert.is(Main.render().outerHTML, '<div>Hello world!</div>')
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
  assert.snapshot(dedent(res.render().outerHTML), dedent`
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

  assert.snapshot(Main.render().outerHTML, dedent`
    <ul><li>1</li><li>2</li><li>3</li></ul>
  `)

  function Child () {
    return (num) => html`<li>${num}</li>`
  }
})

element.run()
children.run()

function dedent (string) {
  if (Array.isArray(string)) string = string.join('')
  return string.replace(/\n\s+/g, '\n').trim()
}
