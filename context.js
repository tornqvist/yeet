import { WILDCARD, RENDER, Emitter } from './emitter.js'

/** @typedef {function(import('./partial.js').Partial): void} Editor */

/** @type {WeakMap<Node, Context>} */
export const cache = new WeakMap()

/** @type {Context[]} */
export const stack = []

/**
 * Create a partial context object
 * @export
 * @class Context
 * @param {any} key Partial key
 * @param {object} state Context state
 */
export class Context {
  constructor (key, state) {
    this.key = key
    this.state = state
    this.emitter = new Emitter()

    /** @type {Editor[]} Attached editors */
    this.editors = []

    /** @type {function(...any): void} Emit event to context emitter */
    this.emit = this.emitter.emit.bind(this.emitter)
  }

  /**
   * Create a new context inheriting from this one
   * @param {any} key New context key
   * @returns {Context}
   */
  spawn (key) {
    const child = new Context(key, Object.create(this.state))
    child.emitter.on(WILDCARD, (event, ...args) => {
      if (event !== RENDER) this.emit(event, ...args)
    })
    return child
  }
}
