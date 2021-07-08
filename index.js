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
const HOOK = Symbol('HOOK')
const ON = /^on/
const ON_UNMOUNT = 0
const ON_UPDATE = 1
const ON_RENDER = 2

const { isArray } = Array
const { assign, create, entries, keys } = Object
const raf = window.requestAnimationFrame

/**
 * @callback Editor
 * @param {Partial} partial
 */

/**
 * @callback Store
 * @param {object} state
 * @param {Emitter} emitter
 * @returns {any}
 */

/**
 * @callback Initialize
 * @param {object} state
 * @param {Emit} emit
 * @returns {any}
 */

/**
 * @callback Resolver
 * @param {any} value
 * @param {number} id
 * @param {function(any): any} next
 * @returns {any}
 */

/** @type {Array<Context>} */
const stack = []

/** @type {WeakMap<Ref, Node>} */
const refs = new WeakMap()

/** @type {WeakMap<Node, Context>} */
const cache = new WeakMap()

/** @type {WeakMap<Node, EventHandler>} */
const events = new WeakMap()

/** @type {WeakMap<Array<string>, Node>} */
const templates = new WeakMap()

/**
 * Create HTML partial
 * @export
 * @param {Array<string>} strings Template literal strings
 * @param {...any} values Template literal values
 * @returns {Partial}
 */
export function html (strings, ...values) {
  return new Partial(strings, values)
}

/**
 * Create SVG partial
 * @export
 * @param {Array<string>} strings Template literal strings
 * @param {...any} values Template literal values
 * @returns {Partial}
 */
export function svg (strings, ...values) {
  return new Partial(strings, values, true)
}

/**
 * Treat raw HTML string as partial, bypassing HTML escape behavior
 * @export
 * @param {any} value
 * @returns {Partial}
 */
export function raw (value) {
  return new Partial([String(value)], [])
}

/**
 * Register a store function to be used for current component context
 * @export
 * @param {Store} fn Store function
 * @returns {any}
 */
export function use (fn) {
  const { state, emitter } = stack[0]
  return fn(state, emitter)
}

/**
 * Create element reference
 * @export
 * @returns {Ref}
 */
export function ref () {
  return new Ref()
}

/**
 * Render partial to Node
 * @export
 * @param {Partial} partial The partial to be rendered
 * @param {object} [state={}] Root state
 * @returns {Node}
 */
export function render (partial, state = {}) {
  return mount(null, partial, state)
}

/**
 * Mount partial onto DOM node
 * @export
 * @param {Node|string} node Any compatible node or node selector
 * @param {Partial} partial The partial to mount
 * @param {object} [state={}] Root state
 * @returns {Node}
 */
export function mount (node, partial, state = {}) {
  partial = call(partial)
  if (typeof node === 'string') node = document.querySelector(node)
  const cached = cache.get(node)
  if (cached?.key === partial.key) {
    update(cached, partial)
    return node
  }
  const ctx = new Context(partial.key, state)
  if (partial instanceof Component) {
    node = unwrap(partial, ctx, new Child(node))
  } else {
    node = morph(partial, ctx, node)
  }
  if (node) cache.set(node, ctx)
  return toNode(node)
}

/**
 * Creates a stateful component
 * @export
 * @param {Initialize} fn Component initialize function
 * @param {...args} args Arguments forwarded to component render function
 * @returns {function(...any): Component} Component render function
 */
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

/**
 * Render partial, optionally onto an existing node
 * @export
 * @param {Partial} partial The partial to be rendered
 * @param {Context} ctx Current rendering context
 * @param {Node} [node] Existing node
 * @returns {Node}
 */
function morph (partial, ctx, node) {
  const { editors } = ctx
  const template = partial instanceof Partial ? parse(partial) : toNode(partial)

  return fromTemplate(template, node)

  /**
   * Render template node onto existing node
   * @param {Node} template Node template element
   * @param {Node} [node] Existing node
   * @returns {Node}
   */
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
      } else if (node.nodeValue !== template.nodeValue) {
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
        const value = call(partial.values[id])
        const oldChild = pluck(value, oldChildren)
        child = new Child(oldChild, index, children, node)
        transform(child, value, ctx)
        editors.push(function editor (partial) {
          partial = call(partial)
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

/**
 * Create an attribute editor function
 * @param {Node} template Template node
 * @param {Node} node Target node
 * @returns {Editor}
 */
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

  /** @type {Editor} */
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
      if (name in node) {
        node[name] = value
      } else if (node.getAttribute(name) !== value) {
        node.setAttribute(name, value)
      }
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

/**
 * Transform child with given target value
 * @param {Child} child Current node child
 * @param {any} value The target value
 * @param {Context} ctx Current render context
 */
function transform (child, value, ctx) {
  value = call(value)

  if (!value) return upsert(child, null)

  const pick = pool(child.node)

  if (isArray(value)) {
    const newNode = value.flat().reduce(function (order, value, index) {
      value = call(value)
      let node = pick(value)
      while (node instanceof Child) node = node.node
      const newChild = new Child(node, index, order, child)
      transform(newChild, value, ctx)
      order.push(newChild)
      return order
    }, [])
    upsert(child, newNode)
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

  if (isPartial) ctx = spawn(ctx, value.key)

  if (value instanceof Component) {
    value = unwrap(value, ctx, child)
  } else {
    value = morph(value, ctx, oldNode)
  }

  if (value && isPartial) cache.set(value, ctx)

  upsert(child, value)
}

/**
 * Unpack component render value
 * @param {Component} value Component which to unwrap
 * @param {Context} root The rendering context
 * @param {Child} child Current child
 * @param {number} index Current unwrap depth
 * @returns {any}
 */
function unwrap (value, root, child, index = 0) {
  let rerender
  let { fn, args } = value
  let ctx = root.stack[index]

  ctx.emitter.on(RENDER, () => onupdate())
  ctx.editors.push(function editor (component) {
    args = component.args
    onupdate()
  })

  try {
    stack.unshift(ctx)
    value = unwind(fn(ctx.state, ctx.emit), resolve)
    if (value instanceof Promise) {
      value.then(onupdate)
      return null
    }
    if (value instanceof Component) {
      while (value instanceof Component) {
        ctx = spawn(ctx, value.key)
        root.stack.push(ctx)
        value = unwrap(value, root, child, index + 1)
      }
      return value
    } else if (value instanceof Partial) {
      ctx = spawn(ctx, value.key)
      root.stack.push(ctx)
    }
    const pick = pool(child.node)
    const oldNode = pick(value)
    if (value) value = morph(value, ctx, oldNode)
    return value
  } finally {
    stack.shift()
  }

  function onupdate (value = unwind(call(rerender, ...args), resolve, ON_UPDATE)) {
    const next = root.stack[index + 1]
    if (next && next.key === value?.key) {
      update(next, value)
    } else {
      transform(child, value, index ? root.stack[index - 1] : root)
    }
  }

  /** @type {Resolver} */
  function resolve (value, id, next) {
    if (value instanceof Promise) {
      return value.then(next, next).then(function (value) {
        if (id === ON_UNMOUNT) rerender = value
        return value
      })
    }
    try {
      if (id === ON_UNMOUNT) rerender = value
      if (typeof value === 'function') {
        return unwind(value(...args), resolve, id + 1)
      }
      if (value instanceof Partial) return value
    } finally {
      if (next) {
        if (id === ON_UNMOUNT) ctx.emitter.emit(HOOK, once(next, value))
        if (id === ON_RENDER) next(value)
        if (id === ON_UPDATE) raf(() => next(value))
      }
    }
    return next ? next(value) : value
  }
}

/**
 * Recursively unwind nested generator functions
 * @param {any} value The value to unwind
 * @param {Resolver} resolve Resolver function
 * @param {number} id Current unwind depth
 * @returns {any}
 */
function unwind (value, resolve, id = ON_UNMOUNT) {
  if (isGenerator(value)) {
    let res = value.next()
    return resolve(res.value, id, function next (resolved) {
      if (res.done) return
      res = value.next(resolved)
      const arg = res.done ? res.value : resolve(res.value, id, next)
      return unwind(arg, resolve, id)
    })
  }
  return resolve(value, id)
}

/**
 * Update node in-place
 * @param {Child} child Current child
 * @param {any} newNode New node to put in-place
 */
function upsert (child, newNode) {
  let { node: oldNode, index, order, parent } = child

  if (isArray(newNode) && !cache.has(newNode) && oldNode) {
    if (!isArray(oldNode)) oldNode = [oldNode]
    newNode.forEach(function (_node, _index) {
      while (_node instanceof Child) _node = _node.node
      if (!_node) return

      const oldIndex = oldNode.findIndex(function (_oldNode) {
        while (_oldNode instanceof Child) _oldNode = _oldNode.node
        return _oldNode === _node
      })
      if (oldIndex !== -1) oldNode.splice(oldIndex, 1)

      putInPlace(_node, _index, newNode)
    })

    remove(oldNode)
  } else if (newNode) {
    if (oldNode && newNode !== oldNode) {
      replace(oldNode, newNode)
    } else {
      putInPlace(newNode, index, order)
    }
  } else {
    remove(oldNode)
  }

  child.node = newNode

  function putInPlace (newNode, index, list) {
    let prev = findPrev(index, list)
    while (prev instanceof Child) prev = prev.node
    while (parent instanceof Child) parent = parent.parent
    if (prev) {
      if (prev.nextSibling !== newNode) {
        prev.after(toNode(newNode))
      }
    } else if (isArray(parent)) {
      parent[index] = newNode
    } else if (parent.firstChild !== newNode) {
      parent.prepend(toNode(newNode))
    }
  }
}

/**
 * Execute context editors with partial values
 * @param {Context} ctx Context which to update
 * @param {Partial} partial Partial with which to update
 */
function update (ctx, partial) {
  try {
    stack.unshift(ctx.state)
    for (const editor of ctx.editors) editor(partial)
  } finally {
    stack.shift()
  }
}

/**
 * Find previous node sibling
 * @param {number} index Where to start looking
 * @param {Array<Child|Node>} list Node siblings
 * @returns {Node}
 */
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

/**
 * Remove node
 * @param {Node|Child|Array<Node>} node Node to remove
 */
function remove (node) {
  while (node instanceof Child) node = node.node
  if (isArray(node)) {
    node.forEach(remove)
  } else if (node) {
    node.remove()
    unhook(node)
  }
}

/**
 * Replace node
 * @param {Node|Child|Array<Node>} oldNode Node to be replaced
 * @param {Node} newNode New node to insert
 */
function replace (oldNode, newNode) {
  while (oldNode instanceof Child) oldNode = oldNode.node
  if (isArray(oldNode)) {
    remove(oldNode.slice(1))
    replace(oldNode[0], newNode)
  } else {
    oldNode.replaceWith(toNode(newNode))
    unhook(oldNode)
  }
}

/**
 * Deplete all hooks registered with node
 * @param {Node} node Node by which to lookup hooks
 */
function unhook (node) {
  raf(function () {
    const cached = cache.get(node)
    if (cached) for (const hook of cached.hooks) hook()
  })
}

/**
 * Create a pool of Nodes from which to pluck values
 * @param {Array<Node|Child>} nodes List of nodes from which to pluck
 * @returns {function(any): Node}
 */
function pool (nodes) {
  nodes = isArray(nodes) && !cache.has(nodes) ? [...nodes] : [nodes]
  return (value) => pluck(value, nodes)
}

/**
 * Pluck matching node from list of nodes
 * @param {any} value Value for which to find a match
 * @param {Array<Node|Child>} list List of nodes from which to pluck
 * @returns {Node}
 */
function pluck (value, list) {
  if (!value) return null
  for (let i = 0, len = list.length; i < len; i++) {
    let isMatch
    const child = list[i]
    const node = child instanceof Child ? child.node : child
    const cached = cache.get(node)
    if (!node) continue
    if (isArray(node) && !cached) return pluck(value, node)
    if (value instanceof Partial) {
      isMatch = cached?.key === value.key
      if (!isMatch) {
        if (cached) continue
        value = parse(value)
      }
    } else {
      if (cached) continue
      else if (child === value) isMatch = true
    }
    if (!isMatch) isMatch = node.nodeName === toNode(value).nodeName
    if (isMatch && (node.id || value.id)) isMatch = node.id === value.id
    if (isMatch) return list.splice(i, 1)[0]
  }
  return null
}

/**
 * Cast value to node
 * @param {any} value The value to be cast
 * @returns {Node}
 */
function toNode (value) {
  if (!value) return null
  if (value instanceof window.Node) return value
  if (value instanceof Child) return toNode(value.node)
  if (isArray(value)) {
    const fragment = document.createDocumentFragment()
    for (const node of value) fragment.append(toNode(node))
    return fragment
  }
  return document.createTextNode(String(value))
}

/**
 * Call provided function
 * @param {function(...any): any} fn Function to be called
 * @param  {...any} args Arguments to forward to provided function
 * @returns {any}
 */
function call (fn, ...args) {
  return typeof fn === 'function' ? fn(...args) : fn
}

/**
 * Create wrapper for function to only be called once
 * @param {function(any): any} fn Function which to wrap
 * @param  {...any} args Arguments to forward to function
 * @returns {function(): void}
 */
function once (fn, ...args) {
  let done = false
  return function () {
    if (done) return
    done = true
    fn(...args)
  }
}

/**
 * Determine wether value is generator
 * @param {any} obj Object to test
 * @returns {Boolean}
 */
function isGenerator (obj) {
  return obj &&
    typeof obj.next === 'function' &&
    typeof obj.throw === 'function'
}

/**
 * Create a new context, forwarding events to parent
 * @param {Context} parent Context object from which to inherit state
 * @param {any} key New context key value
 * @returns {Context}
 */
function spawn (parent, key) {
  const ctx = new Context(key, create(parent.state))
  ctx.emitter.on('*', function (event, ...args) {
    if (event !== RENDER) parent.emit(event, ...args)
  })
  return ctx
}

/**
 * Get placeholder id
 * @param {Node} node The placeholder node
 * @returns {number}
 */
function getPlaceholderId (node) {
  return +node.nodeValue.match(PLACEHOLDER)[1]
}

/**
 * Determine whether node is a placeholder node
 * @param {Node} node The node to test
 * @returns {Boolean}
 */
function isPlaceholder (node) {
  const { nodeValue, nodeType } = node
  return nodeType === COMMENT_NODE && PLACEHOLDER_NODE.test(nodeValue)
}

/**
 * Resolve values from placeholder string
 * @param {string} str String from which to match values
 * @param {Array<any>} values List of values to replace placeholders with
 * @returns {any}
 */
function resolvePlaceholders (str, values) {
  const [match, id] = str.match(PLACEHOLDER)
  if (match === str) return values[+id]
  const pattern = new RegExp(PLACEHOLDER, 'g')
  return str.replace(pattern, (_, id) => values[+id])
}

/**
 * Parse partial
 * @param {Partial} partial The partial to parse
 * @returns {Node}
 */
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
  if (template.childNodes.length === 1 && !isPlaceholder(template.firstChild)) {
    template = template.firstChild
    if (isSVG && !hasSVGTag) template = template.firstChild
  }
  templates.set(strings, template)
  return template
}

/**
 * Child node container
 * @class Child
 * @param {Node} node Current node
 * @param {number} index Node position
 * @param {Array<Node|Child>} order List of sibling nodes
 * @param {Node} parent Parent node
 */
function Child (node, index, order, parent) {
  this.node = node
  this.index = index
  this.order = order
  this.parent = parent
}

/**
 * Create a HTML partial object
 * @export
 * @class Partial
 * @param {Array<string>} strings Template strings
 * @param {Array<any>} values Template partials
 * @param {Boolean} isSVG Whether the partial is an SVG node
 */
export function Partial (strings, values, isSVG = false) {
  this.key = strings
  this.strings = strings
  this.values = values
  this.isSVG = isSVG
}

/**
 * Create a context object
 * @export
 * @class Context
 * @param {any} key Unique context identifier
 * @param {object} [state={}] Context state object
 */
function Context (key, state = {}) {
  this.key = key
  this.hooks = []
  this.editors = []
  this.state = state
  this.stack = [this]
  this.emitter = new Emitter()
  this.emit = this.emitter.emit.bind(this.emitter)
  this.emitter.on(HOOK, (fn) => this.hooks.push(fn))
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
