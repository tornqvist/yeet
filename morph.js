import {
  TEXT_NODE,
  Partial,
  isArray,
  toNode,
  remove,
  update,
  cache
} from './shared.js'

export function morph (oldChildren, newChildren, parent, next, render) {
  newChildren = isArray(newChildren) ? [...newChildren] : [newChildren]
  if (!isArray(oldChildren)) oldChildren = [oldChildren]

  let map
  for (let i = 0, len = newChildren.length; i < len; i++) {
    let newChild = newChildren[i]
    const oldChild = oldChildren[i]
    const cached = cache.get(oldChild)

    if (newChild instanceof Partial) {
      const { key } = newChild

      if (cached?.key === key) {
        newChildren[i] = oldChild
        map?.get(key)?.delete(i)
        update(cached, newChild)
        continue
      }

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

      const candidates = map.get(key)
      if (candidates?.length) {
        const index = candidates.pop()
        const cached = cache.get(oldChildren[index])
        update(cached, newChild)
        newChild = oldChild
      } else {
        newChild = render(newChild)
      }
    } else {
      if (!cached && oldChild?.nodeType === TEXT_NODE) {
        newChild = String(newChild)
        if (oldChild.nodeValue !== newChild) {
          oldChild.nodeValue = newChild
        }
        newChild = oldChild
      } else {
        newChild = toNode(newChild)
      }
    }

    if (!oldChild) {
      if (next) next.before(newChild)
      else parent.append(newChild)
    } else if (newChild !== oldChild) {
      oldChild.before(newChild)
    }

    newChildren[i] = newChild
  }

  remove(oldChildren.filter((oldChild) => !newChildren.includes(oldChild)))

  return newChildren
}
