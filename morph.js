import {
  TEXT_NODE,
  isArray,
  toNode,
  remove,
  update
} from './utils.js'
import { cache } from './context.js'
import { Partial } from './partial.js'
import { Component } from './component.js'

/**
 * Update or replace existing child node(s) with new value(s)
 * @param {Node[]} oldChildren Current child node(s)
 * @param {any} newChildren New child
 * @param {Node} parent Parent node
 * @param {Node|null} next Next node sibling
 * @param {function(partial): Node} render Render partial to Node
 * @returns {any}
 */
export function morph (oldChildren, newChildren, parent, next, render) {
  // Make sure not to mutate the original array
  newChildren = isArray(newChildren) ? [...newChildren] : [newChildren]

  // Augument old children as an array for easier comparison
  if (!isArray(oldChildren)) oldChildren = [oldChildren]

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
        if (newChild instanceof Component) {
          newChildren[i] = cached.node
          if (cached.node) oldChildren[i] = null
        } else {
          oldChildren[i] = null
          newChildren[i] = oldChild
        }
        continue
      }

      // Index all (cached) children by their key for faster lookup
      if (!map) {
        map = new Map()
        for (let _i = 0, _len = oldChildren.length; _i < _len; _i++) {
          const _oldChild = oldChildren[_i]
          if (newChildren.includes(_oldChild)) continue
          const ctx = cache.get(_oldChild)
          if (ctx) {
            const candidates = map.get(ctx.key)
            if (candidates) candidates.push(_i)
            else map.set(ctx.key, [_i])
          }
        }
      }

      // Look among indexed children for a matching key
      const candidates = map.get(key)
      if (candidates?.length) {
        const index = candidates.pop()
        const cached = cache.get(oldChildren[index])
        newChild = oldChild
        oldChildren[index] = null
        update(cached, newChild)
      } else {
        newChild = render(newChild)
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
        if (next) next.before(newChild)
        else parent.append(newChild)
      } else if (newChild !== oldChild) {
        oldChild.before(newChild)
      }
    }

    // Update registry of new children with what we have
    newChildren[i] = newChild
  }

  // Remove old children
  remove(oldChildren.filter(Boolean))

  return newChildren
}
