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
  update,
  remove,
  parse
} from './utils.js'
import { EVENT_PREFIX, EventHandler } from './event-handler.js'
import { Context, cache } from './context.js'
import { Component } from './component.js'
import { Fragment } from './fragment.js'
import { Partial } from './partial.js'
import { morph } from './morph.js'
import { Slot } from './slot.js'
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
  function unwind (value, index, ctx) {
    if (!(value instanceof Partial)) return [ctx, value]
    if (!isRoot) ctx = ctx.spawn(value.key)

    let current = ctx
    while (value instanceof Component) {
      const parent = current
      let child

      value = value.render(current, function handleUpdate (value) {
        const isPartial = value instanceof Partial
        if (isPartial && value.key === child?.key) {
          update(child, value)
        } else {
          child = isPartial ? parent.spawn(value.key) : null
          const children = [...slot.children]
          children[index] = value
          morph(slot, children, ctx, function render (partial, ctx, onupdate) {
            const [_current, _partial] = unwind(partial, index, current)
            const node = _partial.render(_current, render)
            cache.set(node, ctx)
            return node
          })
        }
      })

      if (value instanceof Partial) {
        current = child = parent.spawn(value.key)
      }
    }

    return [current, value]
  }

  newChildren = isArray(newChildren) ? [...newChildren] : [newChildren]

  for (let i = 0, len = newChildren.length; i < len; i++) {
    let [current, newChild] = unwind(newChildren[i], i, ctx)

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
        newChildren[i] = new Fragment(key, children)
        slot.children.splice(i, children.length, newChildren[i])
      } else if (slot.children.length) {
        const [node] = mountChildren(
          [template],
          slot.children,
          slot.parent,
          values,
          current
        )
        if (slot.children.includes(node)) {
          slot.children.splice(slot.children.indexOf(node), 1)
        }
        newChildren[i] = node
        cache.set(node, ctx)
      } else {
        morph(slot, newChild, current, function render (partial, onupdate) {
          const [_current, _partial] = unwind(partial, i, current)
          const node = _partial.render(_current, render)
          cache.set(node, ctx)
          return node
        })
        newChildren[i] = newChild
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
        } else if (child.nodeType !== TEXT_NODE) {
          break
        }
      }

      if (isPlaceholder(templateNode)) {
        const id = getPlaceholderId(templateNode)
        const slot = new Slot([], parent)
        mountSlot(slot, values[id], ctx)
        ctx.editors.push(createNodeEditor(id, slot, ctx))
        return slot
      } else {
        const newChild = templateNode.cloneNode(true)
        mountChildren([...newChild.childNodes], [], newChild, values, ctx)
        parent.append(newChild)
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
    const nameIsPlaceholder = PLACEHOLDER.test(name)
    const valueIsPlaceholder = PLACEHOLDER.test(value)

    if (nameIsPlaceholder || valueIsPlaceholder) {
      attributes.push({ name, value })
      name = nameIsPlaceholder ? resolvePlaceholders(name, values) : name
      value = valueIsPlaceholder ? resolvePlaceholders(value, values) : value
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
    morph(slot, partial.values[id], function * render (partial, onupdate) {
      const child = ctx.spawn(partial.key)
      const node = yield * partial.render(child, onupdate)
      if (node) cache.set(node, child)
      return node
    })
  }
}
