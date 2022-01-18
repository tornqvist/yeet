import { Context, cache } from './context.js'
import { Fragment } from './fragment.js'
import { morph } from './morph.js'
import { Slot } from './slot.js'

/** @typedef {import('./morph.js').onupdate} onupdate */
/** @typedef {import('./partial.js').Partial} Partial */

/**
 * Render partial as child to given node
 * @param {Partial} partial A partial to render
 * @param {Node} parent The node to render to
 * @param {object} state The root state
 * @returns {Node|Promise<Node>}
 */
export function render (partial, parent, state = {}) {
  const ctx = new Context(partial.key, state)
  const slot = new Slot(null, parent)

  let node = partial.render(ctx, onupdate)
  if (node) cache.set(node, ctx)
  if (node instanceof Fragment) node = [...node.children]
  onupdate(node)
  return node

  /** @type {onupdate} */
  function onupdate (value, render) {
    morph(slot, value, render)
  }
}
