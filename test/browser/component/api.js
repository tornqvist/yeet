import { suite } from 'uvu'
import * as assert from 'uvu/assert'
import { Partial, Component, html, use, render, mount } from '../../../index.js'

const component = suite('component')
const args = suite('arguments')
const state = suite('state')
const stores = suite('stores')
const lifecycle = suite('lifecycle')

component('inherits partial', function () {
  assert.type(Component, 'function')
  assert.ok(Object.isPrototypeOf.call(Partial.prototype, Component.prototype))
})

component('returns component object', function () {
  const fn = Component(Function.prototype)
  assert.type(fn, 'function')
  const res = fn()
  assert.instance(res, Partial)
  assert.instance(res, Component)
})

args('should be function', function () {
  const Main = Component(null)
  assert.throws(() => render(Main))
})

args('inital arguments', function () {
  const MyComponent = Component(function (state, emit) {
    assert.type(state, 'object')
    assert.type(emit, 'function')
  })
  render(MyComponent('test'))
})

args('are forwarded', function () {
  const MyComponent = Component(function () {
    return function (str) {
      assert.is(str, 'test')
    }
  })
  render(MyComponent('test'))
})

args('can be provided on declaration', function () {
  const MyComponent = Component(Main, 'world')
  render(MyComponent)
  function Main () {
    return (name) => assert.is(name, 'world')
  }
})

args('can be supplied when calling', function () {
  const MyComponent = Component(Main)
  render(MyComponent('world'))
  function Main () {
    return (name) => assert.is(name, 'world')
  }
})

args('provided when called override declaration arguments', function () {
  const MyComponent = Component(Main, 'world')
  render(MyComponent('planet'))
  function Main () {
    return (name) => assert.is(name, 'planet')
  }
})

state('is inherited', function () {
  render(html`
    <div>
      ${Component(function (rootState, emit) {
        return function () {
          return html`
            <div>
              ${Component(function (innerState, emit) {
                assert.is.not(innerState, rootState)
                assert.ok(Object.isPrototypeOf.call(rootState, innerState))
              })}
            </div>
          `
        }
      })}
    </div>
  `)
})

state('is mutable', function () {
  const initialState = {}
  const MyComponent = Component(function (state, emit) {
    assert.is(state, initialState)
    state.test = 'test'
  })
  render(MyComponent('test'), initialState)
  assert.is(initialState.test, 'test')
})

stores('arguments', function () {
  render(Component(function (rootState, emit) {
    use(function (innerState, emitter) {
      assert.is(innerState, rootState)
      assert.type(emitter, 'object')
      assert.type(emitter.on, 'function')
      assert.type(emitter.emit, 'function')
      assert.type(emitter.removeListener, 'function')
    })
  }))
})

stores('can return', function () {
  render(Component(function (state, emit) {
    assert.is('test', use(() => 'test'))
  }))
})

stores('can listen for events', function () {
  let count = 0
  render(Component(function (state, emit) {
    use(function (state, emitter) {
      emitter.on('test', function (value) {
        assert.is(++count, 2)
        assert.is(value, 'value')
      })

      const fail = assert.unreachable
      emitter.on('test', fail)
      emitter.removeListener('test', fail)

      emitter.on('*', function (event, value) {
        assert.is(++count, 1)
        assert.is(event, 'test')
        assert.is(value, 'value')
      })
    })

    return function () {
      emit('test', 'value')
    }
  }))
  assert.is(count, 2)
})

stores('events bubble', function () {
  let count = 0
  render(html`
    <div>
      ${Component(function () {
        use(function (state, emitter) {
          emitter.on('test', function (value) {
            count++
            assert.is(value, 'value')
          })
        })
        return function () {
          return html`
            <div>
              ${Component(function (state, emit) {
                use(function (state, emitter) {
                  emitter.on('test', function (value) {
                    count++
                    assert.is(value, 'value')
                  })
                })
                emit('test', 'value')
              })}
            </div>
          `
        }
      })}
    </div>
  `)
  assert.is(count, 2)
})

lifecycle('resolves top level promises', async function () {
  const res = render(html`<h1>Hello ${Component(Main)}!</h1>`)
  assert.is(res.outerHTML, '<h1>Hello !</h1>')
  await new Promise((resolve) => setTimeout(resolve, 400))
  assert.is(res.outerHTML, '<h1>Hello world!</h1>')

  function * Main () {
    yield new Promise((resolve) => setTimeout(resolve, 100))
    const value = yield new Promise((resolve) => setTimeout(resolve, 100, 'world'))
    yield new Promise((resolve) => setTimeout(resolve, 100))
    return value
  }
})

lifecycle('resolves nested promises', async function () {
  const res = render(html`<h1>Hello ${Component(Main)}!</h1>`)
  assert.is(res.outerHTML, '<h1>Hello !</h1>')
  await new Promise((resolve) => setTimeout(resolve, 400))
  assert.is(res.outerHTML, '<h1>Hello world!</h1>')

  function Main () {
    return function * () {
      yield new Promise((resolve) => setTimeout(resolve, 100))
      const value = yield new Promise((resolve) => setTimeout(resolve, 100, 'world'))
      yield new Promise((resolve) => setTimeout(resolve, 100))
      return value
    }
  }
})

lifecycle('unwinds nested functions', function () {
  let depth = 0
  render(Component(function (state, emit) {
    assert.is(++depth, 1)
    return function (str) {
      assert.is(++depth, 2)
      return function () {
        assert.is(++depth, 3)
      }
    }
  }))
  assert.is(depth, 3)
})

lifecycle('resolves generators', async function () {
  let setup = 0
  let update = 0
  let render = 0
  let unmount = 0
  const div = document.createElement('div')

  await new Promise(function (resolve, reject) {
    mount(div, html`<div>${Component(Main)}</div>`)
    assert.is(setup, 1, 'setup called once')
    assert.is(update, 0, 'update not called yet')
    assert.is(render, 1, 'render called once')
    assert.is(unmount, 0, 'unmount not called')
    assert.is(div.outerHTML, '<div><h1>Hello planet!</h1></div>')
    window.requestAnimationFrame(function () {
      assert.is(update, 1, 'update called in next frame')
      resolve()
    })
  })

  await new Promise(function (resolve, reject) {
    mount(div, html`<div>${Component(Main)}</div>`)
    assert.is(setup, 1, 'setup still only called once')
    assert.is(update, 1, 'update still only called once')
    assert.is(render, 2, 'render called twice')
    assert.is(unmount, 0, 'unmount still not called')
    window.requestAnimationFrame(function () {
      assert.is(update, 2, 'update called again in next frame')
      resolve()
    })
  })

  await new Promise(function (resolve) {
    mount(div, html`<div><h1>Hello world!</h1></div>`)
    window.requestAnimationFrame(function () {
      assert.is(unmount, 1, 'unmount called once')
      resolve()
    })
  })

  function * Main (state, emit) {
    setup++
    yield function * onupdate (str) {
      yield function * onrender () {
        yield html`<h1>Hello planet!</h1>`
        render++
      }
      update++
    }
    unmount++
  }
})

lifecycle('children unmount w/ parent', async function () {
  let counter = 0
  const div = document.createElement('div')

  mount(div, html`<div>${Component(Parent)}</div>`)
  await new Promise(function (resolve) {
    mount(div, html`<div><h1>Hello world!</h1></div>`)
    window.requestAnimationFrame(function () {
      assert.is(counter, 2)
      resolve()
    })
  })

  function * Parent () {
    yield function () {
      return html`<div>${Component(Child)}</div>`
    }
    counter++
  }

  function * Child () {
    yield function () {
      return html`<h1>Hello planet!</h1>`
    }
    counter++
  }
})

component.run()
args.run()
state.run()
stores.run()
lifecycle.run()
