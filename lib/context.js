import { WILDCARD, RENDER, Emitter } from './emitter.js'

/** @typedef {import('./component.js').Component} Component */
/** @typedef {import('./fragment.js').Fragment} Fragment */
/** @typedef {import('./partial.js').Partial} Partial */
/** @typedef {function(Partial|Component): void} Editor */

/** @type {WeakMap<Node|Fragment|Component, Context>} */
export const cache = new WeakMap()

/** @type {Context[]} */
export const stack = []

export class Context {
  /**
   * @param {object} state
   * @param {any} key
   */
  constructor(state, key) {
    this.key = key
    this.state = state
    this.emitter = new Emitter()

    /** @type {Editor[]} */
    this.editors = []

    /** @type {(function(): void)[]} */
    this.hooks = []
  }

  /**
   * @param {any} key
   * @returns {Context}
   */
  spawn(key) {
    const child = new Context(Object.create(this.state), key)
    child.emitter.on(WILDCARD, (event, ...args) => {
      if (event !== RENDER) this.emitter.emit(event, ...args)
    })
    return child
  }
}
