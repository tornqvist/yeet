import {
  TEXT_NODE,
  getChildren,
  findNext,
  isArray,
  toNode,
  remove,
  update
} from './utils.js'
import { cache } from './context.js'
import { Partial } from './partial.js'

/** @typedef {import('./component.js').Component} Component */
/** @typedef {import('./context.js').Context} Context */
/** @typedef {import('./slot.js').Slot} Slot */

/**
 * @callback render
 * @param {Partial} partial Partial to render
 * @param {Context} ctx Current context
 * @param {onupdate} onupdate Callback when node is to be updated
 * @returns {Node | Fragment}
 */

/**
 * @callback onupdate
 * @param {any} value Value to update with
 * @param {render} render Callback to render partial
 */

/**
 * Update or replace existing child node(s) with new value(s)
 * @param {Slot} slot Current slot
 * @param {any[] | any} newChildren New children
 * @param {Context} ctx Current context
 * @param {render} render Render function
 */
export function morph (slot, newChildren, ctx, render) {
  // Do not mutate any existing arrays
  newChildren = isArray(newChildren) ? [...newChildren] : [newChildren]
  const oldChildren = [...slot.children]

  /** @type {Map<any, number[]>} */
  let map

  for (let i = 0, len = newChildren.length; i < len; i++) {
    let newChild = newChildren[i]
    const oldChild = oldChildren[i]
    const cached = cache.get(oldChild)

    if (newChild instanceof Partial) {
      const { key } = newChild

      // Update existing child if in same place and same key
      if (cached?.key === key) {
        const candidates = map?.get(key)
        if (candidates) candidates.splice(candidates.indexOf(i), 1)
        update(cached, newChild)
        oldChildren[i] = null
        newChildren[i] = slot.children[i]
        continue
      }

      // Index all (cached) children by their key for faster lookup
      if (!map) {
        map = new Map()
        for (let _i = 0, _len = oldChildren.length; _i < _len; _i++) {
          const _oldChild = oldChildren[_i]
          if (newChildren.includes(_oldChild)) continue
          const cached = cache.get(_oldChild)
          if (cached) {
            const candidates = map.get(cached.key)
            if (candidates) candidates.push(_i)
            else map.set(cached.key, [_i])
          }
        }
      }

      // Look among indexed children for a matching key
      const candidates = map.get(key)
      if (candidates?.length) {
        const index = candidates.pop()
        const cached = cache.get(oldChildren[index])
        update(cached, newChild)
        oldChildren[index] = null
        newChild = slot.children[i]
        continue
      } else {
        // Otherwise, create a new child
        newChild = render(newChild, ctx, function onupdate (value, render) {
          const children = [...slot.children]
          children[i] = value
          morph(slot, children, ctx, render)
        })
      }
    } else {
      // Reuse text nodes if possible
      if (!cached && oldChild?.nodeType === TEXT_NODE) {
        newChild = String(newChild)
        if (oldChild.nodeValue !== newChild) {
          oldChild.nodeValue = newChild
        }
        oldChildren[i] = null
        newChild = oldChild
      } else {
        newChild = toNode(newChild)
      }
    }

    // Replace/remove/insert new child
    if (newChild != null) {
      const args = getChildren(newChild)
      if (!oldChild) {
        const next = findNext(slot.siblings, slot.index + 1)
        if (next) next.before(...args)
        else slot.parent.append(...args)
      } else if (newChild !== oldChild) {
        const next = findNext([oldChild])
        next.before(...args)
      }
    }

    // Update registry of new children with what we have
    newChildren[i] = newChild
  }

  // Remove old children
  remove(oldChildren.flatMap(getChildren).filter(Boolean))

  slot.children = newChildren
}
