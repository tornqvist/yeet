import { suite } from 'uvu'
import * as assert from 'uvu/assert'
import { html, mount, render } from '../../index.js'

const reuse = suite('reuse')
const types = suite('types')
const order = suite('order')
const fragments = suite('fragments')

reuse('children in same place', function () {
  const div = document.createElement('div')
  const header = html`<header>Hi</header>`
  const footer = html`<footer>Goodbye</footer>`

  mount(foo(), div)
  assert.is(div.childElementCount, 3)
  assert.is(div.textContent.replace(/\s+/g, ''), 'HiWelcomeGoodbye')

  const [first,, third] = div.childNodes

  mount(bar(), div)
  assert.is(div.childElementCount, 3)
  assert.is(div.textContent.replace(/\s+/g, ''), 'HiYoGoodbye')
  assert.is(first.firstElementChild, div.childNodes[0].firstElementChild)
  assert.is(third, div.childNodes[2])

  function foo () {
    return html`
      <div>
        ${html`<div>${header}</div>`}
        <main>Welcome</main>
        ${footer}
      </div>
    `
  }

  function bar () {
    return html`
      <div>
        ${html`<div>${header}</div>`}
        <main>Yo</main>
        ${footer}
      </div>
    `
  }
})

types('can be nested array', function () {
  const ul = render(html`
    <ul>${[
      [html`<li>1</li>`],
      html`<li>2</li>`,
      [html`<li>3</li>`]
    ]}</ul>
  `)
  assert.is(ul.childElementCount, 3)
  assert.is(ul.textContent, '123')
})

types('can update from partial to array', function () {
  const ul = document.createElement('ul')

  mount(main(child(1)), ul)
  assert.is(ul.childElementCount, 1)
  assert.is(ul.textContent, '1')

  const firstChild = ul.firstElementChild

  mount(main([1, 2, 3].map(child)), ul)
  assert.is(ul.childElementCount, 3)
  assert.is(ul.textContent, '123')
  assert.is(ul.firstElementChild, firstChild)

  function child (value) {
    return html`<li>${value}</li>`
  }

  function main (children) {
    return html`<ul>${children}</ul>`
  }
})

types('can update from array to partial', function () {
  const ul = document.createElement('ul')

  mount(main([1, 2, 3].map(child)), ul)
  assert.is(ul.childElementCount, 3)
  assert.is(ul.textContent, '123')

  const firstChild = ul.firstElementChild

  mount(main(child(1)), ul)
  assert.is(ul.childElementCount, 1)
  assert.is(ul.textContent, '1')
  assert.is(ul.firstElementChild, firstChild)

  function child (value) {
    return html`<li>${value}</li>`
  }

  function main (children) {
    return html`<ul>${children}</ul>`
  }
})

order('is rearrenged for array', function () {
  const ul = document.createElement('ul')
  const children = [
    () => html`<li>1</li>`,
    () => html`<li>2</li>`,
    () => html`<li>3</li>`
  ]
  mount(main(), ul)
  const [one, two, three] = ul.childNodes
  assert.is(ul.innerText, '123')
  children.reverse()
  mount(main(), ul)
  assert.is(ul.childNodes[0], three)
  assert.is(ul.childNodes[1], two)
  assert.is(ul.childNodes[2], one)
  assert.is(ul.innerText, '321')

  function main () {
    return html`<ul>${children.map((fn) => fn())}</ul>`
  }
})

order('has no effect outside array', function () {
  const ul = document.createElement('ul')
  const children = [
    () => html`<li>1</li>`,
    () => html`<li>2</li>`,
    () => html`<li>3</li>`
  ]
  mount(main(children), ul)
  const [one, two, three] = ul.childNodes
  assert.is(ul.innerText, '123')
  children.reverse()
  mount(main(children.slice(1), children[0]), ul)
  assert.is(ul.childNodes[0], two)
  assert.is(ul.childNodes[1], one)
  assert.is.not(ul.childNodes[3], three)
  assert.is(ul.innerText, '213')

  function main (children, child) {
    return html`<ul>${children.map((fn) => fn())}${child?.()}</ul>`
  }
})

fragments('do not leak', function () {
  const ul = document.createElement('ul')

  mount(main(html`<li>1</li>`, html`<li>2</li><li>3</li>`), ul)
  assert.is(ul.innerText, '123')

  mount(main(html`<li>1</li>`, html`<li>2</li><li>3</li>`), ul)
  assert.is(ul.innerText, '123')

  mount(main(null, html`<li>2</li><li>3</li>`), ul)
  assert.is(ul.innerText, '23')

  mount(main(html`<li>1</li>`, html`<li>2</li><li>3</li>`), ul)
  assert.is(ul.innerText, '123')

  function main (a, b) {
    return html`<ul>${a}${b}</ul>`
  }
})

reuse.run()
types.run()
order.run()
fragments.run()
