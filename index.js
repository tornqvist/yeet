import { Component as ComponentClass } from './lib/component.js'
import { Partial } from './lib/partial.js'
import { stack } from './lib/context.js'
import { Ref } from './lib/ref.js'

/** @typedef {import('./lib/emitter.js').Emitter} Emitter */
/** @typedef {import('./lib/component.js').Init} Init */

/**
 * Create HTML partial
 * @param {TemplateStringsArray} strings Template literal strings
 * @param {...any} values Template literal values
 * @returns {Partial}
 */
export function html (strings, ...values) {
  return new Partial(strings, values, { isSVG: false })
}

/**
 * Create SVG partial
 * @param {TemplateStringsArray} strings Template literal strings
 * @param {...any} values Template literal values
 * @returns {Partial}
 */
export function svg (strings, ...values) {
  return new Partial(strings, values, { isSVG: true })
}

/**
 * Treat raw HTML string as partial, bypassing HTML escape behavior
 * @param {any} value HTML string
 * @returns {Partial}
 */
export function raw (value) {
  return new Partial([String(value)], [], { key: value })
}

/**
 * Create component
 * @param {Init} init
 * @returns {function(...any): ComponentClass}
 */
export function Component(init) {
  return function createComponent(...args) {
    return new ComponentClass(init, ...args)
  }
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
 * @template T
 * @param {function(object, Emitter): T} fn Store function
 * @returns {T}
 */
export function use (fn) {
  const [{ state, emitter }] = stack
  return fn(state, emitter)
}

export { render } from './lib/render.js'
export { mount } from './lib/mount.js'
export { Partial, Ref }
