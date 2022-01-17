/** @type {WeakMap<Node, Node[]>} */
const childNodes = new WeakMap()

/**
 * Create a template slot container
 * @class
 * @param {Node} placeholder Placeholder node
 */
export function Slot (placeholder) {
  const parent = placeholder.parentNode

  /** @type {(Node | Slot)[]} */
  let siblings = childNodes.get(parent)
  if (!siblings) childNodes.set(parent, siblings = [...parent.childNodes])

  const index = siblings.indexOf(placeholder)
  siblings.splice(index, 1, this)

  this.index = index
  this.parent = parent
  this.siblings = siblings

  /** @type {(Node | Slot)[]} */
  this.children = [placeholder]
}
