import { suite } from 'uvu'
import * as assert from 'uvu/assert'
import { html, render, use, Component } from '../../../rewrite.js'

const element = suite('element')
const rerender = suite('rerender')
const fragment = suite('fragment')

element('does not update when shallow', async function () {
  let name = 'planet'
  const div = document.createElement('div')

  render(Component(function (state, emit) {
    return function * () {
      yield Component(() => html`<h1>Hello ${name}!</h1>`)
      if (name === 'planet') {
        name = 'world'
        emit('render')
      }
    }
  }), div)

  assert.is(div.innerHTML, '<h1>Hello planet!</h1>', 'initial render')

  await new Promise(function (resolve) {
    window.requestAnimationFrame(function () {
      assert.is(div.innerHTML, '<h1>Hello planet!</h1>', 'value did not change')
      resolve()
    })
  })
})

element('does update if update function is provided', async function () {
  let name = 'planet'
  const div = document.createElement('div')

  render(Component(function (state, emit) {
    return function * () {
      yield Component(() => () => html`<h1>Hello ${name}!</h1>`)
      if (name === 'planet') {
        name = 'world'
        emit('render')
      }
    }
  }), div)

  assert.is(div.innerHTML, '<h1>Hello planet!</h1>', 'initial render')

  await new Promise(function (resolve) {
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        assert.is(div.innerHTML, '<h1>Hello world!</h1>', 'value changed')
        resolve()
      })
    })
  })
})

rerender('render event does not bubble', async function () {
  let outer = 'foo'
  let inner = 'bar'
  const div = document.createElement('div')

  render(Component(Parent), div)

  assert.is(div.outerHTML, '<div><span>foo</span><span>bar</span></div>', 'initial render')

  await new Promise(function (resolve) {
    window.requestAnimationFrame(function () {
      assert.is(div.outerHTML, '<div><span>foo</span><span>bar</span></div>', 'all unchanged')
      resolve()
    })
  })

  function Parent (state, emit) {
    use(function (state, emitter) {
      emitter.on('render', assert.unreachable)
    })
    return function () {
      return html`<span>${outer}</span>${Component(Child)}`
    }
  }

  function Child (state, emit) {
    return function * () {
      yield html`<span>${inner}</span>`
      if (inner === 'bar') {
        outer = 'bin'
        inner = 'baz'
        emit('render')
      }
    }
  }
})

rerender('update single text node', async function () {
  let value = 'world'
  const div = document.createElement('div')

  render(html`<h1>Hello ${Component(Main)}!</h1>`, div)

  assert.is(div.innerHTML, '<h1>Hello world!</h1>', 'initial render')

  await new Promise(function (resolve) {
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        assert.is(div.innerHTML, '<h1>Hello planet!</h1>', 'value changed')
        resolve()
      })
    })
  })

  function Main (state, emit) {
    return function * () {
      yield html`${value}`
      if (value === 'world') {
        value = 'planet'
        emit('render')
      }
    }
  }
})

fragment('can update fragment', async function () {
  const ul = document.createElement('ul')

  render(Component(Main), ul)

  assert.snapshot(ul.outerHTML, '<ul><li>1</li><li>2</li><li>3</li></ul>', 'initial render')

  await new Promise(function (resolve) {
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        assert.snapshot(ul.outerHTML, '<ul><li>1</li><li>3</li><li>3</li></ul>', 'value changed')
        resolve()
      })
    })
  })

  function Child () {
    return function ({ num }) {
      return html`<li>${num}</li>`
    }
  }

  function Main (state, emit) {
    let num = 2
    return function * () {
      yield html`<li>1</li>${Component(Child, { num })}<li>3</li>`
      if (++num === 3) emit('render')
    }
  }
})

element.run()
rerender.run()
fragment.run()
