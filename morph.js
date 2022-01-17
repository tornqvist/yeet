import {
  TEXT_NODE,
  isArray,
  toNode,
  remove,
  update
} from './utils.js'
import { Slot } from './slot.js'
import { cache } from './context.js'
import { Partial } from './partial.js'

/** @typedef {import('./context.js').Context} Context */

/**
 * Update or replace existing child node(s) with new value(s)
 * @param {Context} ctx Current context
 * @param {Slot} slot Current slot
 * @param {any[] | any} newChildren New children
 */
export function morph (ctx, slot, newChildren) {
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
        const child = ctx.spawn(key)
        newChild = newChild.render(child, function onupdate (value) {
          const children = [...slot.children]
          children[i] = value
          if (value) cache.set(value, child)
          morph(ctx, slot, children)
        })
        if (newChild) cache.set(newChild, child)
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
      if (!oldChild) {
        const next = findNext(slot)
        if (next) next.before(newChild)
        else slot.parent.append(newChild)
      } else if (newChild !== oldChild) {
        oldChild.before(newChild)
      }
    }

    // Update registry of new children with what we have
    newChildren[i] = newChild
  }

  // Remove old children
  remove(oldChildren.filter(Boolean))

  slot.children = newChildren
}

/**
 * Find next non-null sibling to slot
 * @param {Slot} slot Slot to search from
 * @returns {Node | void}
 */
function findNext ({ index, siblings }) {
  for (let next, i = index + 1, len = siblings.length; i < len; i++) {
    next = siblings[i]
    if (next instanceof Slot) next = findNext(next)
    if (next) return next
  }
}
