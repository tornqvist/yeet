import { Context, cache } from './context.js'
import { update, toNode } from './utils.js'
import { Component } from './component.js'
import { Partial } from './partial.js'
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
  const root = new Context(partial.key, state)

  morph(slot, partial, root, function render (partial, ctx, onupdate) {
    if (ctx !== root) ctx = ctx.spawn(partial.key)

    /** @type {Context} */
    let current = ctx
    while (partial instanceof Component) {
      const parent = current
      let child

      partial = partial.render(parent, function handleUpdate (value) {
        if (value instanceof Partial) {
          if (value.key === child?.key) {
            update(child, value)
          } else {
            child = parent.spawn(value.key)
            onupdate(value, render)
          }
        } else {
          child = null
          onupdate(value)
        }
      })

      if (partial instanceof Partial) {
        current = child = parent.spawn(partial.key)
      } else {
        return toNode(partial)
      }
    }

    const node = partial.render(current, render, onupdate)
    cache.set(node, ctx)

    return node
  })
}
