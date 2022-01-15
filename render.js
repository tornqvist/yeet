import {
  ELEMENT_NODE,
  update,
  remove,
  replace,
  isArray,
  findFrom,
  isPlaceholder,
  getPlaceholderId,
  createAttributeEditor
} from './utils.js'
import { morph } from './morph.js'
import { parse } from './partial.js'
import { Context, cache } from './context.js'
import { Component, initialize } from './component.js'

/**
 * Render partial as child to given node
 * @param {Partial} partial A partial to render
 * @param {Node} parent The node to render to
 * @param {object} state The root state
 * @returns {Node|Promise<Node>}
 */
export function render (partial, parent, state = {}) {
  let current
  const ctx = new Context(partial.key, state)

  // if (partial instanceof Component) {
  //   partial = initialize(partial, ctx, function (partial, _ctx = ctx) {

  //   })
  // }

  const node = _render(partial, ctx)
  cache.set(node, ctx)
  onupdate(node)
  return node

  function onupdate (children) {
    if (children) {
      if (!isArray(children)) children = [children]
      if (current) replace(current, children)
      else parent.append(...children)
    } else if (current) {
      remove(current)
    }
    current = children
  }
}

/**
 * Render partial to node
 * @param {Partial} partial Render partial to node
 * @param {Context} ctx Partial context
 * @returns {Node}
 */
function _render (partial, ctx) {
  const template = parse(partial)
  const node = template.cloneNode(true)

  const walker = document.createTreeWalker(node, 1 | 128, null, false)
  let current = walker.nextNode()

  if (template.nodeType === ELEMENT_NODE) {
    const editor = createAttributeEditor(node)
    if (editor) ctx.editors.push(editor)
  }

  while (current) {
    if (isPlaceholder(current)) {
      ctx.editors.push(createNodeEditor(current, ctx))
    } else if (current.nodeType === ELEMENT_NODE) {
      const editor = createAttributeEditor(current)
      if (editor) ctx.editors.push(editor)
    }
    current = walker.nextNode()
  }

  update(ctx, partial)

  return node
}

/** @type {WeakMap<Node, Node[]>} */
const childNodes = new WeakMap()

/**
 * Create a node editor
 * @param {Node} placeholder Placeholder node
 * @param {Context} ctx Parent context
 * @returns {import('./context.js').Editor}
 */
function createNodeEditor (placeholder, ctx) {
  const id = getPlaceholderId(placeholder)
  const parent = placeholder.parentNode

  // Read childNodes from cache to prevent excessive duplication
  let children = childNodes.get(parent)
  if (!children) childNodes.set(parent, children = [...parent.childNodes])
  const index = children.indexOf(placeholder)

  return nodeEditor

  /** @type {import('./context.js').Editor} */
  function nodeEditor (partial) {
    onupdate(partial.values[id], ctx)
  }

  /**
   * editor will call morph which find the matching node to be removed,
   * calls update with the old node/component which will remove the node,
   * and then finish up the onupdate call restoring the previous state
   */

  /**
   * Update child at index
   * @param {any} value New child
   */
  function onupdate (newChild, ctx) {
    const next = findFrom(index + 1, children)
    children[index] = morph(children[index], newChild, parent, next, resolve)
  }

  /**
   * Resolve partial to node or null
   * @param {Partial} partial A partial to resolve to node
   * @returns {any}
   */
  function resolve (partial, child = ctx.spawn(partial.key)) {
    const node = partial instanceof Component
      ? initialize(partial, child, _render, function replace (newChild, child) {
          const next = findFrom(index + 1, children)
          children[index] = morph(children[index], newChild, parent, next, function (partial) {
            return resolve(partial, child)
          })
        })
      : _render(partial, child)

    if (node) cache.set(node, child)

    return node
  }
}
