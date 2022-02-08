import { Context } from './context.js'
import { morph } from './morph.js'
import { Slot } from './slot.js'

/**
 * Render partial as child to given node
 * @param {Partial} partial A partial to render
 * @param {Node} parent The node to render to
 * @param {object} state The root state
 */
export function render (partial, parent, state = {}) {
  const slot = new Slot([...parent.childNodes], parent)
  const ctx = new Context(partial.key, state)

  morph(slot, partial, ctx, function render (partial, ctx, onupdate) {
    return partial.render(ctx, onupdate)
  })
}
