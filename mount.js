import {
  FRAGMENT_NODE,
  ELEMENT_NODE,
  PLACEHOLDER,
  TEXT_NODE,
  createAttributeEditor,
  resolvePlaceholders,
  getPlaceholderId,
  isPlaceholder,
  getChildren,
  findNext,
  isArray,
  toNode,
  remove,
  update,
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

/** @typedef {import('./morph.js').render} render */
/** @typedef {import('./morph.js').onupdate} onupdate */
/** @typedef {import('./Context.js').Editor} Editor */

/**
 * Mount partial in node
 * @param {Partial} partial The partial to mount
 * @param {Node} node The node to mount the partial in
 * @param {object} [state] Initial root state
 */
export function mount (partial, node, state = {}) {
  if (typeof node === 'string') node = document.querySelector(node)
  const ctx = new Context(partial.key, state)
  const slot = new Slot([...node.childNodes], node)
  mountSlot(slot, partial, ctx, true)
}

/**
 * Mount given children in slot
 * @param {Slot} slot
 * @param {any[] | any} newChilden
 * @param {Context} ctx
 * @param {boolean} [isRoot=false]
 */
function mountSlot (slot, newChildren, ctx, isRoot = false) {
  newChildren = isArray(newChildren) ? [...newChildren] : [newChildren]

  for (let i = 0, len = newChildren.length; i < len; i++) {
    let newChild = newChildren[i]

    let outer = ctx
    let current = ctx
    if (newChild instanceof Component) {
      outer = !isRoot ? current.spawn(newChild.key) : current
      const inner = newChild.initialize(outer, function onupdate (value, ctx) {
        if (!value) {
          const removed = slot.children.splice(i, 1)
          remove(removed.map(getChildren))
        } else {
          const children = [...slot.children]
          children[i] = value
          morph(slot, children, ctx, function render (partial, ctx, onupdate) {
            const node = partial.render(ctx, onupdate)
            if (node) cache.set(node, outer)
            return node
          })
        }
      })
      current = inner.child
      newChild = inner.value
    }

    if (newChild instanceof Partial) {
      const template = parse(newChild)
      const { key, values } = newChild

      if (template.nodeType === FRAGMENT_NODE) {
        const children = mountChildren(
          [...template.childNodes],
          slot.children,
          slot.parent,
          values,
          current
        )
        const fragment = new Fragment(key, children)
        cache.set(fragment, outer)
        newChildren[i] = fragment
      } else if (slot.children.length) {
        const [node] = mountChildren(
          [template],
          slot.children,
          slot.parent,
          values,
          current
        )
        slot.children[i] = node
        // if (slot.children.includes(node)) {
        //   slot.children.splice(slot.children.indexOf(node), 1)
        // }
        newChildren[i] = node
        cache.set(node, outer)
      } else {
        morph(slot, newChild, current, function render (partial, ctx, onupdate) {
          // Spawn child context when provided with a component context
          const child = partial.key !== ctx.key ? ctx.spawn(partial.key) : ctx
          return partial.render(child, onupdate)
        })
        newChildren[i] = slot.children[0]
      }
    } else {
      if (newChild != null) {
        const child = slot.children.pop()
        if (child?.nodeType === TEXT_NODE && !isArray(newChild)) {
          const value = String(newChild)
          if (child.nodeValue !== value) child.nodeValue = value
          newChild = child
        } else {
          newChild = toNode(newChild)
          const next = findNext(slot.siblings, slot.index)
          if (next) next.before(newChild)
          else slot.parent.append(newChild)
        }
      }

      newChildren[i] = newChild
    }
  }

  slot.children = newChildren

  /**
   * Mount template nodes in parent, reusing any existing nodes
   * @param {Node[]} templateNodes Template child nodes
   * @param {Node[]} children Current DOM child nodes
   * @param {Node} parent Parent node
   * @param {any[]} values Current partial values
   * @returns {(Node | Slot)[]}
   */
  function mountChildren (templateNodes, children, parent, values, ctx) {
    return templateNodes.map(function mountChild (templateNode) {
      for (let child = children.shift(); child; child = children.shift()) {
        if (isPlaceholder(templateNode)) {
          children.unshift(child)

          const id = getPlaceholderId(templateNode)
          const cached = cache.get(child)
          const value = values[id]

          if (value instanceof Partial && value.key === cached.key) {
            update(cached, value)
            return child
          }

          const slot = new Slot(children, parent)
          mountSlot(slot, values[id], ctx)
          ctx.editors.push(createNodeEditor(id, slot, ctx))
          if (!getChildren(slot).includes(child)) {
            remove(children.shift())
          }

          return slot
        }
        if (templateNode.nodeName === child.nodeName) {
          if (child.nodeType === ELEMENT_NODE) {
            const editor = mountAttributes(child, templateNode, values)
            if (editor) ctx.editors.push(editor)

            mountChildren(
              [...templateNode.childNodes],
              [...child.childNodes],
              child,
              values,
              ctx
            )
          } else if (child.nodeType === TEXT_NODE) {
            if (child.nodeValue !== templateNode.nodeValue) {
              child.nodeValue = templateNode.nodeValue
            }
          }
          return child
        } else if (templateNode.nodeType === TEXT_NODE) {
          // Escape hatch for text nodes stripped in minification
          children.unshift(child)
          break
        } else if (child.nodeType !== TEXT_NODE) {
          // Drop non-text nodes that can't be reused
          child.remove()
          break
        }
        child.remove()
      }

      if (isPlaceholder(templateNode)) {
        const id = getPlaceholderId(templateNode)
        const slot = new Slot([], parent)
        mountSlot(slot, values[id], ctx)
        ctx.editors.push(createNodeEditor(id, slot, ctx))
        return slot
      } else {
        const newChild = templateNode.cloneNode()
        const newChildren = [...templateNode.childNodes].map(
          (child) => child.cloneNode(true)
        )
        mountChildren(newChildren, [], newChild, values, ctx)
        // Add rendered child to slot siblings
        const siblings = slots.get(parent)
        siblings?.push(newChild)
        // Insert node at correct position
        if (children.length) children[0].before(newChild)
        else parent.append(newChild)
        return newChild
      }
    })
  }
}

/**
 * Mount attributes to given node
 * @param {Node} node The node to mount attributes to
 * @param {Node} template The template to mount attributes from
 * @param {any[]} values Current partial values
 * @returns {Editor}
 */
function mountAttributes (node, template, values) {
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
    return createAttributeEditor(node, attributes)
  }
}

/**
 * CreateNode editor for given slot
 * @param {number} id Placeholder id
 * @param {Slot} slot Slot to edit
 * @param {Context} ctx Current context
 * @returns {Editor}
 */
function createNodeEditor (id, slot, ctx) {
  return function nodeEditor (partial) {
    morph(slot, partial.values[id], ctx, function render (partial, ctx, onupdate) {
      const child = ctx.spawn(partial.key)
      return partial.render(child, onupdate)
    })
  }
}
