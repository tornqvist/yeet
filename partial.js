import {
  FRAGMENT_NODE,
  ELEMENT_NODE,
  COMMENT_NODE,
  PLACEHOLDER,
  assign,
  update,
  entries,
  isArray
} from './utils.js'
import { refs } from './ref.js'
import { Slot } from './slot.js'
import { morph } from './morph.js'
import { cache } from './context.js'
import { Fragment } from './fragment.js'
import { EVENT_PREFIX, EventHandler } from './event-handler.js'

/** @typedef {import('./context.js').Editor} Editor */
/** @typedef {import('./context.js').Context} Context */
/** @typedef {function(Node): Context} CreateCallback */

const TAG = /<[a-z-]+ [^>]+$/i
const COMMENT = /<!--(?!.*-->)/
const LEADING_WHITESPACE = /^\s+(<)/
const TRAILING_WHITESPACE = /(>)\s+$/
const ATTRIBUTE = /<[a-z-]+[^>]*?\s+(([^\t\n\f "'>/=]+)=("|')?)?$/i

/** @type {WeakMap<Array<string>, Node>} */
const templates = new WeakMap()

/**
 * Create a HTML partial object
 * @export
 * @class Partial
 * @param {Array<string>} strings Template strings
 * @param {Array<any>} values Template partials
 * @param {Boolean} isSVG Whether the partial is an SVG node
 */
export function Partial (strings, values, isSVG = false) {
  this.key = strings
  this.strings = strings
  this.values = values
  this.isSVG = isSVG
}

/**
 * Render partial to node
 * @param {Partial} partial Render partial to node
 * @param {Context} ctx Partial context
 * @param {CreateCallback} onupdate Callback when node is to be updated
 * @returns {Node | Fragment}
 */
Partial.prototype.render = function (ctx, onupdate) {
  const template = parse(this)
  const node = template.cloneNode(true)

  if (template.nodeType === ELEMENT_NODE) {
    const editor = createAttributeEditor(node)
    if (editor) ctx.editors.push(editor)
  }

  const walker = document.createTreeWalker(node, 1 | 128, null, false)
  for (let current = walker.nextNode(); current; current = walker.nextNode()) {
    if (isPlaceholder(current)) {
      ctx.editors.push(createNodeEditor(current, ctx))
    } else if (current.nodeType === ELEMENT_NODE) {
      const editor = createAttributeEditor(current)
      if (editor) ctx.editors.push(editor)
    }
  }

  update(ctx, this)

  return node.nodeType === FRAGMENT_NODE ? new Fragment(this.key, node) : node
}

/**
 * Parse partial
 * @export
 * @param {Partial} partial The partial to parse
 * @returns {Node}
 */
function parse (partial) {
  const { strings, isSVG } = partial
  let template = templates.get(strings)
  if (template) return template

  const { length } = strings
  let html = strings.reduce(function compile (html, string, index) {
    html += string
    if (index === length - 1) return html
    if (ATTRIBUTE.test(html) || COMMENT.test(html)) html += `yeet-${index}`
    else if (TAG.test(html)) html += `data-yeet-${index}`
    else html += `<!--yeet-${index}-->`
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
 * Create a node editor function
 * @param {Node} placeholder The placeholder node
 * @returns {Editor}
 */
function createNodeEditor (placeholder, ctx) {
  const id = +placeholder.nodeValue.match(PLACEHOLDER)[1]
  const slot = new Slot(placeholder)

  return function nodeEditor (partial) {
    morph(slot, partial.values[id], function render (partial, onupdate) {
      const child = ctx.spawn(partial.key)
      const node = partial.render(child, onupdate)
      if (node) cache.set(node, child)
      return node
    })
  }
}

/**
 * Create an attribute editor function
 * @param {Node} template Template node
 * @param {Node} node Target node
 * @returns {Editor | null}
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
