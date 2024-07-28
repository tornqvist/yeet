export const WILDCARD = '*'
export const RENDER = 'render'

export class Emitter extends Map {
  /**
   * @param {string} event
   * @param {function(...any): void} fn
   */
  on (event, fn) {
    const listeners = this.get(event)
    if (listeners) listeners.add(fn)
    else this.set(event, new Set([fn]))
  }

  /**
   * @param {string} event
   * @param {function(...any): void} fn
   */
  removeListener (event, fn) {
    const listeners = this.get(event)
    if (listeners) listeners.delete(fn)
  }

  /**
   * @param {string} event
   * @param {...any} args
   */
  emit (event, ...args) {
    if (event !== WILDCARD) {
      this.emit(WILDCARD, event, ...args)
    }
    if (!this.has(event)) return
    for (const fn of this.get(event)) fn(...args)
  }
}
