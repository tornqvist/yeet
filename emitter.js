export const WILDCARD = '*'
export const RENDER = 'render'

/**
 * Generic event emitter
 * @class Emitter
 * @extends {Map}
 */
export class Emitter extends Map {
  /**
   * Attach listener for event
   * @param {string} event Event name
   * @param {function(...any): void} fn Event listener function
   */
  on (event, fn) {
    const listeners = this.get(event)
    if (listeners) listeners.add(fn)
    else this.set(event, new Set([fn]))
  }

  /**
   * Remove given listener for event
   * @param {string} event Event name
   * @param {function(...any): void} fn Registered listener
   */
  removeListener (event, fn) {
    const listeners = this.get(event)
    if (listeners) listeners.delete(fn)
  }

  /**
   * Emit event to all listeners
   * @param {string} event Event name
   * @param {...any} args Event parameters to be forwarded to listeners
   */
  emit (event, ...args) {
    if (event !== WILDCARD) this.emit(WILDCARD, event, ...args)
    if (!this.has(event)) return
    for (const fn of this.get(event)) fn(...args)
  }
}
