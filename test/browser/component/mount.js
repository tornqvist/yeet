import { suite } from 'uvu'
import * as assert from 'uvu/assert'
import { html, mount, Component } from '../../../rewrite.js'

const test = suite('mount')

test('can mount', function () {
  const div = document.createElement('div')

  div.innerHTML = '<h1>Hello world!</h1>'
  const h1 = div.firstChild
  const text = h1.firstChild

  mount(Component(Main), div)

  assert.is(div.firstChild, h1)
  assert.is(div.firstChild.firstChild, text)
  assert.is(div.innerHTML, '<h1>Hello world!</h1>')

  function Main (state, emit) {
    return html`<h1>Hello world!</h1>`
  }
})

test('updates in place', async function () {
  const div = document.createElement('div')

  div.innerHTML = '<h1>Hello <em>world</em>!</h1>'
  const h1 = div.firstChild
  const [hello, , exclamation] = h1.childNodes

  mount(html`<h1>Hi ${Component(Main)}!</h1>`, div)

  assert.is(div.firstChild, h1, 'same h1')
  assert.is(h1.childNodes.length, 2, 'one child removed')
  assert.is(h1.childNodes[0], hello, 'preceeding text is preserved')
  assert.is(h1.childNodes[1], exclamation, 'following text is preserved')
  assert.is(div.innerHTML, '<h1>Hi !</h1>')

  await new Promise(resolve => setTimeout(resolve, 100))

  assert.is(div.firstChild, h1, 'same h1')
  assert.is(h1.childNodes.length, 3, 'one child added')
  assert.is(h1.childNodes[0], hello, 'preceeding text is still preserved')
  assert.is(h1.childNodes[2], exclamation, 'following text is still preserved')
  assert.is(div.innerHTML, '<h1>Hi <em>planet</em>!</h1>')

  function Main (state, emit) {
    return function * () {
      yield new Promise((resolve) => setTimeout(resolve, 100))
      return html`<em>planet</em>`
    }
  }
})

// reuse('immediate child component', function () {
//   const div = document.createElement('div')
//   let init = 0

//   mount(foo(), div)
//   assert.is(div.textContent.trim(), '1')

//   const child = div.firstElementChild.firstElementChild

//   mount(bar(), div)
//   assert.is(div.textContent.trim(), '2')
//   assert.is(div.firstElementChild.firstElementChild, child)

//   assert.is(init, 1)

//   function Counter (state, emit) {
//     init++
//     let value = 0
//     return function () {
//       return html`<output>${++value}</output>`
//     }
//   }

//   function foo () {
//     return html`<div>${Component(Counter)}</div>`
//   }

//   function bar () {
//     return html`<div>${Component(Counter)}</div>`
//   }
// })

// reuse('nested child component', function () {
//   const div = document.createElement('div')
//   let init = 0

//   mount(div, foo())

//   const parent = div.firstElementChild
//   const counter = parent.firstElementChild
//   assert.is(counter.textContent, '1')

//   mount(div, bar())

//   assert.is(div.firstElementChild, parent)
//   assert.is(div.firstElementChild.firstElementChild, counter)
//   assert.is(counter.textContent, '2')

//   assert.is(init, 2)

//   function Parent () {
//     init++
//     return function () {
//       return html`<div>${Component(Counter)}</div>`
//     }
//   }

//   function Counter (state, emit) {
//     init++
//     let value = 0
//     return function () {
//       return html`<output>${++value}</output>`
//     }
//   }

//   function foo () {
//     return html`<div>${Component(Parent)}</div>`
//   }

//   function bar () {
//     return html`<div>${Component(Parent)}</div>`
//   }
// })

// reuse('not possible for unkeyed partial', function () {
//   const div = document.createElement('div')
//   let init = 0

//   mount(div, foo())

//   const counter = div.firstElementChild.firstElementChild
//   assert.is(counter.textContent, '1')

//   mount(div, bar())

//   assert.is.not(div.firstElementChild.firstElementChild, counter)
//   assert.is(div.firstElementChild.firstElementChild.textContent, '1')
//   assert.is(init, 2)

//   function Counter (state, emit) {
//     init++
//     let value = 0
//     return function () {
//       return html`<output>${++value}</output>`
//     }
//   }

//   function foo () {
//     return html`<div>${html`<div>${Component(Counter)}</div>`}</div>`
//   }

//   function bar () {
//     return html`<div>${html`<div>${Component(Counter)}</div>`}</div>`
//   }
// })

test.run()
