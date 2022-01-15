import { Partial } from './partial.js'
import { Ref } from './ref.js'

/**
 * @callback Editor
 * @param {Partial} partial
 */

/**
 * Create HTML partial
 * @export
 * @param {Array<string>} strings Template literal strings
 * @param {...any} values Template literal values
 * @returns {Partial}
 */
export function html (strings, ...values) {
  return new Partial(strings, values)
}

/**
 * Create SVG partial
 * @export
 * @param {Array<string>} strings Template literal strings
 * @param {...any} values Template literal values
 * @returns {Partial}
 */
export function svg (strings, ...values) {
  return new Partial(strings, values, true)
}

/**
 * Treat raw HTML string as partial, bypassing HTML escape behavior
 * @export
 * @param {any} value HTML string
 * @returns {Partial}
 */
export function raw (value) {
  return new Partial([String(value)], [])
}

/**
 * Create element reference
 * @export
 * @returns {Ref}
 */
export function ref () {
  return new Ref()
}

export { Component } from './component.js'
export { render } from './render.js'
// export { mount } from './mount.js'
