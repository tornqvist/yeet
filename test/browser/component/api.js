import { suite } from 'uvu'
import * as assert from 'uvu/assert'
import { Partial, Component, html, use, render } from '../../../rewrite.js'

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
  const div = document.createElement('div')
  const MyComponent = Component(function (state, emit) {
    assert.type(state, 'object')
    assert.type(emit, 'function')
  })
  render(MyComponent('test'), div)
})

args('are forwarded', function () {
  const div = document.createElement('div')
  const MyComponent = Component(function () {
    return function (str) {
      assert.is(str, 'test')
    }
  })
  render(MyComponent('test'), div)
})

args('can be provided on declaration', function () {
  const div = document.createElement('div')
  const MyComponent = Component(Main, 'world')
  render(MyComponent, div)
  function Main () {
    return (name) => assert.is(name, 'world')
  }
})

args('can be supplied when calling', function () {
  const div = document.createElement('div')
  const MyComponent = Component(Main)
  render(MyComponent('world'), div)
  function Main () {
    return (name) => assert.is(name, 'world')
  }
})

args('provided when called override declaration arguments', function () {
  const div = document.createElement('div')
  const MyComponent = Component(Main, 'world')
  render(MyComponent('planet'), div)
  function Main () {
    return (name) => assert.is(name, 'planet')
  }
})

state('is inherited', function () {
  const div = document.createElement('div')
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
  `, div)
})

state('is mutable', function () {
  const initialState = {}
  const div = document.createElement('div')
  const MyComponent = Component(function (state, emit) {
    assert.is(state, initialState)
    state.test = 'test'
  })
  render(MyComponent('test'), div, initialState)
  assert.is(initialState.test, 'test')
})

stores('arguments', function () {
  const div = document.createElement('div')
  render(Component(function (rootState, emit) {
    use(function (innerState, emitter) {
      assert.is(innerState, rootState)
      assert.type(emitter, 'object')
      assert.type(emitter.on, 'function')
      assert.type(emitter.emit, 'function')
      assert.type(emitter.removeListener, 'function')
    })
  }), div)
})

stores('can return', function () {
  const div = document.createElement('div')
  render(Component(function (state, emit) {
    assert.is('test', use(() => 'test'))
  }), div)
})

stores('can listen for events', function () {
  let count = 0
  const div = document.createElement('div')
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
  }), div)
  assert.is(count, 2)
})

stores('events bubble', function () {
  const div = document.createElement('div')
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
  `, div)
  assert.is(count, 2)
})

lifecycle('resolves top level promises', async function () {
  const div = document.createElement('div')
  render(html`<h1>Hello ${Component(Main)}!</h1>`, div)
  assert.is(div.innerHTML, '<h1>Hello !</h1>')
  await new Promise((resolve) => setTimeout(resolve, 400))
  assert.is(div.innerHTML, '<h1>Hello world!</h1>')

  function * Main () {
    yield new Promise((resolve) => setTimeout(resolve, 100))
    const value = yield new Promise((resolve) => setTimeout(resolve, 100, 'world'))
    yield new Promise((resolve) => setTimeout(resolve, 100))
    return value
  }
})

lifecycle('resolves nested promises', async function () {
  const div = document.createElement('div')
  render(html`<h1>Hello ${Component(Main)}!</h1>`, div)
  assert.is(div.innerHTML, '<h1>Hello !</h1>')
  await new Promise((resolve) => setTimeout(resolve, 400))
  assert.is(div.innerHTML, '<h1>Hello world!</h1>')

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
  const div = document.createElement('div')
  render(Component(function (state, emit) {
    assert.is(++depth, 1)
    return function (str) {
      assert.is(++depth, 2)
      return function () {
        assert.is(++depth, 3)
      }
    }
  }), div)
  assert.is(depth, 3)
})

lifecycle('resolves generators', async function () {
  const div = document.createElement('div')
  const count = {
    setup: 0,
    update: 0,
    render: 0,
    unmount: 0
  }

  await new Promise(function (resolve, reject) {
    let removed = false

    render(Component(function (state, emit) {
      return function * () {
        yield removed ? null : Component(Main)
        if (!removed) {
          removed = true
          emit('render')
        }
      }
    }), div)

    assert.not(removed, 'has not rerendered')
    assert.equal(count, {
      setup: 1,
      update: 0,
      render: 1,
      unmount: 0
    }, 'is rendering')
    assert.is(div.outerHTML, '<div><h1>Hello planet!</h1></div>')

    window.requestAnimationFrame(function () {
      assert.ok(removed, 'has rerendered')
      assert.equal(count, {
        setup: 1,
        update: 1,
        render: 1,
        unmount: 0
      }, 'has finnished rendering')
      resolve()
    })
  })

  await new Promise(function (resolve, reject) {
    window.requestAnimationFrame(function () {
      assert.equal(count, {
        setup: 1,
        update: 1,
        render: 1,
        unmount: 1
      }, 'has rendered twice and unmounted')
      resolve()
    })
  })

  function * Main (state, emit) {
    count.setup++
    yield function * onupdate (str) {
      yield function * onrender () {
        yield html`<h1>Hello planet!</h1>`
        count.render++
      }
      count.update++
    }
    count.unmount++
  }
})

lifecycle('children unmount w/ parent', async function () {
  const div = document.createElement('div')
  let counter = 0

  await new Promise(function (resolve) {
    let removed = false

    render(Component(function (state, emit) {
      return function * () {
        yield removed ? null : Component(Parent)
        if (!removed) {
          removed = true
          emit('render')
        }
      }
    }), div)

    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        assert.is(counter, 2)
        resolve()
      })
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
