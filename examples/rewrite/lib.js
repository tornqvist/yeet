const RENDER = 'render'
const WILDCARD = '*'
const TEXT_NODE = 3
const ELEMENT_NODE = 1
const COMMENT_NODE = 8
const FRAGMENT_NODE = 11
const PLACEHOLDER_NODE = /^yeet-\d+$/
const PLACEHOLDER = /(?:data-)?yeet-(\d+)/
const TAG = /<[a-z-]+ [^>]+$/i
const COMMENT = /<!--(?!.*-->)/
const LEADING_WHITESPACE = /^\s+(<)/
const TRAILING_WHITESPACE = /(>)\s+$/
const ATTRIBUTE = /<[a-z-]+[^>]*?\s+(([^\t\n\f "'>/=]+)=("|')?)?$/i
const ON = /^on/

const { isArray } = Array
const { assign, create, entries, keys } = Object
const stack = []
const refs = new WeakMap()
const cache = new WeakMap()
const events = new WeakMap()
const templates = new WeakMap()

export function html (strings, ...values) {
  return new Partial(strings, values)
}

export function svg (strings, ...values) {
  return new Partial(strings, values, true)
}

export function raw (value) {
  return new Partial([String(value)], [])
}

export function ref () {
  return new Ref()
}

export function render (partial, state = {}) {
  return mount(null, partial, state)
}

export function mount (node, partial, state = {}) {
  const cached = cache.get(node)
  if (cached?.key === partial.key) {
    update(cached, partial)
    return node
  }
  const ctx = new Context(partial.key, state)
  node = morph(partial, ctx, node)
  cache.set(node, ctx)
  return toNode(node)
}

export function Component (fn, ...args) {
  if (this instanceof Component) {
    this.fn = fn
    this.args = args
    this.key = args[0]?.key || fn
    return this
  }
  return (...args) => new Component(fn, ...args)
}
Component.prototype = create(Partial.prototype)
Component.prototype.constructor = Component

function morph (partial, ctx, node) {
  const { editors } = ctx
  const template = partial instanceof Partial ? parse(partial) : toNode(partial)

  return fromTemplate(template, node)

  function fromTemplate (template, node) {
    const { nodeType } = template

    if (!node) node = template.cloneNode()
    if (nodeType === TEXT_NODE || nodeType === COMMENT_NODE) {
      const { nodeValue } = node
      if (PLACEHOLDER.test(nodeValue)) {
        const editor = (partial) => {
          node.nodeValue = resolvePlaceholders(nodeValue, partial.values)
        }
        editor(partial)
        editors.push(editor)
      } else {
        node.nodeValue = template.nodeValue
      }
      return node
    }

    if (nodeType === ELEMENT_NODE) {
      const editor = createAttributeEditor(template, node)
      if (editor) {
        editor(partial)
        editors.push(editor)
      }
    }

    if (node.nodeType === FRAGMENT_NODE) node = [...node.childNodes]
    if (node instanceof Child) node = node.node

    const children = []
    const oldChildren = isArray(node) ? [...node] : [...node.childNodes]
    template.childNodes.forEach(function eachChild (child, index) {
      if (isPlaceholder(child)) {
        const id = getPlaceholderId(child)
        const value = partial.values[id]
        const oldChild = pluck(value, oldChildren)
        child = new Child(oldChild, index, children, node)
        transform(child, value, ctx)
        editors.push(function editor (partial) {
          const isComponent = partial instanceof Component
          transform(child, isComponent ? partial : partial.values[id], ctx)
        })
      } else {
        const newChild = fromTemplate(child, pluck(child, oldChildren))
        child = new Child(null, index, children, node)
        upsert(child, newChild)
      }

      children[index] = child
      if (isArray(node)) node[index] = child
    })

    remove(oldChildren)

    return node
  }
}

function createAttributeEditor (template, node) {
  const placeholders = []
  const fixed = []

  for (const { name, value } of template.attributes) {
    if (PLACEHOLDER.test(name) || PLACEHOLDER.test(value)) {
      placeholders.push({ name, value })
      node.removeAttribute(name)
    } else {
      fixed.push(name)
      if (node.getAttribute(name) !== value) {
        node.setAttribute(name, value)
      }
    }
  }

  if (!placeholders.length) return null
  return function attributeEditor (partial) {
    const attrs = placeholders.reduce(function (attrs, { name, value }) {
      name = PLACEHOLDER.test(name)
        ? resolvePlaceholders(name, partial.values)
        : name
      value = PLACEHOLDER.test(value)
        ? resolvePlaceholders(value, partial.values)
        : value
      if (typeof name === 'object') {
        if (isArray(name)) {
          for (const value of name.flat()) {
            if (typeof value === 'object') assign(attrs, value)
            else attrs[value] = ''
          }
        } else {
          assign(attrs, name)
        }
      } else if (ON.test(name)) {
        const events = EventHandler.get(node)
        events.set(name, value)
      } else if (name === 'ref') {
        if (typeof value === 'function') value(node)
        else refs.set(value, node)
      } else if (value != null) {
        attrs[name] = value
      }
      return attrs
    }, {})

    for (let [name, value] of entries(attrs)) {
      if (isArray(value)) value = value.join(' ')
      if (name in node) node[name] = value
      else node.setAttribute(name, value)
    }

    const allowed = keys(attrs).concat(fixed)
    for (const { name } of node.attributes) {
      if (!allowed.includes(name)) {
        if (name in node) {
          node[name] = typeof node[name] === 'boolean' ? false : ''
        }
        node.removeAttribute(name)
      }
    }
  }
}

function transform (child, value, ctx) {
  if (!value) return upsert(child, null)

  const pick = pool(child.node)

  if (isArray(value)) {
    value = value.flat().reduce(function (order, value, index) {
      let newChild = pick(value)
      if (!newChild) newChild = new Child(null, index, order, child)
      transform(newChild, value, ctx)
      order.push(newChild)
      return order
    }, [])
    upsert(child, value)
    return
  }

  const oldNode = pick(value)
  const isPartial = value instanceof Partial

  if (isPartial && oldNode) {
    const cached = cache.get(oldNode)
    if (cached?.key === value.key) {
      update(cached, value)
      return
    }
  }

  if (isPartial) ctx = new Context(value.key, create(ctx.state))

  if (value instanceof Component) {
    value = unwrap(value, ctx, child)
  } else {
    value = morph(value, ctx, oldNode)
  }

  if (isPartial) cache.set(value, ctx)

  upsert(child, value)
}

function unwrap (value, root, child, index = 0) {
  let { fn, args } = value
  const current = root.stack[index]
  const render = fn(current.state, current.emit)

  current.emitter.on(RENDER, onupdate)
  current.editors.push(function editor (component) {
    args = component.args
    onupdate()
  })

  value = render(...args)

  let ctx = current
  if (value instanceof Partial) {
    ctx = root.stack[index + 1] = new Context(value.key, create(current.state))
  }

  if (value instanceof Component) {
    return unwrap(value, root, child, index + 1)
  }

  const pick = pool(child.node)
  const oldNode = pick(value)

  return morph(value, ctx, oldNode)

  function onupdate () {
    const value = render(...args)
    const next = root.stack[index + 1]
    if (next && next.key === value?.key) {
      update(next, value)
    } else {
      transform(child, value, current)
    }
  }
}

function upsert (child, newNode) {
  const { node: oldNode, index, order } = child

  if (newNode === oldNode) return
  if (isArray(newNode) && !cache.has(newNode) && oldNode) {
    if (isArray(oldNode) && !cache.has(oldNode)) {
      newNode.forEach(function (_node, _index) {
        if (!_node) return

        const oldIndex = oldNode.indexOf(_node)
        if (oldIndex !== -1) oldNode.splice(oldIndex, 1)

        let parent = child.parent
        while (parent instanceof Child) parent = parent.parent

        const prev = findPrev(_index, newNode)
        if (_node instanceof Child) _node = _node.node
        if (_node) {
          if (prev && prev.nextSibling !== _node) {
            prev.after(toNode(_node))
          } else if (!prev && parent.firstChild !== _node) {
            parent.prepend(toNode(_node))
          }
        }
      })

      remove(oldNode)
    } else {
      replace(oldNode, newNode)
    }
  } else if (newNode) {
    if (oldNode) {
      replace(oldNode, newNode)
    } else {
      let prev = findPrev(index, order)
      let parent = child.parent
      while (parent instanceof Child) parent = parent.parent
      if (prev) {
        if (prev instanceof Child) prev = prev.node
        prev.after(toNode(newNode))
      } else if (isArray(parent)) {
        parent[index] = newNode
      } else if (parent.firstChild !== newNode) {
        parent.prepend(toNode(newNode))
      }
    }
  } else {
    remove(oldNode)
  }

  child.node = newNode
}

function update (ctx, partial) {
  try {
    stack.unshift(ctx.state)
    for (const editor of ctx.editors) editor(partial)
  } finally {
    stack.shift()
  }
}

function findPrev (index, list) {
  for (let i = index - 1; i >= 0; i--) {
    let prev = list[i]
    if (prev instanceof Child) prev = prev.node
    if (isArray(prev)) prev = findPrev(prev.length, prev)
    if (prev) return prev
  }
  const item = list[index]
  if (item instanceof Child && item.parent instanceof Child) {
    return findPrev(item.parent.index, item.parent.order)
  }
}

function remove (node) {
  while (node instanceof Child) node = node.node
  if (isArray(node)) node.forEach(remove)
  else if (node) node.remove()
}

function replace (oldNode, newNode) {
  if (isArray(oldNode)) {
    oldNode = oldNode[0]
    remove(oldNode.slice(1))
  }
  oldNode.replaceWith(toNode(newNode))
}

function pool (nodes) {
  nodes = isArray(nodes) && !cache.has(nodes) ? [...nodes] : [nodes]
  return (value) => pluck(value, nodes)
}

function pluck (value, list) {
  if (!value) return null
  for (let i = 0, len = list.length; i < len; i++) {
    let isMatch
    const child = list[i]
    const node = child instanceof Child ? child.node : child
    if (!node) continue
    if (isArray(node) && !cache.has(node)) return pluck(value, node)
    if (value instanceof Partial) isMatch = cache.get(node)?.key === value.key
    else if (child === value) isMatch = true
    else isMatch = node.nodeType === (value.nodeType || TEXT_NODE)
    if (isMatch) return list.splice(i, 1)[0]
  }
  return null
}

function toNode (value) {
  if (!value) return null
  if (value instanceof window.Node) return value
  if (value instanceof Child) return value.node
  if (isArray(value)) {
    const fragment = document.createDocumentFragment()
    for (const node of value) fragment.append(toNode(node))
    return fragment
  }
  return document.createTextNode(String(value))
}

function getPlaceholderId (node) {
  return +node.nodeValue.match(PLACEHOLDER)[1]
}

function isPlaceholder (node) {
  const { nodeValue, nodeType } = node
  return nodeType === COMMENT_NODE && PLACEHOLDER_NODE.test(nodeValue)
}

function resolvePlaceholders (str, values) {
  const [match, id] = str.match(PLACEHOLDER)
  if (match === str) return values[+id]
  const pattern = new RegExp(PLACEHOLDER, 'g')
  return str.replace(pattern, (_, id) => values[+id])
}

function parse (partial) {
  const { strings, isSVG } = partial
  let template = templates.get(strings)
  if (template) return template
  const { length } = strings
  let html = strings.reduce(function compile (html, string, index) {
    html += string
    if (index === length - 1) return html
    if (ATTRIBUTE.test(html) || COMMENT.test(html)) html += `yeet-${index}`
    else if (TAG.test(html)) html += `data-yeet-${index}`
    else html += `<!--yeet-${index}-->`
    return html
  }, '').replace(LEADING_WHITESPACE, '$1').replace(TRAILING_WHITESPACE, '$1')
  const hasSVGTag = html.startsWith('<svg')
  if (isSVG && !hasSVGTag) html = `<svg>${html}</svg>`
  template = document.createElement('template')
  template.innerHTML = html
  template = template.content
  if (template.childNodes.length === 1) {
    template = template.firstChild
    if (isSVG && !hasSVGTag) template = template.firstChild
  }
  templates.set(strings, template)
  return template
}

function Child (node, index, order, parent) {
  this.node = node
  this.index = index
  this.order = order
  this.parent = parent
}

export function Partial (strings, values, isSVG = false) {
  this.key = strings
  this.strings = strings
  this.values = values
  this.isSVG = isSVG
}

function Context (key, state = {}) {
  this.key = key
  this.editors = []
  this.state = state
  this.stack = [this]
  this.emitter = new Emitter()
  this.emit = this.emitter.emit.bind(this.emitter)
}

/**
 * Reference a mounted node via ref#current
 * @class Ref
 * @export
 */
class Ref {
  get current () {
    return refs.get(this)
  }
}

/**
 * Generic event emitter
 * @class Emitter
 * @extends {Map}
 */
class Emitter extends Map {
  /**
   * Attach listener for event
   * @param {string} event Event name
   * @param {function(...any): void} fn Event listener function
   * @memberof Emitter
   */
  on (event, fn) {
    const listeners = this.get(event)
    if (listeners) listeners.add(fn)
    else this.set(event, new Set([fn]))
  }

  /**
   * Remove given listener for event
   * @param {string} event Event name
   * @param {function(...any): void} fn Registered listener
   * @memberof Emitter
   */
  removeListener (event, fn) {
    const listeners = this.get(event)
    if (listeners) listeners.delete(fn)
  }

  /**
   * Emit event to all listeners
   * @param {string} event Event name
   * @param {...any} args Event parameters to be forwarded to listeners
   * @memberof Emitter
   */
  emit (event, ...args) {
    if (event !== WILDCARD) this.emit(WILDCARD, event, ...args)
    if (!this.has(event)) return
    for (const fn of this.get(event)) fn(...args)
  }
}

/**
 * Implementation of EventListener
 * @link https://developer.mozilla.org/en-US/docs/web/api/eventlistener
 * @class EventHandler
 * @extends {Map}
 */
class EventHandler extends Map {
  /**
   * Create a new EventHandler
   * @param {Node} node The node onto which to attach events
   * @memberof EventHandler
   */
  constructor (node) {
    super()
    this.node = node
    events.set(node, this)
  }

  /**
   * Get an existing EvetnHandler for node or create a new one
   * @param {Node} node The node to bind listeners to
   * @returns {EventHandler}
   */
  static get (node) {
    return events.get(node) || new EventHandler(node)
  }

  /**
   * Delegate to assigned event listener
   * @param {Event} event
   * @returns {any}
   * @memberof EventHandler
   */
  handleEvent (event) {
    const handle = this.get(event.type)
    return handle.call(event.currentTarget, event)
  }

  /**
   * Add event listener
   * @param {string} key Event name
   * @param {function(Event): any} value Event listener
   * @memberof EventHandler
   */
  set (key, value) {
    const { node } = this
    const event = key.replace(ON, '')
    if (value) node.addEventListener(event, this)
    else node.removeEventListener(event, this)
    super.set(event, value)
  }
}
