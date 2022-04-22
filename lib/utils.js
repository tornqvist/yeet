import { EVENT_PREFIX, EventHandler } from './event-handler.js'
import { stack, cache } from './context.js'
import { DISCONNECT } from './emitter.js'
import { Fragment } from './fragment.js'
import { Slot } from './slot.js'
import { refs } from './ref.js'

/** @typedef {import('./partial.js').Partial} Partial */
/** @typedef {import('./context.js').Editor} Editor */

const TAG = /<[a-z-]+ [^>]+$/i
const COMMENT = /<!--(?!.*-->)/
const LEADING_WHITESPACE = /^\s+(<)/
const TRAILING_WHITESPACE = /(>)\s+$/
const ATTRIBUTE = /<[a-z-]+[^>]*?\s+(([^\t\n\f "'>/=]+)=("|')?)?$/i

/** @type {WeakMap<Array<string>, Node>} */
const templates = new WeakMap()

export const TEXT_NODE = 3
export const ELEMENT_NODE = 1
export const COMMENT_NODE = 8
export const FRAGMENT_NODE = 11
export const PLACEHOLDER = /yeet-(\w+)-(\d+)/

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
 * Throttle given function to only execute once per frame
 * @param {function(...any): void} fn The function to throttle
 * @returns {function(...any): void}
 */
export function throttle (fn) {
  let scheduled = false
  return function (...args) {
    if (scheduled) return
    scheduled = true
    window.requestAnimationFrame(function () {
      scheduled = false
      fn(...args)
    })
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
    onremove(node)
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
    onremove(oldNode)
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
 * Determine whether node is a placeholder node
 * @param {Node} node The node to test
 * @returns {Boolean}
 */
export function isPlaceholder (node) {
  const { nodeValue, nodeType } = node
  if (nodeType !== COMMENT_NODE) return false
  const match = nodeValue.match(PLACEHOLDER)
  return match && match[1] === 'node'
}

/**
 * Get placeholder id
 * @param {Node} node The placeholder node
 * @returns {number}
 */
export function getPlaceholderId (node) {
  return +node.nodeValue.match(PLACEHOLDER)[2]
}

/**
 * Parse partial
 * @param {Partial} partial The partial to parse
 * @returns {Node}
 */
export function parse (partial) {
  const { strings, isSVG } = partial
  let template = templates.get(strings)
  if (template) return template

  const { length } = strings
  let html = strings.reduce(function compile (html, string, index) {
    html += string
    if (index === length - 1) return html
    if (ATTRIBUTE.test(html)) html += `yeet-value-${index}`
    else if (TAG.test(html)) html += `yeet-attribute-${index}`
    else if (COMMENT.test(html)) html += `yeet-text-${index}`
    else html += `<!--yeet-node-${index}-->`
    return html
  }, '').replace(LEADING_WHITESPACE, '$1').replace(TRAILING_WHITESPACE, '$1')

  const wrap = isSVG && !html.startsWith('<svg')
  if (wrap) html = `<svg>${html}</svg>`

  template = document.createElement('template')
  template.innerHTML = html
  template = template.content
  if (template.childNodes.length === 1 && !isPlaceholder(template.firstChild)) {
    template = template.firstChild
    if (wrap) template = template.firstChild
  }

  templates.set(strings, template)

  return template
}

/**
 * Create an attribute editor function
 * @param {Node} node Target node
 * @param {object[]} attributes Attributes to edit
 * @param {string} attributes[].name Attribute name
 * @param {string} attributes[].value Attribute value
 * @returns {Editor}
 */
export function createAttributeEditor (node, attributes) {
  return function attributeEditor (partial) {
    const attrs = attributes.reduce(function (attrs, { name, value }) {
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
export function resolvePlaceholders (str, values) {
  const [match, , id] = str.match(PLACEHOLDER)
  if (match === str) return values[+id]
  const pattern = new RegExp(PLACEHOLDER, 'g')
  return str.replace(pattern, (_, type, id) => values[+id])
}

/**
 * Find next non-null sibling to slot
 * @param {Node[]} nodes List of nodes to search
 * @param {number} [index=0] Index of node to start search from
 * @returns {Node | void}
 */
export function findNext (nodes, index = 0) {
  for (let i = index, len = nodes.length; i < len; i++) {
    let next = nodes[i]
    if (next instanceof Slot) next = findNext(next.siblings, next.index + 1)
    if (next instanceof Fragment) next = findNext(next.children)
    if (next) return next
  }
}

/**
 * Get children from container
 * @param {Slot | Fragment} container Container to get from
 * @returns {Node[]}
 */
export function getChildren (container) {
  if (container instanceof Fragment) return container.children
  if (container instanceof Slot) return container.children.flatMap(getChildren)
  return [container]
}

/**
 * Walk the DOM tree calling onunmout on every context encountered
 * @param {Node} node The DOM node being removed
 */
function onremove (node) {
  const ctx = cache.get(node)
  if (ctx) ctx.emit(DISCONNECT)
}
