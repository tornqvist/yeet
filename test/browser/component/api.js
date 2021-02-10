import { suite } from 'uvu'
import * as assert from 'uvu/assert'
import { Partial, Component, html, use, render } from '../../../index.js'

const component = suite('component')
const args = suite('arguments')
const state = suite('state')
const stores = suite('stores')
const lifecycle = suite('lifecycle')

component('inherits partial', function () {
  assert.type(Component, 'function')
})

component('is infinite function', function () {
  assert.type(Component(Function.prototype), 'function')
  assert.instance(Component(Function.prototype), Partial)
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

component.run()
args.run()
state.run()
stores.run()
lifecycle.run()