import { suite } from 'uvu'
import * as assert from 'uvu/assert'
import { html, Component, render } from '../../../index.js'

const element = suite('element')
const children = suite('children')
const fragment = suite('fragment')

element('immedate return partial', function () {
  const div = document.createElement('div')
  render(Component(() => html`<h1>Hello planet!</h1>`), div)
  assert.is(div.innerHTML, '<h1>Hello planet!</h1>')
})

children('immediate return component', function () {
  const div = document.createElement('div')
  const Main = Component(function () {
    return Component(function () {
      return html`<div>Hello world!</div>`
    })
  })
  render(Main, div)
  assert.is(div.innerHTML, '<div>Hello world!</div>')
})

element('w/ lifecycle', function () {
  const div = document.createElement('div')
  render(Component(() => () => () => html`<h1>Hello planet!</h1>`), div)
  assert.is(div.innerHTML, '<h1>Hello planet!</h1>')
})

children('nested component', function () {
  const div = document.createElement('div')
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

  render(res, div)

  assert.snapshot(dedent(div.innerHTML), dedent`
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
  const div = document.createElement('div')
  const children = new Array(3).fill(Child).map(Component)
  const Main = Component(function () {
    return function () {
      return html`<ul>${children.map((Child, index) => Child(index + 1))}</ul>`
    }
  })

  render(Main, div)

  assert.snapshot(div.innerHTML, dedent`
    <ul><li>1</li><li>2</li><li>3</li></ul>
  `)

  function Child () {
    return (num) => html`<li>${num}</li>`
  }
})

fragment('can render fragment', function () {
  const ul = document.createElement('ul')

  render(Component(Main), ul)

  assert.snapshot(dedent(ul.outerHTML), dedent`
    <ul><li>1</li>
    <li>2</li>
    <li>3</li></ul>
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
