import { Partial } from './lib/partial.js'
import { stack } from './lib/context.js'
import { Ref } from './lib/ref.js'

/** @typedef {import('./lib/emitter.js').Emitter} Emitter */

/**
 * Create HTML partial
 * @param {Array<string>} strings Template literal strings
 * @param {...any} values Template literal values
 * @returns {Partial}
 */
export function html (strings, ...values) {
  return new Partial(strings, values)
}

/**
 * Create SVG partial
 * @param {Array<string>} strings Template literal strings
 * @param {...any} values Template literal values
 * @returns {Partial}
 */
export function svg (strings, ...values) {
  return new Partial(strings, values, true)
}

/**
 * Treat raw HTML string as partial, bypassing HTML escape behavior
 * @param {any} value HTML string
 * @returns {Partial}
 */
export function raw (value) {
  return new Partial([String(value)], [])
}

/**
 * Create element reference
 * @returns {Ref}
 */
export function ref () {
  return new Ref()
}

/**
 * Use store with current component
 * @template Value
 * @param {function(object, Emitter): Value} fn Store function
 * @returns {Value}
 */
export function use (fn) {
  const [{ state, emitter }] = stack
  return fn(state, emitter)
}

export { Component } from './lib/component.js'
export { render } from './lib/render.js'
export { mount } from './lib/mount.js'
export { Partial, Ref }
