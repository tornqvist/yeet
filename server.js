import { Readable } from 'stream'

const ATTRIBUTE = /<[a-z-]+[^>]*?\s+((\w+)=("|')?)?$/i // TODO: guard queries
const BOOL_PROPS = [
  'async', 'autofocus', 'autoplay', 'checked', 'controls', 'default',
  'defaultchecked', 'defer', 'disabled', 'formnovalidate', 'hidden',
  'ismap', 'loop', 'multiple', 'muted', 'novalidate', 'open', 'playsinline',
  'readonly', 'required', 'reversed', 'selected'
]

let current = null
const known = new WeakSet()
const cache = new WeakMap()

/**
 * Register a store
 * @example
 * function MyComponent (state, emit) {
 *   use(function (state, emitter) {
 *     state.name = 'world'
 *   })
 *   return (props) => html`<h1>Hello ${state.name}!</h1>`
 * }
 * @export
 * @param {function} fn A store function, will be called with state and emitter
 * @returns {*}
 */
export function use (fn) {
  return fn(current.state, current.emitter)
}

/**
 * Create html partial
 * @example
 * html`<h1>Hello world!</h1>`
 * @export
 * @param {string[]} strings Template literal strings
 * @param {...*} values Interpolated values
 * @returns
 */
export function html (strings, ...values) {
  return new Partial({ strings, values })
}

/**
 * Declare where partial is to be mounted in DOM, useful for SSR
 * @example
 * export mount(html`<body>Hello world</body>`, 'body')
 * @export
 * @param {Partial} partial The partial to mount
 * @param {string} selector A DOM selector
 * @returns {Partial}
 */
export function mount (partial, selector) {
  partial.selector = selector
  return partial
}

/**
 * Context for component
 * @class Context
 * @param {object} [state={}] Initial state
 * @param {object} [parent] Parent state
 */
function Context (state = {}, parent) {
  this.state = state
  this.emitter = new Emitter()
  cache.set(state, this)
  if (cache.has(parent)) {
    const ctx = cache.get(parent)
    this.emitter.on('*', ctx.emitter.emit.bind(ctx.emitter))
  }
}

/**
 * Create stateful component
 * @example
 * // Initialize when used
 * html`<div>${Component(Greeting, { name: 'world' })}</div>`
 * function Greeting (state, emit) {
 *   return (props) => html`<h1>Hello ${props.name}!</h1>`
 * }
 * @example
 * // Initialize when declaring
 * const Greeting = Component(function Greeting (state, emit) {
 *   return (props) => html`<h1>Hello ${props.name}!</h1>`
 * })
 * html`<div>${Greeting({ name: 'world' })}</div>`
 * @export
 * @class Component
 * @param {function} fn Component setup function
 * @param {...*} args Arguments to forward to component
 * @returns {(function|Component)}
 */
export function Component (fn, ...args) {
  if (!(this instanceof Component)) {
    return function render () {
      if (arguments.length) args = arguments
      return new Component(fn, ...args)
    }
  }
  this.fn = fn
  this.args = args
}

/**
 * Partial html content
 * @export
 * @class Partial
 */
export class Partial {
  constructor ({ strings, values }) {
    this.strings = strings
    this.values = values
  }

  async render (state) {
    let string = ''
    const iterable = this[Symbol.asyncIterator](state)
    for await (const chunk of iterable) string += chunk
    return string
  }

  renderToStream (state) {
    const iterable = this[Symbol.asyncIterator](state)
    return Readable.from(iterable)
  }

  async * [Symbol.asyncIterator] (state = {}) {
    const { strings, values } = this

    // An unrecognized state means we're at the root partial
    const root = !known.has(state)
    if (root) known.add(state)

    let html = ''
    for (let i = 0, len = strings.length; i < len; i++) {
      const string = strings[i]
      let value = await values[i]

      // Aggregate html as we pass through
      html += string

      const isAttr = ATTRIBUTE.test(html)

      // Flatten arrays
      if (Array.isArray(value)) {
        value = await Promise.all(value.flat())
      }

      if (isAttr) {
        if (typeof value === 'boolean' || value == null) {
          const [, attr, name, quote] = html.match(ATTRIBUTE)
          if (attr && BOOL_PROPS.includes(name)) {
            console.assert(!quote, `swf: Boolean attribute \`${name}\` should not be quoted, use instead \`${name}=\${${JSON.stringify(value)}}\`.`)
            if (!value) {
              // Drop falsy boolean attribute altogether
              yield string.slice(0, (attr.length + 1) * -1)
              continue
            }
            // Use name as value for truthy boolean values
            value = `"${name}"`
          }
        } if (Array.isArray(value)) {
          value = await Promise.all(value.map(function (val) {
            return isObject(val) ? objToAttrs(val) : val
          }))
          value = value.join(' ')
        } else if (isObject(value)) {
          value = await objToAttrs(value)
        }

        html += value
        yield string + value
        continue
      }

      // No use of aggregate outside attributes
      html = ''
      yield string

      if (value != null) {
        yield * resolve(value, state, root)
      }
    }
  }
}

/**
 * Resolve a value to string
 * @param {*} value The value to resolve
 * @param {object} state Current state
 * @param {boolean} root Is this value in the root component
 * @returns {AsyncGenerator}
 */
async function * resolve (value, parent, root) {
  if (Array.isArray(value)) {
    for (const val of value) yield * resolve(val, parent, root)
    return
  }

  if (typeof value === 'function') value = value()

  // Resolve component
  if (value instanceof Component) {
    let state = parent
    if (!root) {
      // Spawn child state
      state = Object.create(parent)
      known.add(state)
    }
    const { fn, args } = value
    const ctx = current = new Context(state, root ? null : parent)
    const emit = ctx.emitter.emit.bind(ctx.emitter)
    const component = fn(ctx.state, emit)
    try {
      value = await unwind(component, ctx, args)
    } catch (err) {
      if (current === ctx) current = null
      throw err
    }
  }

  if (value instanceof Partial) {
    yield * value[Symbol.asyncIterator](parent)
  } else {
    yield value
  }
}

/**
 * Serialize an object to html attributes
 * @param {object} obj An object
 * @returns {Promise<string>}
 */
async function objToAttrs (obj) {
  const arr = []
  for (let [key, value] of Object.entries(obj)) {
    value = await value
    arr.push(`${key}="${value}"`)
  }
  return arr.join(' ')
}

/**
 * Unwind a value and possible generator
 * @param {*} value The value to unwind
 * @param {array} args Arguments to forward to functions
 * @returns {Promise<*>}
 */
async function unwind (value, ctx, args) {
  while (typeof value === 'function') {
    current = ctx
    value = value(...args)
    args = []
  }
  if (isGenerator(value)) {
    let res = value.next()
    while (!res.done && (!res.value || res.value instanceof Promise)) {
      if (res.value instanceof Promise) {
        res.value = await res.value
        current = ctx
      }
      res = value.next(res.value)
    }
    return unwind(res.value, ctx, args)
  }
  return value
}

/**
 * Determine whether value is a plain object
 * @param {*} value
 * @returns {boolean}
 */
function isObject (value) {
  return Object.prototype.toString.call(value) === '[object Object]'
}

/**
 * Determine whether value is a generator object
 * @param {*} obj
 * @returns {boolean}
 */
function isGenerator (obj) {
  return obj &&
    typeof obj.next === 'function' &&
    typeof obj.throw === 'function'
}

/**
 * A basic event emitter implementation
 * @class Partial
 */
class Emitter extends Map {
  on (event, fn) {
    const listeners = this.get(event)
    if (listeners) listeners.add(fn)
    else this.set(event, new Set([fn]))
  }

  once (event, fn) {
    const onevent = (...args) => {
      fn(...args)
      this.removeListener(event, onevent)
    }
    this.on(event, onevent)
  }

  removeListener (event, fn) {
    const listeners = this.get(event)
    if (listeners) listeners.delete(fn)
  }

  emit (event, ...args) {
    if (event === 'render') return
    if (event !== '*') this.emit('*', event, ...args)
    if (!this.has(event)) return
    for (const fn of this.get(event)) fn(...args)
  }
}
