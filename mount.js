import {
  FRAGMENT_NODE,
  ELEMENT_NODE,
  COMMENT_NODE,
  PLACEHOLDER,
  TEXT_NODE,
  createAttributeEditor,
  resolvePlaceholders,
  getPlaceholderId,
  isPlaceholder,
  getChildren,
  isArray,
  toNode,
  remove,
  parse
} from './utils.js'
import { EVENT_PREFIX, EventHandler } from './event-handler.js'
import { Context, cache } from './context.js'
import { Component } from './component.js'
import { Fragment } from './fragment.js'
import { Slot, slots } from './slot.js'
import { Partial } from './partial.js'
import { morph } from './morph.js'
import { refs } from './ref.js'

const WHITESPACE = /^\s+$/

/**
 * Mount partial in node
 * @param {Partial} partial
 * @param {Node} node
 * @param {object} [state={}]
 */
export function mount (partial, node, state = {}) {
  if (typeof node === 'string') node = document.querySelector(node)
  const ctx = new Context(partial.key, state)
  const slot = new Slot([...node.childNodes], node)
  mountSlot(slot, [partial], ctx)
}

/**
 * Mount new children in slot
 * @param {Slot} slot
 * @param {any[]} newChildren
 * @param {Context} ctx
 */
function mountSlot (slot, newChildren, ctx) {
  if (!isArray(newChildren)) newChildren = [newChildren]

  const { children, parent } = slot

  let i = 0
  let { length } = newChildren
  for (; i < length; i++) {
    let newChild = newChildren[i]

    if (newChild instanceof Partial) {
      const { key } = newChild
      const ctxPublic = ctx.spawn(key)

      // Partial context is by default public (cached with node)
      let ctxPrivate = ctxPublic

      if (newChild instanceof Component) {
        const index = i
        const { value, child } = newChild.initialize(
          ctxPublic,
          function onupdate (value, ctx, afterupdate) {
            if (!value) {
              const removed = slot.children.splice(index, 1)
              remove(removed.map(getChildren))
            } else {
              const children = [...slot.children]
              children[index] = value
              morph(
                slot,
                children,
                ctx,
                function render (partial, _ctx, onupdate) {
                  const node = partial.render(_ctx, onupdate)
                  if (node) cache.set(node, ctxPublic)
                  return node
                }
              )
            }
          }
        )

        // Extract component return value
        newChild = value

        // Component child context, to be used for child render
        ctxPrivate = child || ctxPrivate
      }

      if (newChild == null) {
        newChildren[i] = null
        continue
      }

      const { values } = newChild
      const template = parse(newChild)

      if (template.nodeType === FRAGMENT_NODE) {
        const _children = [...template.childNodes].map(function (node) {
          const child = mountTemplate(node, children, parent, values, ctxPrivate)
          return child === WHITESPACE ? null : child
        })
        newChild = new Fragment(key, _children.filter(Boolean))
      } else if (children.length) {
        newChild = mountTemplate(template, children, parent, values, ctxPrivate)
      } else {
        break
      }
      if (newChild !== WHITESPACE) {
        cache.set(newChild, ctxPublic)
      }
    } else if (children.length) {
      newChild = mountTemplate(toNode(newChild), children, parent, null, ctx)
    } else {
      break
    }

    if (newChild === WHITESPACE) {
      i--
      length--
    } else {
      newChildren[i] = newChild
    }
  }

  if (i < length) {
    const _children = [...children, ...newChildren.slice(i)]
    morph(slot, _children, ctx, function render (partial, ctx, onupdate) {
      return partial.render(ctx, onupdate)
    })
  } else {
    slot.children = newChildren
  }
}

/**
 * Mount template node in parent, canibalizing existing node(s)
 * @param {Node|string} template
 * @param {Node[]} nodes
 * @param {Node} parent
 * @param {any[]} values
 * @param {Context} ctx
 * @returns {Node}
 */
function mountTemplate (template, nodes, parent, values, ctx) {
  const isPlaceholderNode = isPlaceholder(template)
  for (let node = nodes.shift(); node; node = nodes.shift()) {
    if (isPlaceholderNode) {
      nodes.unshift(node)
      const id = getPlaceholderId(template)
      const slot = new Slot(nodes, parent)
      mountSlot(slot, values[id], ctx)
      ctx.editors.push(createNodeEditor(id, slot, ctx))
      return slot
    }

    if (node.nodeName === template.nodeName) {
      if (node.nodeType === ELEMENT_NODE) {
        mountAttributes(node, template, values, ctx)
        const children = [...node.childNodes]
        for (const child of template.childNodes) {
          mountTemplate(child, children, node, values, ctx)
        }
      } else if (
        template.nodeType === COMMENT_NODE &&
        PLACEHOLDER.test(template.nodeValue)
      ) {
        ctx.editors.push(function (partial) {
          node.nodeValue = resolvePlaceholders(
            template.nodeValue,
            partial.values
          )
        })
      } else {
        if (
          node.nodeValue !== template.nodeValue &&
          !WHITESPACE.test(template.nodeValue + node.nodeValue)
        ) {
          node.nodeValue = template.nodeValue
        }
      }

      return node
    }

    // No need to add back whitespace stripped in minification
    if (
      template.nodeType === TEXT_NODE &&
      WHITESPACE.test(template.nodeValue)
    ) {
      nodes.unshift(node)
      return WHITESPACE
    }

    remove(node)
  }

  if (isPlaceholderNode) {
    const id = getPlaceholderId(template)
    const slot = new Slot([], parent)
    const value = values[id]
    morph(slot, value, ctx, function render (partial, ctx, onupdate) {
      return partial.render(ctx, onupdate)
    })
    ctx.editors.push(createNodeEditor(id, slot, ctx))
    if (nodes.length) add(slot)
    return slot
  }

  const node = template.cloneNode(true)
  if (node.nodeType === ELEMENT_NODE) {
    mountAttributes(node, template, values, ctx)
    const children = [...node.childNodes]
    for (const child of template.childNodes) {
      mountTemplate(child, children, node, values, ctx)
    }
  }

  add(node)
  return node

  /**
   * A value to be added to parent before any exising nodes
   * @param {Slot|Node} value Value to be added
   */
  function add (value) {
    const children = getChildren(value).filter((node) => node != null)
    if (nodes.length) throw new Error('wut?')
    if (nodes.length) nodes[0].before(...children)
    else parent.append(...children)
    const slot = slots.get(parent)
    slot?.push(value)
  }
}

/**
 * Mount attributes to given node
 * @param {Node} node The node to mount attributes to
 * @param {Node} template The template to mount attributes from
 * @param {any[]} values Current partial values
 * @param {Context} ctx Current context
 */
function mountAttributes (node, template, values, ctx) {
  const attributes = []

  for (let { name, value } of template.attributes) {
    const nameHasPlaceholder = PLACEHOLDER.test(name)
    const valueHasPlaceholder = PLACEHOLDER.test(value)

    if (nameHasPlaceholder || valueHasPlaceholder) {
      attributes.push({ name, value })
      name = nameHasPlaceholder ? resolvePlaceholders(name, values) : name
      value = valueHasPlaceholder ? resolvePlaceholders(value, values) : value
      if (EVENT_PREFIX.test(name)) {
        const events = EventHandler.get(node)
        events.set(name, value)
      } else if (name === 'ref') {
        if (typeof value === 'function') value(node)
        else refs.set(value, node)
      }
    }
  }

  if (attributes.length) {
    const editor = createAttributeEditor(node, attributes)
    ctx.editors.push(editor)
  }
}

/**
 * Create node editor for given slot
 * @param {number} id Placeholder id
 * @param {Slot} slot Slot to edit
 * @param {Context} ctx Current context
 * @returns {Editor}
 */
function createNodeEditor (id, slot, ctx) {
  return function nodeEditor (partial) {
    morph(
      slot,
      partial.values[id],
      ctx,
      function render (partial, ctx, onupdate) {
        const child = ctx.spawn(partial.key)
        return partial.render(child, onupdate)
      }
    )
  }
}
