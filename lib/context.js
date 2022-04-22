import { DISCONNECT, WILDCARD, RENDER, Emitter } from './emitter.js'

/** @typedef {import('./partial.js').Partial} Partial */
/** @typedef {function(Partial): void} Editor */

/** @type {WeakMap<Node, Context>} */
export const cache = new WeakMap()

/** @type {Context[]} */
export const stack = []

/**
 * Create a partial context object
 * @class Context
 * @param {any} key Partial key
 * @param {object} state Context state
 */
export class Context {
  constructor (key, state) {
    this.key = key
    this.state = state
    this.emitter = new Emitter()

    /** @type {Set<Context>} Child contexts */
    this.children = new Set()

    /** @type {Editor[]} Attached editors */
    this.editors = []

    /** @type {function(...any): void} Emit event to context emitter */
    this.emit = this.emitter.emit.bind(this.emitter)

    this.emitter.on(DISCONNECT, () => {
      for (const child of this.children) {
        child.emitter.emit(DISCONNECT)
      }
    })
  }

  /**
   * Create a new context inheriting from this one
   * @param {any} key New context key
   * @returns {Context}
   */
  spawn (key) {
    const child = new Context(key, Object.create(this.state))
    this.children.add(child)
    child.emitter.on(DISCONNECT, () => this.children.delete(child))
    child.emitter.on(WILDCARD, (event, ...args) => {
      if (event !== RENDER) this.emit(event, ...args)
    })
    return child
  }
}
