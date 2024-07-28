import { EVENT_PREFIX, EventHandler } from './event-handler.js'
import { Component, components } from './component.js'
import { stack, cache } from './context.js'
import { Fragment } from './fragment.js'
import { Partial } from './partial.js'
import { Slot } from './slot.js'
import { refs } from './ref.js'

/** @typedef {import('./context.js').Context} Context */
/** @typedef {import('./context.js').Editor} Editor */

const TAG = /<[a-z-]+ [^>]+$/i
const COMMENT = /<!--(?!.*-->)/
const LEADING_WHITESPACE = /^\s+(<)/
const TRAILING_WHITESPACE = /(>)\s+$/
const ATTRIBUTE = /<[a-z-]+[^>]*?\s+(([^\t\n\f "'>/=]+)=("|')?)?$/i

/** @type {WeakMap<Array<string>, Node>} */
const templates = new WeakMap()

export const TEXT_NODE = 3
export const ELEMENT_NODE = 1
export const COMMENT_NODE = 8
export const FRAGMENT_NODE = 11
export const PLACEHOLDER = /yeet-(\w+)-(\d+)/
export const WHITESPACE = /^\s+$/

export const { assign, keys, entries } = Object
export const { isArray } = Array

/**
 * @param {Element} element
 * @param {object[]} attributes
 * @param {string} attributes[].name
 * @param {string} attributes[].value
 * @returns {Editor}
 */
export function createAttributeEditor(element, attributes) {
  return function attributeEditor(partial) {
    const attrs = attributes.reduce(function (attrs, { name, value }) {
      const _name = PLACEHOLDER.test(name)
        ? resolvePlaceholders(name, partial.values)
        : name
      const _value = PLACEHOLDER.test(value)
        ? resolvePlaceholders(value, partial.values)
        : value

      if (typeof _name === 'object') {
        if (isArray(_name)) {
          for (const item of _name) {
            if (typeof item === 'object') assign(attrs, item)
            else attrs[String(item)] = ''
          }
        } else {
          assign(attrs, _name)
        }
      } else if (EVENT_PREFIX.test(_name)) {
        const events = EventHandler.get(element)
        events.set(_name, _value)
      } else if (_name === 'ref') {
        if (typeof _value === 'function') _value(element)
        else refs.set(_value, element)
      } else if (_value != null) {
        attrs[String(_name)] = _value
      }

      return attrs
    }, {})

    for (let [name, value] of entries(attrs)) {
      if (isArray(value)) value = value.join(' ')
      if (name in element) {
        element[name] = value
      } else if (element.getAttribute(name) !== value) {
        element.setAttribute(name, value)
      }
    }
  }
}

/**
 * @param {string} str
 * @param {any[]} values
 * @returns {any}
 */
export function resolvePlaceholders(str, values) {
  const [match, , id] = str.match(PLACEHOLDER)
  if (match === str) return values[+id]
  const pattern = new RegExp(PLACEHOLDER, 'g')
  return str.replace(pattern, (_, type, id) => values[+id])
}

/**
 * @param {Component} value
 * @param {Context} ctx
 * @param {Slot} slot
 * @param {number} [index=0]
 * @param {Context[]} [layers=[]]
 * @returns {[any, Context]}
 */
export function resolveComponent(value, ctx, slot, index = 0, layers = []) {
  while (value instanceof Component) {
    ctx = ctx.spawn(value.key)
    const editor = createComponentEditor(slot, ctx, index, layers)
    value = value.render(ctx, editor)
    layers[index++] = ctx
  }
  return [value, ctx]
}

/**
 * @param {Slot} slot
 * @param {Context} ctx
 * @param {number} [index=0]
 * @param {Context[]} [layers=[]]
 * @returns {function(any): void})}
 */
export function createComponentEditor(slot, ctx, index = 0, layers = []) {
  let prev
  return function editor(value) {
    let _index = index
    while (value instanceof Component) {
      const layer = layers[_index++]
      if (layer?.key === value.key) {
        update(ctx, value)
        value = layer
        ctx = layer
      } else {
        ;[value, ctx] = resolveComponent(value, ctx, slot, index, layers)
      }
    }
    prev = ctx
    layers.splice(_index, layers.length)
    if (prev.key === value?.key) {
      update(prev, value)
    } else {
      morph(slot, value, ctx)
    }
  }
}

/**
 * @param {number} id
 * @param {Slot} slot
 * @param {Context} ctx
 * @returns {Editor}
 */
export function createNodeEditor(id, slot, ctx) {
  const editor = createComponentEditor(slot, ctx)

  return function (partial) {
    const value = partial.values[id]
    if (value instanceof Component) {
      editor(value)
    } else {
      morph(slot, value, ctx)
    }
  }
}

/**
 * @param {Slot} slot
 * @param {any} newChild
 * @param {Context} ctx
 */
export function morph(slot, newChild, ctx) {
  const newChildren = Array.isArray(newChild) ? newChild : [newChild]
  const oldChildren = slot.children.flatMap(
    /**
     * @param {Node|Slot|Fragment} child
     * @returns {Node|Fragment|(Node|Fragment)[]}
     */
    function flatten(child) {
      return child instanceof Slot ? child.children.flatMap(flatten) : child
    }
  )

  slot.children = newChildren.map(
    /**
     * @param {any} newChild
     * @param {number} index
     * @returns {any}
     */
    function eachChild(newChild, index) {
      if (typeof newChild === 'function') newChild = newChild()

      if (newChild instanceof Component) {
        for (const oldChild of oldChildren) {
          const cached = cache.get(oldChild)
          if (oldChild instanceof Component && newChild.key === oldChild.key) {
            update()
          }
        }
      }

      if (newChild instanceof Partial) {
        let i = 0
        while (oldChildren.length) {
          const oldChild = oldChildren[i]
          if (!oldChild) continue
          if (oldChild instanceof Slot) {
            return morph(oldChild, newChild, ctx)
          } else {
            const cached = cache.get(oldChild)
            if (cached?.key === newChild.key) {
              update(cached, newChild)
              return oldChild
            }
          }
          remove(oldChildren.splice(i++, 1))
        }

        ctx = ctx.spawn(newChild.key)
        const _newChild = toNode(newChild, ctx)
        update(ctx, newChild)
        if (_newChild) {
          cache.set(_newChild, ctx)
          insert(_newChild, slot)
        }
        return _newChild
      } else if (newChild != null) {
        const oldChild = oldChildren[index]
        if (oldChild?.nodeType === TEXT_NODE) {
          newChild = String(newChild)
          if (oldChild.nodeValue !== newChild) {
            oldChild.nodeValue = newChild
          }
          return oldChild
        } else {
          newChild = toNode(newChild, ctx)
          if (oldChild) replace(oldChild, newChild)
          else insert(newChild, slot)
          oldChildren[index] = newChild
          return newChild
        }
      } else {
        remove(oldChildren[index])
        return null
      }
    }
  )
}

/**
 * @param {Node} node
 * @param {Slot} slot
 */
export function insert(node, slot) {
  const next = slot.siblings
    .slice(slot.index)
    .flatMap(
      /**
       * @param {Slot|Node|null} child
       * @param {number} index
       * @param {(Slot|Node|null)[]} list
       * @returns {((Node|null)[])|Node|null}
       */
      function flat(child, index, list) {
        return child instanceof Slot ? child.children.flatMap(flat) : child
      }
    )
    .find(Boolean)

  if (next) slot.parent.insertBefore(node, next)
  else slot.parent.appendChild(node)
}

/**
 * @param {Partial} partial
 * @returns {Node|null}
 */
export function parse(partial) {
  const { strings, isSVG } = partial

  /** @type {Node|null|undefined} */
  let template = templates.get(strings)
  if (template) return template

  const { length } = strings
  let html = strings
    .reduce(function compile(html, string, index) {
      html += string
      if (index === length - 1) return html
      if (ATTRIBUTE.test(html)) html += `yeet-value-${index}`
      else if (TAG.test(html)) html += `yeet-attribute-${index}`
      else if (COMMENT.test(html)) html += `yeet-text-${index}`
      else html += `<!--yeet-node-${index}-->`
      return html
    }, '')
    .replace(LEADING_WHITESPACE, '$1')
    .replace(TRAILING_WHITESPACE, '$1')

  const wrap = isSVG && !html.startsWith('<svg')
  if (wrap) html = `<svg>${html}</svg>`

  const container = document.createElement('template')
  container.innerHTML = html
  template = container.content
  const { firstChild, childNodes } = template
  if (childNodes.length === 1 && firstChild && !isPlaceholder(firstChild)) {
    template = firstChild
    if (wrap) template = template.firstChild
  }

  if (template) templates.set(strings, template)

  return template
}

/**
 * Determine whether node is a placeholder node
 * @param {Node} node The node to test
 * @returns {Boolean}
 */
export function isPlaceholder(node) {
  const { nodeValue, nodeType } = node
  if (nodeType !== COMMENT_NODE) return false
  const match = nodeValue?.match(PLACEHOLDER)
  return match?.[1] === 'node'
}

/**
 * Get placeholder id
 * @param {Node} node The placeholder node
 * @returns {number}
 */
export function getPlaceholderId(node) {
  // @ts-expect-error nodeValue is always defined
  return +node.nodeValue.match(PLACEHOLDER)[2]
}

/**
 * @param {any} value
 * @param {Context} ctx
 * @returns {Node|null}
 */
export function toNode(value, ctx) {
  if (value == null) return null
  if (value instanceof window.Node) return value
  if (Array.isArray(value)) {
    const fragment = document.createDocumentFragment()
    for (let node of value) {
      node = toNode(node, ctx)
      if (node) fragment.append()
    }
    return fragment
  }

  if (value instanceof Partial) {
    const template = parse(value)
    if (template) {
      const node = template.cloneNode(true)
      compile(node, ctx)
      return node
    }

    return null
  }

  return document.createTextNode(String(value))
}

/**
 * @param {Node} node
 * @param {Context} ctx
 * @returns {Editor[]}
 */
export function compile(node, ctx) {
  const length = ctx.editors.length

  handleNode(node, ctx)

  const walker = document.createTreeWalker(node, 1 | 128, null)
  for (let next = walker.nextNode(); next; next = walker.nextNode()) {
    handleNode(next, ctx)
  }

  return ctx.editors.slice(length)
}

/**
 * @param {Node} node
 * @param {Context} ctx
 */
function handleNode(node, ctx) {
  const { nodeType } = node
  if (isPlaceholder(node)) {
    const id = getPlaceholderId(node)
    /** @type {Element} */
    const parent = node.parentElement
    /** @type {Node[]} */
    const children = [...parent.childNodes]
    const slot = new Slot(parent, children.indexOf(node), [node])
    ctx.editors.push(createNodeEditor(id, slot, ctx))
  } else if (nodeType === ELEMENT_NODE) {
    const attributes = []

    for (const { name, value } of [...node.attributes]) {
      if (PLACEHOLDER.test(name) || PLACEHOLDER.test(value)) {
        attributes.push({ name, value })
        node.removeAttribute(name)
      }
    }

    if (attributes.length) {
      ctx.editors.push(createAttributeEditor(node, attributes))
    }
  }
}

/**
 * @param {Context} ctx
 * @param {Partial|Component} partial
 */
export function update(ctx, partial) {
  try {
    stack.unshift(ctx)
    for (const editor of ctx.editors) {
      editor(partial)
    }
  } finally {
    stack.shift()
  }
}

/**
 * @param {Node|Slot|Fragment|null|(Node|Slot|Fragment|null)[]} node
 */
export function remove(node) {
  if (!node) return
  if (Array.isArray(node)) {
    node.forEach(remove)
  } else if (node instanceof Slot || node instanceof Fragment) {
    remove(node.children)
  } else if (node instanceof window.Node) {
    node.parentNode?.removeChild(node)
  }
}

/**
 * @param {*} oldNode
 * @param {*} newNode
 */
export function replace(oldNode, newNode) {
  if (Array.isArray(oldNode)) {
    const [first, ...rest] = oldNode
    replace(first, newNode)
    remove(rest)
  } else if (Array.isArray(newNode)) {
    const [first, ...rest] = newNode
    const next = oldNode.nextSibling
    replace(oldNode, first)
    for (const newNode of rest) {
      if (next) first.parentNode.insertBefore(newNode, next)
      else first.parentNode.appendChild(newNode)
    }
  } else {
    oldNode.replaceWith(newNode)
  }
}
