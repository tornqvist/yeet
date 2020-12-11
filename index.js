const stack = []
const placeholders = new WeakMap()
const templates = new WeakMap()
const events = new WeakMap()
const cache = new WeakMap()
const hooks = new WeakMap()
const refs = new WeakMap()

const TAG = /<[a-z-]+ [^>]+$/i
const PLACEHOLDER = /__placeholder(\d+)__/
const PLACEHOLDERS = /__placeholder(\d+)__/g
const EVENT = '__CUSTOM_EVENT__'
const RENDER = 'render'
const TEXT_NODE = 3
const COMMENT_NODE = 8
const ELEMENT_NODE = 1
// const AFTER_UNMOUNT = 1
// const AFTER_UPDATE = 2
// const AFTER_RENDER = 3

const { isArray, from: toArray } = Array
const {
  entries,
  assign,
  keys
} = Object

/**
 * Create HTML content placeholder
 * @param {Array} strings Template literal strings
 * @param {...any} values Template literal values
 * @returns {Placeholder}
 */
export function html (strings, ...values) {
  const placeholder = new Placeholder(strings)
  placeholders.set(placeholder, new Partial(strings, values))
  return placeholder
}

/**
 * Register a store function to be used for current component context
 * @param {function} fn Store function
 */
export function use (fn) {
  const ctx = stack[0]
  fn(ctx.state, ctx)
}

/**
 * Conditionally interrupt execution preserving current DOM
 * @param {boolean} condition The condition for which to continue execution
 * @param {string} [message] The reason for stopping execution
 */
export function assert (condition, message) {
  if (!condition) throw new Halt(message)
}

/**
 * Create a stateful function
 * @param {function} fn The constructor which instantiates the function
 * @param {Object} props A set of properties to forward to function
 * @param {...any} args Any number of arguments forwarded to function
 * @returns {Placeholder}
 */
export function render (fn, props, ...args) {
  const key = props?.key || fn
  const component = new Component({ fn, props, args })
  const placeholder = new Placeholder(key)
  placeholders.set(placeholder, component)
  return placeholder
}

/**
 * Mount thing onto DOM node
 * @param {any} value The thing to mount
 * @param {Node} [node] Any compatible node
 * @returns {Node}
 */
export function mount (value, node) {
  if (typeof value === 'function') value = render(value)
  value = unwrap(value)

  const ctx = cache.get(node) || new Context()

  if (!(value instanceof Partial)) {
    value = toNode(value)
    if (!node) return value
    return resolve(value, node, ctx)
  }

  node = resolve(value.template, node, ctx)

  try {
    stack.unshift(ctx)
    for (const editor of ctx.editors) {
      update(node, editor, value.values)
    }
    return node
  } finally {
    stack.shift()
  }
}

/**
 * Apply update on node with given editor
 * @param {Element} node A Element node
 * @param {(NodeEditor|AttributeEditor)} editor An instance of a compatible editor
 * @param {Array} values An array of new values to update with
 */
function update (node, editor, values) {
  if (editor instanceof NodeEditor) {
    // TODO: Handle node
  }

  if (editor instanceof AttributeEditor) {
    const attrs = editor.dynamic.reduce(function (attrs, { name, value }) {
      name = resolveValue(name)
      value = resolveValue(value)
      if (typeof name === 'object') {
        assign(attrs, name)
      } else if (name.indexOf('on') === 0) {
        const events = new EventHandler(node)
        events.set(name, value)
      } else if (name === 'ref') {
        if (typeof value === 'function') return value(node)
        refs.set(value, node)
      } else if (value != null) {
        attrs[name] = value
      }
      return attrs
    }, {})

    for (let [name, value] of entries(attrs)) {
      if (name in node) node[name] = value
      if (typeof value === 'boolean') value = name
      node.setAttribute(name, value)
    }

    const allowed = keys(attrs).concat(editor.static)
    for (const { name } of node.attributes) {
      if (!allowed.includes(name)) {
        if (name in node) {
          node[name] = typeof node[name] === 'boolean' ? false : ''
        }
        node.removeAttribute(name)
      }
    }
  }

  /**
   * Replace placeholder values with actual value
   * @param {string} str A node property to match w/ values
   * @returns {string}
   */
  function resolveValue (str) {
    const match = PLACEHOLDER.match(str)
    if (match && match[0] === str) {
      return values[+match[1]]
    }
    return String(str).replace(PLACEHOLDERS, (_, id) => values[+id])
  }
}

/**
 * Resolve template into node, optionally canibalizing an existing node
 * @param {(Element|Partial)} template The desired result
 * @param {Node} [node] An existing element to be updated w/ template markup
 * @param {Context} [ctx] Current node context
 * @returns {Node}
 */
function resolve (template, node, ctx = cache.get(node)) {
  if (!ctx) ctx = new Context()
  if (!node) {
    node = template.cloneNode()
  } else if (events.has(node)) {
    events.get(node).clear()
  }

  const { editors } = ctx
  const { nodeType } = node

  if (nodeType === TEXT_NODE) {
    node.nodeValue = template.nodeValue
    return node
  }
  if (nodeType === COMMENT_NODE) {
    const { nodeValue } = node
    if (PLACEHOLDER.test(nodeValue)) return new NodeEditor(nodeValue)
    return node
  }

  if (nodeType === ELEMENT_NODE) {
    const editor = new AttributeEditor(template)

    editors.push(editor)

    for (const name of editor.static) {
      node.setAttribute(name, template.getAttribute(name))
    }

    for (const { name } of node.attributes) {
      if (!editor.static.includes(name)) {
        node.removeAttribute(name)
      }
    }
  }

  const oldChildren = toArray(node.childNodes)
  for (const child of template.childNodes) {
    const oldChild = match(child, oldChildren)
    let newChild = resolve(child, oldChild, ctx)
    if (newChild instanceof NodeEditor) {
      editors.push(newChild)
      newChild = document.createComment('editor')
    }
    node.appendChild(newChild)
    if (oldChild) oldChildren.splice(oldChildren.indexOf(oldChild), 1)
  }

  for (const oldChild of oldChildren) {
    oldChild.remove()
  }

  return node
}

/**
 * Find a compatible node
 * @param {(Node|Placeholder)} value The node to match
 * @param {Node[]} oldNodes Candidate nodes
 * @returns {(Node|undefined)}
 */
function match (value, oldNodes) {
  let candidate
  const placeholder = placeholders.get(value)
  for (const oldNode of oldNodes) {
    if (!oldNode) continue
    const ctx = cache.get(oldNode)
    if (placeholder) {
      if (ctx && ctx.key === placeholder.key) return oldNode
      if (!ctx && !candidate && placeholder instanceof Partial) {
        if (isEqualNode(placeholder.template, oldNode)) candidate = oldNode
      }
    } else if (!candidate && isEqualNode(value, oldNode)) {
      candidate = oldNode
    }
  }
  return candidate
}

/**
 * Determine wether two nodes are equal
 * @param {Node} [a]
 * @param {Node} [b]
 */
function isEqualNode (a, b) {
  if (!a || !b) return false
  if (a.id && b.id && a.id === b.id) return true
  if (a.nodeType === TEXT_NODE && a.nodeType === b.nodeType) return true
  if (a.nodeName === b.nodeName) return true
  return a.isEqualNode && a.isEqualNode(b)
}

/**
 * Unwrap placeholder value
 * @param {Placeholder} value The placeholder to unwrap
 * @returns {any}
 */
function unwrap (value) {
  const placeholder = placeholders.get(value)
  if (!placeholder) return value
  if (placeholder instanceof Partial) return placeholder
  if (!(placeholder instanceof Component)) return placeholder

  const { fn, props, args } = placeholder

  try {
    const arr = []
    const res = fn(state, emit)
    const value = unwind(res, arr)
    hooks.set(value, arr)
    return value
  } catch (err) {
    if (err instanceof Halt) return node
    throw err
  }
}

function unwind (value, hooks, id = 0) {
  while (typeof value === 'function') {
    value = value()
    id++
  }
  if (isGenerator(value)) {
    let res = value.next()
    while (!res.done && typeof res.value !== 'function') {
      res = value.next(res.value)
    }
    if (!res.done) {
      hooks.unshift([id, function hook () {
        while (!res.done) res = value.next(res.value)
      }])
    }
    return unwind(res.value, hooks, id + 1)
  }
  return value
}

function isGenerator (obj) {
  return obj &&
    typeof obj.next === 'function' &&
    typeof obj.throw === 'function'
}

function parse (strings) {
  let template = templates.get(strings)
  if (template) return template

  const { length } = strings
  template = document.createElement('template')
  template.innerHTML = strings.reduce(function compile (res, string, index) {
    res += string
    if (index === length - 1) return res
    if (TAG.test(res)) res += `data-__placeholder${index}__`
    else res += `<!--__placeholder${index}__-->`
    return res
  }, '').trim()

  const { content } = template
  template = content.childNodes.length > 1 ? content : content.firstChild
  templates.set(strings, template)
  return template
}

function canMount (a, b) {
  if (!a || !b) return false
  if (a.nodeType !== b.nodeType) return false
  if (a.nodeType === TEXT_NODE || a.nodeType === COMMENT_NODE) return true
  if (a.id !== b.id) return false
  if (a.nodeName === b.nodeName) return true
  return a.isEqualNode(b)
}

function toNode (value) {
  if (value == null) return null

  const type = typeof value

  if (type === 'object' && value.nodeType) return value
  if (type === 'function' || type === 'boolean' || type === 'number' ||
    value instanceof RegExp || value instanceof Date) value = value.toString()

  if (typeof value === 'string') {
    return document.createTextNode(value)
  }

  if (isArray(value)) {
    const fragment = document.createDocumentFragment()
    fragment.append(...value)
    return fragment
  }

  return null
}

function NodeEditor (str) {
  this.id = +str.match(PLACEHOLDER)[1]
}

function AttributeEditor (node) {
  this.dynamic = []
  this.static = []

  for (const { name, value } of node.attributes) {
    if (PLACEHOLDER.test(name) || PLACEHOLDER.test(value)) {
      this.dynamic.push({ name, value })
    } else {
      this.static.push(name)
    }
  }
}

function Placeholder (key) {
  this.key = key
}

function Partial (strings, values) {
  this.strings = strings
  this.values = values
  this.template = parse(strings)
}

function Component (fn, props, args) {
  this.fn = fn
  this.props = props
  this.args = args
}

class Context {
  constructor (state = {}) {
    this.editors = []
    this.state = state
    this.children = new Map()
    this.emitter = new Emitter()
  }

  spawn () {
    return new Context(Object.create(this.state))
  }

  bind (node) {
    const { emitter } = this

    node.addEventListener(EVENT, (event) => {
      emitter.emit(event.details.name, ...event.details.args)
    })

    emitter.on('*', function (name, ...args) {
      if (name !== RENDER && node.parentNode) {
        const details = { name, args }
        node.parentNode.dispatchEvent(new CustomEvent(EVENT, { details }))
      }
    })

    cache.set(node, this)
  }
}

class Emitter extends Map {
  on (event, fn) {
    const listeners = this.get(event)
    if (listeners) listeners.add(fn)
    else this.set(event, new Set([fn]))
  }

  once (event, fn) {
    this.on(event, (...args) => {
      fn(...args)
      this.removeListener(event, fn)
    })
  }

  removeListener (event, fn) {
    const listeners = this.get(event)
    if (listeners) listeners.delete(fn)
  }

  emit (event, ...args) {
    this.emit('*', [event, ...args])
    if (!this.has(event)) return
    for (const fn of this.get(event)) fn(...args)
  }
}

class Hooks extends Map {
  set (id, fn) {
    return super.set(id, () => this.delete(id) && fn())
  }
}

class Halt extends Error {}

export class Ref {
  get current () {
    return refs.get(this)
  }
}

class EventHandler extends Map {
  constructor (node) {
    const cached = events.get(node)
    if (cached) return cached
    this.node = node
  }

  handleEvent (event) {
    const handle = this.get(event.type)
    return handle(event)
  }

  set (key, value) {
    const { node } = this
    const event = key.replace(/^on/, '')
    if (value) node.addEventListener(event, this)
    else node.removeEventListener(event, this)
    super.set(event, value)
  }
}
