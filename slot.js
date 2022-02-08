/** @type {WeakMap<Node, Node[]>} */
export const slots = new WeakMap()

/**
 * Create a template slot container
 * @class
 * @param {Node[]} children Current child nodes
 * @param {Node} parent Parent node
 */
export function Slot (children, parent) {
  /** @type {(Node | Slot)[]} */
  let siblings = slots.get(parent)
  if (!siblings) slots.set(parent, siblings = [...parent.childNodes])

  const index = children.length
    ? siblings.includes(children[0])
        ? siblings.indexOf(children[0])
        : siblings.length
    : siblings.length
  siblings[index] = this

  this.index = index
  this.parent = parent
  this.siblings = siblings

  /** @type {(Node | Slot)[]} */
  this.children = children
}
