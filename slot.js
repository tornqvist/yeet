import { isArray } from './utils.js'

/** @type {WeakMap<Node, Node[]>} */
const childNodes = new WeakMap()

/**
 * Create a template slot container
 * @class
 * @param {number} id The slot positional id
 * @param {Node} node Current node
 */
export function Slot (id, node) {
  const parent = node.parentNode

  /** @type {(Node | Slot)[]} */
  let siblings = childNodes.get(parent)
  if (!siblings) childNodes.set(parent, siblings = [...parent.childNodes])

  const index = siblings.indexOf(node)
  const children = isArray(node) ? node : [node]

  siblings.splice(index, 1, this)

  this.id = id
  this.index = index
  this.parent = parent
  this.siblings = siblings
  this.children = children
}
