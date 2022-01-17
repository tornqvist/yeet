import { stack, cache } from './context.js'

export const TEXT_NODE = 3
export const ELEMENT_NODE = 1
export const COMMENT_NODE = 8
export const FRAGMENT_NODE = 11
export const PLACEHOLDER = /^yeet-(\d+)$/

export const { assign, keys, entries } = Object
export const { isArray } = Array

/**
 * Execute context editors with partial values
 * @param {Context} ctx Context which to update
 * @param {Partial} partial Partial with which to update
 */
export function update (ctx, partial) {
  try {
    stack.unshift(ctx.state)
    for (const editor of ctx.editors) editor(partial)
  } finally {
    stack.shift()
  }
}

/**
 * Remove node
 * @param {Node|Node[]} node Node to remove
 */
export function remove (node) {
  if (isArray(node)) {
    node.forEach(remove)
  } else if (node) {
    node.remove()
    onunmount(node)
  }
}

/**
 * Replace node
 * @param {Node|Node[]} oldNode Node to be replaced
 * @param {Node} newNode New node to insert
 */
export function replace (oldNode, newNode) {
  if (isArray(oldNode)) {
    remove(oldNode.slice(1))
    replace(oldNode[0], newNode)
  } else {
    oldNode.replaceWith(newNode)
    onunmount(oldNode)
  }
}

/**
 * Cast value to node
 * @param {any} value The value to be cast
 * @returns {Node | null}
 */
export function toNode (value) {
  if (value == null) return null
  if (value instanceof window.Node) return value
  if (isArray(value)) {
    const fragment = document.createDocumentFragment()
    for (const node of value) fragment.append(toNode(node))
    return fragment
  }
  return document.createTextNode(String(value))
}

/**
 * Walk the DOM tree calling onunmout on every context encountered
 * @param {Node} node The DOM node being unmounted
 */
function onunmount (node) {
  const walker = document.createTreeWalker(node, 1 | 4 | 128, null, false)
  let current = walker.nextNode()
  while (current) {
    const ctx = cache.get(current)
    if (ctx?.onunmount) ctx.onunmount()
    current = walker.nextNode()
  }
}
