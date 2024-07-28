import { morph, createComponentEditor } from './utils.js'
import { Component } from './component.js'
import { Context } from './context.js'
import { Slot } from './slot.js'

/** @typedef {import('./partial').Partial} Partial */

/**
 * @param {(Partial|Component|function(): (Partial|Component))} value
 * @param {Element|string?} parent
 * @param {object} [state={}]
 */
 export function render (value, parent, state = {}) {
  if (typeof parent === 'string') parent = document.querySelector(parent)
  if (!parent) throw new Error('Node not found')

  if (typeof value === 'function') {
    value = value()
  }

  const slot = new Slot(parent, 0, [...parent.childNodes])
  let ctx = new Context(state, value.key)

  if (value instanceof Component) {
    let index = 0
    const layers = []
    while (value instanceof Component) {
      layers.push(value)
      ctx = ctx.spawn(value.key)
      const editor = createComponentEditor(slot, ctx, index++, layers)
      value = value.render(ctx, editor)
    }
  }

  morph(slot, value, ctx)
}
