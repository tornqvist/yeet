import {
  FRAGMENT_NODE,
  ELEMENT_NODE,
  cache,
  update,
  toNode,
  remove,
  replace,
  isArray,
  isPlaceholder,
  getPlaceholderId,
  createAttributeEditor
} from './utils.js'
import { morph } from './morph.js'
import { render } from './render.js'
import { Context } from './context.js'
import { Partial, parse } from './partial.js'
import { Component, unwind } from './component.js'

export function mount (node, partial, state = {}) {
  let ctx = cache.get(node)
  if (ctx?.key === partial.key) {
    update(ctx, partial)
    return node
  }

  ctx = new Context(partial.key, state)

  mountChildren([partial], node.childNodes, node)

  cache.set(node, ctx)

  return node

  function mountNode (template, node) {
    if (node.nodeType === ELEMENT_NODE) {
      for (const { name, value } of [...node.attributes]) {
        if (!template.hasAttribute(name, value)) {
          node.removeAttribute(name)
        }
      }
      for (const { name, value } of template.attributes) {
        if (!node.hasAttribute(name, value)) {
          node.setAttribute(name, value)
        }
      }
      const editor = createAttributeEditor(node)
      if (editor) ctx.editors.push(editor)
      mountChildren(template.childNodes, node.childNodes, node)
    } else if (node.nodeValue !== template.nodeValue) {
      node.nodeValue = template.nodeValue
    }
  }

  function mountChildren (newChildren, oldChildren, parent) {
    let offset = 0
    for (let i = 0; ; i++) {
      const oldChild = oldChildren[i]
      let newChild = newChildren[i - offset]

      if (!oldChild && !newChild) break
      if (!newChild) {
        remove(oldChild)
        i--
      } else {
        let id
        if (isPlaceholder(newChild)) {
          id = getPlaceholderId(newChild)
          newChild = partial.values[id]
        }

        if (isArray(newChild)) {
          const { length } = newChild
          mountChildren(newChild, extract(oldChildren, i, length), parent)
          offset += length
          i += length
          continue
        }

        const cached = cache.get(oldChild)
        const isPartial = newChild instanceof Partial

        if (isPartial) {
          if (oldChild) {
            if (cached?.key === newChild.key) {
              update(cached, newChild)
              continue
            }

            if (newChild instanceof Component) {
              const ctx = new Context(newChild.key, Object.create(cached.state))
              newChild = unwind(newChild, ctx)
            }

            const template = parse(newChild)
            if (template.nodeType === FRAGMENT_NODE) {
              const { length } = template.childNodes
              mountChildren(template.childNodes, extract(oldChildren, i, length))
              offset += length
              i += length
              continue
            } else if (same(template, oldChild)) {
              if (oldChild.nodeType === ELEMENT_NODE) {
                mountNode(template, oldChild)
              } else if (oldChild.nodeValue !== template.nodeValue) {
                oldChild.nodeValue = template.nodeValue
              }
              continue
            }
          }

          newChild = render(newChild, Object.create(ctx.state))
        } else if (newChild) {
          if (!newChild.nodeType) {
            newChild = toNode(newChild)
          }

          if (cached || !same(newChild, oldChild)) {
            const { childNodes } = newChild
            newChild = newChild.cloneNode()
            if (newChild.nodeType === ELEMENT_NODE) {
              const editor = createAttributeEditor(newChild)
              if (editor) ctx.editors.push(editor)
            }
            mountChildren(childNodes, [], newChild)
          } else {
            mountNode(newChild, oldChild)
            continue
          }
        }

        if (newChild) {
          if (oldChild) replace(oldChild, newChild)
          else parent.append(newChild)
        }

        if (isPartial) {
          const transform = createTransformer(newChild || oldChild, ctx)
          ctx.editors.push(function (value) {
            transform(value.values[id])
          })
        }

        if (oldChild && !newChild) {
          remove(oldChild)
        }
      }
    }
  }
}

const map = new WeakMap()
function createTransformer (placeholder, ctx) {
  const parent = placeholder.parentNode
  let children = map.get(parent)
  if (!children) map.set(parent, children = [...parent.childNodes])
  const index = children.indexOf(placeholder)

  return function transform (value) {
    const next = getNext(index, children)
    children[index] = morph(children[index], value, parent, next, resolve)
  }

  function resolve (partial) {
    return render(partial, Object.create(ctx.state))
  }
}

function getNext (index, list) {
  for (let next, i = index + 1, len = list.length; i < len; i++) {
    next = list[i]
    if (isArray(next)) next = getNext(0, next)
    if (next) return next
  }
}

function extract (list, start, count) {
  return [...list].slice(start, start + count)
}

function same (a, b) {
  if (!a?.nodeType || !b?.nodeType) return false
  if (a.nodeType !== b.nodeType) return false
  if (a.id !== b.id) return false
  return true
}
