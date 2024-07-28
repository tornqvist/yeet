import { EventHandler, EVENT_PREFIX } from './event-handler.js'
import { Component } from './component.js'
import { Context, cache, stack } from './context.js'
import { Fragment } from './fragment.js'
import { Partial } from './partial.js'
import { Slot } from './slot.js'
import { refs } from './ref.js'
import {
  TEXT_NODE,
  WHITESPACE,
  PLACEHOLDER,
  ELEMENT_NODE,
  FRAGMENT_NODE,
  morph,
  parse,
  remove,
  compile,
  isPlaceholder,
  getPlaceholderId,
  createNodeEditor,
  resolveComponent,
  resolvePlaceholders,
  createAttributeEditor,
  createComponentEditor
} from './utils.js'

/**
 * @param {Partial|Component|function(): Partial|Component} value
 * @param {Element|string?} parent
 * @param {object} [state={}]
 */
export function mount(value, parent, state = {}) {
  if (typeof parent === 'string') parent = document.querySelector(parent)
  if (!parent) throw new Error('Node not found')
  const slot = new Slot(parent, 0, [...parent.childNodes])
  mountSlot(value, slot, new Context(state, value.key))
}

/**
 * @typedef {(Partial|Component|function(): Mountable)} Mountable
 * @param {Mountable|Mountable[]} values
 * @param {Slot} slot
 * @param {Context} ctx
 * @returns {Slot}
 */
function mountSlot(values, slot, ctx) {
  if (typeof values === 'function') values = values()
  if (!Array.isArray(values)) values = [values]

  const newChildren = []
  const { parent, children } = slot
  for (let i = 0; i < values.length; i++) {
    let value = values[i]

    if (typeof value === 'function') {
      value = value()
    }

    if (value instanceof Component) {
      /** @type {Component[]} */
      const layers = []
      const [_value, _ctx] = resolveComponent(value, ctx, slot, 0, layers)
      ctx.editors.push(createComponentEditor(slot, ctx, 0, layers))
      value = _value
      ctx = _ctx
    }

    if (value instanceof Partial) {
      const { values, key } = value
      const template = parse(value)

      ctx = ctx.spawn(key)

      if (template) {
        if (template.nodeType === FRAGMENT_NODE) {
          let i = 0
          const fragment = new Fragment(
            key,
            [...template.childNodes].map((child) => {
              // @ts-expect-error slot children are all nodes on mount
              const _child = mountChild(parent, child, i, children)
              if (_child) i++
              return _child
            })
          )
          cache.set(fragment, ctx)
          newChildren.push(fragment)
        } else {
          // @ts-expect-error slot children are all nodes on mount
          const child = mountChild(parent, template, 0, children)
          if (child instanceof window.Node) cache.set(child, ctx)
          if (child) newChildren.push(child)
        }

        /**
         * @param {Element} parent
         * @param {Node|null} newChild
         * @param {number} index
         * @param {Node[]} list
         * @returns {Node|Slot|null}
         */
        function mountChild(parent, newChild, index, list) {
          for (let oldChild = list.shift(); oldChild; oldChild = list.shift()) {
            if (newChild) {
              if (isPlaceholder(newChild)) {
                // Put back node to mount on
                list.unshift(oldChild)

                const _slot = new Slot(parent, index, list)
                const id = getPlaceholderId(newChild)
                const value = values[id]

                if (value instanceof Component) {
                  mountComponent(value, _slot, ctx)
                } else {
                  ctx.editors.push(createNodeEditor(id, _slot, ctx))
                  mountSlot(value, _slot, ctx)
                }

                return _slot
              }

              if (newChild.nodeType === ELEMENT_NODE) {
                if (oldChild.nodeName === newChild.nodeName) {
                  let i = 0
                  const children = [...oldChild.childNodes]
                  for (const child of newChild.childNodes) {
                    // @ts-expect-error oldChild is Element
                    if (mountChild(oldChild, child, i, children)) {
                      i++
                    }
                  }

                  mountAttributes(oldChild, newChild)

                  remove(children)

                  return oldChild
                } else {
                  remove(oldChild)
                }
              } else {
                if (oldChild.nodeValue !== newChild.nodeValue) {
                  // @ts-expect-error oldChild is CharacterNode
                  if (WHITESPACE.test(newChild.nodeValue)) {
                    // Skip whitespace nodes
                    list.unshift(oldChild)
                    return null
                  } else {
                    // Update text nodes to account for interpolated partials
                    oldChild.nodeValue = newChild.nodeValue
                  }
                }

                return oldChild
              }
            } else {
              remove(oldChild)
            }
          }

          if (newChild) {
            if (isPlaceholder(newChild)) {
              const id = getPlaceholderId(newChild)
              const _slot = new Slot(parent, index, [])
              ctx.editors.push(createNodeEditor(id, _slot, ctx))
              morph(_slot, values[id], ctx)
              return _slot
            }

            newChild = newChild.cloneNode(true)
            const editors = compile(newChild, ctx)

            try {
              stack.unshift(ctx)
              for (const editor of editors) {
                // @ts-expect-error value is Partial
                editor(value)
              }
            } finally {
              stack.shift()
            }

            parent.appendChild(newChild)
            return newChild
          }

          return null
        }
      }
    } else {
      for (let child = children.shift(); child; child = children.shift()) {
        if (child.nodeType === TEXT_NODE) {
          const content = String(value)
          if (child.nodeValue !== content) {
            child.nodeValue = content
          }
          newChildren.push(child)
          break
        } else {
          parent.removeChild(child)
        }
      }
    }
  }

  slot.children = newChildren

  return slot
}

/**
 * @param {Element} element
 * @param {Element} template
 * @param {any[]} values
 * @param {Context} ctx
 */
function mountAttributes(element, template, values, ctx) {
  const attributes = []

  for (const { name, value } of template.attributes) {
    const nameHasPlaceholder = PLACEHOLDER.test(name)
    const valueHasPlaceholder = PLACEHOLDER.test(value)

    if (nameHasPlaceholder || valueHasPlaceholder) {
      attributes.push({ name, value })

      const _name = nameHasPlaceholder
        ? resolvePlaceholders(name, values)
        : name
      const _value = valueHasPlaceholder
        ? resolvePlaceholders(value, values)
        : value

      if (EVENT_PREFIX.test(_name)) {
        const events = EventHandler.get(element)
        events.set(_name, _value)
      } else if (_name === 'ref') {
        if (typeof _value === 'function') _value(element)
        else refs.set(_value, element)
      }
    }
  }

  if (attributes.length) {
    const editor = createAttributeEditor(element, attributes)
    ctx.editors.push(editor)
  }
}
