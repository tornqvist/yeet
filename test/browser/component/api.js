import { suite } from 'uvu'
import * as assert from 'uvu/assert'
import { Partial, Component } from '../../../index.js'

const exports = suite('exports')
const args = suite('arguments')
const lifecycle = suite('lifecycle')

exports('inherits partial', function () {
  assert.type(Component, 'function')
})

exports('infinite function', function () {
  assert.type(Component(Function.prototype), 'function')
  assert.instance(Component(Function.prototype), Partial)
})

args('should be function', function () {
  const Main = Component(null)
  assert.throws(() => Main.render())
})

args('inital arguments', function () {
  const initialState = {}
  const MyComponent = Component(function (state, emit) {
    assert.is(state, initialState)
    assert.type(emit, 'function')
  })
  MyComponent('test').render(initialState)
})

args('are forwarded', function () {
  const MyComponent = Component(function () {
    return function (str) {
      assert.is(str, 'test')
    }
  })
  MyComponent('test').render()
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

exports.run()
args.run()
lifecycle.run()
