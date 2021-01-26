import { suite } from 'uvu'
import * as assert from 'uvu/assert'
import { Partial, Component, use } from '../../../index.js'

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
  assert.throws(() => Main.render())
})

args('inital arguments', function () {
  const MyComponent = Component(function (state, emit) {
    assert.type(state, 'object')
    assert.type(emit, 'function')
  })
  MyComponent('test').render()
})

args('are forwarded', function () {
  const MyComponent = Component(function () {
    return function (str) {
      assert.is(str, 'test')
    }
  })
  MyComponent('test').render()
})

state('is inherited', function () {
  Component(function (rootState, emit) {
    return Component(function (innerState, emit) {
      assert.is.not(innerState, rootState)
      assert.ok(Object.isPrototypeOf.call(rootState, innerState))
    })
  }).render()
})

state('is mutable', function () {
  const initialState = {}
  const MyComponent = Component(function (state, emit) {
    assert.is(state, initialState)
    state.test = 'test'
  })
  MyComponent('test').render(initialState)
  assert.is(initialState.test, 'test')
})

stores('arguments', function () {
  Component(function (rootState, emit) {
    use(function (innerState, emitter) {
      assert.is(innerState, rootState)
      assert.type(emitter, 'object')
      assert.type(emitter.on, 'function')
      assert.type(emitter.emit, 'function')
      assert.type(emitter.removeListener, 'function')
    })
  }).render()
})

stores('can return', function () {
  Component(function (state, emit) {
    assert.is('test', use(() => 'test'))
  }).render()
})

stores('can listen for events', function () {
  let count = 0
  Component(function (state, emit) {
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
  }).render()
  assert.is(count, 2)
})

lifecycle('unwinds nested functions', function () {
  let depth = 0
  Component(function (state, emit) {
    assert.is(++depth, 1)
    return function (str) {
      assert.is(++depth, 2)
      return function () {
        assert.is(++depth, 3)
      }
    }
  }).render()
  assert.is(depth, 3)
})

component.run()
args.run()
state.run()
stores.run()
lifecycle.run()
