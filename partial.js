import {
  FRAGMENT_NODE,
  ELEMENT_NODE,
  PLACEHOLDER,
  createAttributeEditor,
  getPlaceholderId,
  isPlaceholder,
  update,
  parse
} from './utils.js'
import { Slot } from './slot.js'
import { morph } from './morph.js'
import { Fragment } from './fragment.js'

/** @typedef {import('./context.js').Editor} Editor */
/** @typedef {import('./morph.js').onupdate} onupdate */
/** @typedef {import('./morph.js').render} render */

/**
 * Create a HTML partial object
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
 * @param {Context} ctx Partial context
 * @param {render} render Callback for rendering nested partial
 * @returns {Node | Fragment}
 */
Partial.prototype.render = function (ctx, render) {
  const template = parse(this)
  const node = template.cloneNode(true)

  if (template.nodeType === ELEMENT_NODE) {
    const editor = getAttributeEditor(node)
    if (editor) ctx.editors.push(editor)
  }

  const walker = document.createTreeWalker(node, 1 | 128, null, false)
  for (let current = walker.nextNode(); current; current = walker.nextNode()) {
    if (isPlaceholder(current)) {
      ctx.editors.push(createNodeEditor(current, ctx, render))
    } else if (current.nodeType === ELEMENT_NODE) {
      const editor = getAttributeEditor(current)
      if (editor) ctx.editors.push(editor)
    }
  }

  update(ctx, this)

  return node.nodeType === FRAGMENT_NODE
    ? new Fragment(this.key, [...node.childNodes])
    : node
}

/**
 * Create a node editor function
 * @param {Node} placeholder The placeholder node
 * @returns {Editor}
 */
function createNodeEditor (placeholder, ctx, render) {
  const id = getPlaceholderId(placeholder)
  const slot = new Slot([placeholder], placeholder.parentNode)

  return function nodeEditor (partial) {
    morph(slot, partial.values[id], ctx, render)
  }
}

/**
 * Get an attribute editor for the given node
 * @param {Node} node Node with attributes
 * @returns {Editor | null}
 */
function getAttributeEditor (node) {
  const attributes = []

  for (const { name, value } of [...node.attributes]) {
    if (PLACEHOLDER.test(name) || PLACEHOLDER.test(value)) {
      attributes.push({ name, value })
      node.removeAttribute(name)
    }
  }

  return attributes.length ? createAttributeEditor(node, attributes) : null
}
