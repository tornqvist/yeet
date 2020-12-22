const stack = []
const placeholders = new WeakMap()
const templates = new WeakMap()
const events = new WeakMap()
const cache = new WeakMap()
const hooks = new WeakMap()
const refs = new WeakMap()

const TAG = /<[a-z-]+ [^>]+$/i
const ATTRIBUTE = /<[a-z-]+[^>]*?\s+(([^\t\n\f "'>/=]+)=("|')?)?$/i
const PLACEHOLDER = /(?:data-)?__placeholder(\d+)__/
const PLACEHOLDERS = /(?:data-)?__placeholder(\d+)__/g
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
 * Create HTML partial
 * @param {Array} strings Template literal strings
 * @param {...any} values Template literal values
 * @returns {Partial}
 */
export function html (strings, ...values) {
  return new Partial({ strings, values })
}

/**
 * Register a store function to be used for current component context
 * @param {function} fn Store function
 */
export function use (fn) {
  const ctx = stack[0]
  fn(ctx.state, ctx.emitter)
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
 * Mount thing onto DOM node
 * @param {any} value The thing to mount
 * @param {window.Node} [node] Any compatible node
 * @returns {window.Node}
 */
export function mount (value, node, state = {}) {
  const ctx = new Context(value.key, state)
  node = render(value.template, node, ctx)
  ctx.update(value.values)
  cache.set(node, ctx)
  return node
}

/**
 * Render template into node, optionally canibalizing an existing node
 * @param {window.Node} template The desired result
 * @param {window.Node} [node] An existing element to be updated
 * @param {Context} [ctx] Current node context
 * @returns {window.Node}
 */
function render (template, node, ctx = cache.get(node)) {
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
    if (PLACEHOLDER.test(nodeValue)) return new Placeholder()
    return node
  }

  if (nodeType === ELEMENT_NODE) {
    const placeholders = []
    const fixed = []

    for (const { name, value } of template.attributes) {
      if (PLACEHOLDER.test(name)) {
        node.removeAttribute(name)
        placeholders.push({ name, value })
      } else if (PLACEHOLDER.test(value)) {
        placeholders.push({ name, value })
      } else {
        fixed.push(name)
      }
    }

    for (const name of fixed) {
      node.setAttribute(name, template.getAttribute(name))
    }

    if (placeholders.length) {
      editors.push(function editAttributes (values) {
        const attrs = placeholders.reduce(function (attrs, { name, value }) {
          name = resolveValue(name)
          value = resolveValue(value)
          if (isArray(value)) {
            attrs[name] = value.join(' ')
          } else if (typeof name === 'object') {
            if (isArray(name)) {
              for (const value of name.flat()) {
                if (typeof value === 'object') assign(attrs, value)
                else attrs[value] = ''
              }
            } else {
              assign(attrs, name)
            }
          } else if (name.indexOf('on') === 0) {
            const events = new EventHandler(node)
            events.set(name, value)
          } else if (name === 'ref') {
            if (typeof value === 'function') value(node)
            else refs.set(value, node)
          } else if (value != null) {
            attrs[name] = value
          }
          return attrs
        }, {})

        for (const [name, value] of entries(attrs)) {
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

        /**
         * Replace placeholder values with actual value
         * @param {string} str A node property to match w/ values
         * @returns {string}
         */
        function resolveValue (str) {
          const match = str.match(PLACEHOLDER)
          if (match && match[0] === str) {
            return values[+match[1]]
          }
          return String(str).replace(PLACEHOLDERS, (_, id) => values[+id])
        }
      })
    }
  }

  const children = []
  const oldChildren = toArray(node.childNodes)
  for (const [index, child] of template.childNodes.entries()) {
    const oldChild = oldChildren.find((oldChild) => canMount(oldChild, child))
    let newChild = render(child, oldChild, ctx)
    if (newChild instanceof Placeholder) {
      newChild = child.cloneNode()
      const editor = createNodeEditor(newChild, index, children)
      editors.push(editor)
    }
    children.push(newChild)
    node.appendChild(newChild)
    if (oldChild) oldChildren.splice(oldChildren.indexOf(oldChild), 1)
  }

  for (const oldChild of oldChildren) {
    oldChild.remove()
  }

  return node

  function createNodeEditor (oldChild, index, list) {
    const id = +oldChild.nodeValue.match(PLACEHOLDER)[1]

    return function editNode (values) {
      let newChild = values[id]

      if (Array.isArray(newChild)) {
        const keys = []
        const oldChildren = isArray(oldChild) ? oldChild : [oldChild]
        newChild = newChild.flat().map(function (newChild) {
          if (newChild instanceof Partial) {
            console.assert(!keys.includes(newChild.key), 'swf: Each child in an array should have a unique key prop `MyComponent({ key: \'my-key\' })`')
            keys.push(newChild.key)

            for (const [index, child] of oldChildren.entries()) {
              const ctx = cache.get(child)
              if (ctx?.key === newChild.key) {
                ctx.update(newChild.values)
                oldChildren.splice(index, 1)
                return child
              }
            }

            for (const [index, child] of oldChildren.entries()) {
              if (canMount(newChild, child)) {
                oldChildren.splice(index, 1)
                return mount(newChild, child, stack[0]?.state)
              }
            }

            return newChild.render(stack[0]?.state)
          }

          newChild = toNode(newChild)
          for (const child of oldChildren) {
            if (canMount(newChild, child)) {
              return mount(newChild, child)
            }
          }

          return newChild
        })

        // FIXME: probably has an impact on performance
        const fragment = document.createDocumentFragment()
        for (const child of newChild) fragment.appendChild(child)
        insert(fragment)

        remove(oldChildren)
      } else {
        if (oldChild) {
          if (newChild instanceof Partial) {
            const ctx = cache.get(oldChild)
            if (ctx?.key === newChild.key) {
              ctx.update(newChild.values)
              newChild = oldChild
            } else {
              newChild = newChild.render(stack[0]?.state)
              replace(oldChild, newChild)
            }
          } else {
            newChild = toNode(newChild)
            if (newChild) replace(oldChild, newChild)
            else remove(oldChild)
          }
        } else {
          newChild = toNode(newChild)
          if (newChild) insert(oldChild)
        }
      }

      oldChild = list[index] = newChild
    }

    function insert (newChild) {
      const next = list.slice(index + 1).find(Boolean)
      if (next) next.before(newChild)
      else node.append(newChild)
    }
  }
}

/**
 * Determine wether two nodes are compatible
 * @param {window.Node} [a]
 * @param {window.Node} [b]
 */
function canMount (a, b) {
  if (!a || !b) return false
  if (a.id || b.id) return a.id === b.id
  if (
    (a.nodeType === TEXT_NODE || a.nodeType === COMMENT_NODE) &&
    a.nodeType === b.nodeType
  ) return true
  if (a.nodeName === b.nodeName) return true
  return a.isEqualNode?.(b)
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
    if (ATTRIBUTE.test(res)) res += `__placeholder${index}__`
    else if (TAG.test(res)) res += `data-__placeholder${index}__`
    else res += `<!--__placeholder${index}__-->`
    return res
  }, '')
  const { content } = template
  template = content.childNodes.length > 1 ? content : content.childNodes[0]
  templates.set(strings, template)
  return template
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

function remove (value) {
  if (!isArray(value)) return value.remove()
  for (const child of value) child.remove()
}

function replace (value, child) {
  if (!isArray(value)) return value.replaceWith(child)
  value.replaceWith(child)
  remove(value)
}

function Placeholder () {}

export class Partial {
  constructor ({ strings, values }) {
    this.key = strings
    this.strings = strings
    this.values = values
  }

  get template () {
    return parse(this.strings)
  }

  render (state = {}) {
    const ctx = new Context(this.key, state)
    const node = render(this.template, null, ctx)
    ctx.update(this.values)
    cache.set(node, ctx)
    return node
  }
}

export function Component (fn, ...args) {
  Object.setPrototypeOf(Render, Component.prototype)
  Render.key = args.length ? args[0].key : fn
  Render.fn = fn
  Render.args = args
  return Render

  function Render () {
    const _args = arguments.length ? arguments : args
    return new Component(fn, ..._args)
  }
}

Component.prototype = Object.create(Partial.prototype)
Component.prototype.constructor = Component
Component.prototype.render = function (state = {}) {
  const { key, fn, args } = this
  const ctx = new Context(key, state)
  const emit = ctx.emitter.emit.bind(ctx.emitter)

  try {
    stack.unshift(ctx)
    const arr = []
    const res = fn(state, emit)
    const value = unwind(res, arr)
    hooks.set(value, arr)
    return value
  } finally {
    stack.shift(ctx)
  }
}

class Context {
  constructor (key, state = {}) {
    this.key = key
    this.editors = []
    this.state = state
    this.emitter = new Emitter()
  }

  spawn () {
    return new Context(Object.create(this.state))
  }

  update (values) {
    try {
      stack.unshift(this)
      for (const editor of this.editors) {
        editor(values)
      }
    } finally {
      stack.shift()
    }
  }

  bind (node) {
    const { emitter } = this

    node.addEventListener(EVENT, (event) => {
      emitter.emit(event.details.name, ...event.details.args)
    })

    emitter.on('*', function (name, ...args) {
      if (name !== RENDER && node.parentNode) {
        const details = { name, args }
        node.parentNode.dispatchEvent(new window.CustomEvent(EVENT, { details }))
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

class Halt extends Error {}

export class Ref {
  get current () {
    return refs.get(this)
  }
}

class EventHandler extends Map {
  constructor (node) {
    super()
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
