/** @typedef {import('./slot.js').Slot} Slot */

export class Fragment {
  /**
   * @param {any} key
   * @param {(Node|Slot|null)[]} children
   */
  constructor (key, children) {
    this.key = key
    this.children = children
  }
}
