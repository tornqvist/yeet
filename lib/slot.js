/** @type {WeakMap<Element, (Node|Slot)[]>} */
export const slots = new WeakMap()

/** @typedef {import('./fragment.js').Fragment} Fragment */
/** @typedef {import('./component.js').Component} Component */

export class Slot {
  /**
   * @param {Element} parent
   * @param {number} index
   * @param {(Node|Slot|Fragment|Component)[]} children
   */
  constructor(parent, index, children) {
    let siblings = slots.get(parent)
    if (!siblings) {
      siblings = [...parent.childNodes]
      slots.set(parent, siblings)
    }

    siblings.splice(index, children.length, this)

    this.children = children
    this.siblings = siblings
    this.parent = parent
    this.index = index
  }
}
