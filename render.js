import { remove, replace, isArray } from './utils.js'
import { Context, cache } from './context.js'
import { Fragment } from './fragment.js'

/**
 * Render partial as child to given node
 * @param {Partial} partial A partial to render
 * @param {Node} parent The node to render to
 * @param {object} state The root state
 * @returns {Node|Promise<Node>}
 */
export function render (partial, parent, state = {}) {
  const ctx = new Context(partial.key, state)

  let current
  let node = partial.render(ctx, persist)
  cache.set(node, ctx)
  if (node instanceof Fragment) node = [...node.children]
  persist(node)
  return node

  /**
   * Persist node(s) to the DOM
   * @param {Node[] | Node} children Node(s) to persist to the DOM
   */
  function persist (children) {
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
