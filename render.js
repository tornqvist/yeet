import {
  ELEMENT_NODE,
  Context,
  cache,
  isArray,
  isPlaceholder,
  getPlaceholderId,
  createAttributeEditor
} from './shared.js'
import { parse } from './parse.js'
import { morph } from './morph.js'
import { Component, unwind } from './component.js'

export function render (partial, state = {}) {
  const ctx = new Context(partial.key, state)

  if (partial instanceof Component) {
    partial = unwind(partial, ctx)
  }

  const template = parse(partial)
  const node = template.cloneNode(true)

  const walker = document.createTreeWalker(node, 1 | 128, null, false)
  let current = walker.nextNode()

  if (template.nodeType === ELEMENT_NODE) {
    const editor = createAttributeEditor(template, node)
    if (editor) {
      ctx.editors.push(editor)
      editor(partial)
    }
  }

  while (current) {
    if (isPlaceholder(current)) {
      const id = getPlaceholderId(current)
      const onchange = handlePlaceholder(current, ctx)
      onchange(partial.values[id])
      ctx.editors.push(function (value) {
        onchange(value.values[id])
      })
    } else if (current.nodeType === ELEMENT_NODE) {
      const editor = createAttributeEditor(node)
      if (editor) {
        ctx.editors.push(editor)
        editor(partial)
      }
    }
    current = walker.nextNode()
  }

  cache.set(node, ctx)

  return node
}

const map = new WeakMap()
function handlePlaceholder (placeholder, ctx) {
  const parent = placeholder.parentNode
  let children = map.get(parent)
  if (!children) map.set(parent, children = [...parent.childNodes])
  const index = children.indexOf(placeholder)

  return onchange

  function onchange (value) {
    const next = getNext(index, children)
    children[index] = morph(children[index], value, parent, next, resolve)
  }

  function resolve (partial) {
    return render(partial, Object.create(ctx.state), onchange)
  }
}

function getNext (index, list) {
  for (let next, i = index + 1, len = list.length; i < len; i++) {
    next = list[i]
    if (isArray(next)) next = getNext(0, next)
    if (next) return next
  }
}
