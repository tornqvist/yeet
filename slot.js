/** @type {WeakMap<Node, Node[]>} */
const childNodes = new WeakMap()

/**
 * Create a template slot container
 * @class
 * @param {Node[]} children Current child nodes
 * @param {Node} parent Parent node
 */
export function Slot (children, parent) {
  /** @type {(Node | Slot)[]} */
  let siblings = childNodes.get(parent)
  if (!siblings) childNodes.set(parent, siblings = [...parent.childNodes])

  const index = Math.max(0, siblings.indexOf(children[0]))
  siblings[index] = this

  this.index = index
  this.parent = parent
  this.siblings = siblings

  /** @type {(Node | Slot)[]} */
  this.children = children
}
