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
import { Fragment } from './fragment.js'

/** @typedef {import('./context.js').Context} Context */

/**
 * @callback render
 * @param {Partial} partial Partial to render
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
 * @param {function(Partial, function(Node | any[] | any))} render Render function
 */
export function morph (slot, newChildren, render) {
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
        newChild = render(newChild, function onupdate (value, render) {
          const children = [...slot.children]
          children[i] = value
          morph(slot, children, render)
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
      const args = getChilden(newChild)
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
  remove(oldChildren.flatMap(getChilden).filter(Boolean))

  slot.children = newChildren
}

/**
 * Pluck children from fragment
 * @template Item
 * @param {Item | Fragment} item Item to pluck from
 * @returns {(Node | Item)[]}
 */
function getChilden (item) {
  return item instanceof Fragment ? item.children : [item]
}

/**
 * Find next non-null sibling to slot
 * @param {Slot} slot Slot to search from
 * @returns {Node | void}
 */
function findNext (nodes, index = 0) {
  for (let i = index, len = nodes.length; i < len; i++) {
    let next = nodes[i]
    if (next instanceof Slot) next = findNext(next.siblings, next.index + 1)
    if (next instanceof Fragment) next = findNext(next.children)
    if (next) return next
  }
}
