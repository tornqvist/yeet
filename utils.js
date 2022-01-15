import { EVENT_PREFIX, EventHandler } from './event-handler.js'
import { stack, cache } from './context.js'
import { refs } from './ref.js'

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
 * @returns {Node}
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
 * Determine whether node is a placeholder node
 * @param {Node} node The node to test
 * @returns {Boolean}
 */
export function isPlaceholder (node) {
  const { nodeValue, nodeType } = node
  return nodeType === COMMENT_NODE && PLACEHOLDER.test(nodeValue)
}

/**
 * Get placeholder id
 * @param {Node} node The placeholder node
 * @returns {number}
 */
export function getPlaceholderId (node) {
  return +node.nodeValue.match(PLACEHOLDER)[1]
}

/**
 * Create an attribute editor function
 * @param {Node} template Template node
 * @param {Node} node Target node
 * @returns {import('./context.js').Editor}
 */
export function createAttributeEditor (node) {
  const placeholders = []

  for (const { name, value } of [...node.attributes]) {
    if (PLACEHOLDER.test(name) || PLACEHOLDER.test(value)) {
      placeholders.push({ name, value })
      node.removeAttribute(name)
    }
  }

  if (!placeholders.length) return null

  /** @type {import('./context.js').Editor} */
  return function attributeEditor (partial) {
    const attrs = placeholders.reduce(function (attrs, { name, value }) {
      name = PLACEHOLDER.test(name)
        ? resolvePlaceholders(name, partial.values)
        : name
      value = PLACEHOLDER.test(value)
        ? resolvePlaceholders(value, partial.values)
        : value
      if (typeof name === 'object') {
        if (isArray(name)) {
          for (const value of name.flat()) {
            if (typeof value === 'object') assign(attrs, value)
            else attrs[value] = ''
          }
        } else {
          assign(attrs, name)
        }
      } else if (EVENT_PREFIX.test(name)) {
        const events = EventHandler.get(node)
        events.set(name, value)
      } else if (name === 'ref') {
        if (typeof value === 'function') value(node)
        else refs.set(value, node)
      } else if (value != null) {
        attrs[name] = value
      }
      return attrs
    }, {})

    for (let [name, value] of entries(attrs)) {
      if (isArray(value)) value = value.join(' ')
      if (name in node) {
        node[name] = value
      } else if (node.getAttribute(name) !== value) {
        node.setAttribute(name, value)
      }
    }
  }
}

/**
 * Resolve values from placeholder string
 * @param {string} str String from which to match values
 * @param {any[]} values List of values to replace placeholders with
 * @returns {any}
 */
function resolvePlaceholders (str, values) {
  const [match, id] = str.match(PLACEHOLDER)
  if (match === str) return values[+id]
  const pattern = new RegExp(PLACEHOLDER, 'g')
  return str.replace(pattern, (_, id) => values[+id])
}

/**
 * Find next non-null item in nested list
 * @param {number} index Current item index
 * @param {any[]} list List of nested items
 * @returns {any}
 */
export function findFrom (index, list) {
  for (let next, i = index, len = list.length; i < len; i++) {
    next = list[i]
    if (isArray(next)) next = findFrom(0, next)
    if (next) return next
  }
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
