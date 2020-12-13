import { Readable, PassThrough } from 'stream'

const REF_ATTR = /\s*ref=("|')?$/i
const ATTRIBUTE = /<[a-z-]+[^>]*?\s+(([^\t\n\f "'>/=]+)=("|')?)?$/i // TODO: guard queries
const BOOL_PROPS = [
  'async', 'autofocus', 'autoplay', 'checked', 'controls', 'default',
  'defaultchecked', 'defer', 'disabled', 'formnovalidate', 'hidden',
  'ismap', 'loop', 'multiple', 'muted', 'novalidate', 'open', 'playsinline',
  'readonly', 'required', 'reversed', 'selected'
]

let current = null
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
  if (typeof partial === 'function') partial = partial()
  partial.selector = selector
  return partial
}

/**
 * Create ref
 * @export
 * @returns {Ref}
 */
export function ref () {
  return new Ref()
}

/**
 * Context for component
 * @class Context
 * @param {Object} [state={}] Initial state
 */
function Context (state = {}) {
  const ctx = cache.get(state)
  if (ctx) state = Object.create(state)
  this.emitter = new Emitter(ctx?.emitter)
  this.state = state
  cache.set(state, this)
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

    // Claim top level state to prevent mutations
    if (!cache.has(state)) cache.set(state, this)

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
        if (value instanceof Ref) {
          const match = REF_ATTR.exec(string)
          console.assert(match, !match && `swf: Got a ref as value for \`${string.match(ATTRIBUTE)?.[2]}\`, use instead \`ref=\${myRef}\`.`)
          yield string.replace(match[0], '')
          continue
        } else if (typeof value === 'boolean' || value == null) {
          const [, attr, name, quote] = html.match(ATTRIBUTE)
          if (attr && BOOL_PROPS.includes(name)) {
            console.assert(!quote, quote && `swf: Boolean attribute \`${name}\` should not be quoted, use instead \`${name}=\${${JSON.stringify(value)}}\`.`)
            if (!value) {
              // Drop falsy boolean attributes altogether
              yield string.slice(0, (attr.length + 1) * -1)
              continue
            }
            // Use name as value for truthy boolean values
            value = `"${name}"`
          }
        } else if (Array.isArray(value)) {
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
        yield * resolve(value, state)
      }
    }
  }
}

/**
 * Create stateful component, functions as proxy for partial
 * @example
 * // Initialize when used
 * html`<div>${Component(HelloFunction, { name: 'world' })}</div>`
 * @example
 * // Initialize when declaring
 * const Hello = Component(HelloFunction)
 * html`<div>${Hello({ name: 'world' })}</div>`
 * @export
 * @param {function} fn Component setup function
 * @param {...*} [args] Arguments to forward to component
 * @return {(function|Component)}
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

Component.prototype = Object.create(Partial.prototype)
Component.prototype.constructor = Component
Component.prototype.resolve = function (state = {}) {
  const { fn, args } = this
  const ctx = current = new Context(state)
  const emit = ctx.emitter.emit.bind(ctx.emitter)
  const component = fn(ctx.state, emit)
  return unwind(component, ctx, args).catch(function (err) {
    if (current === ctx) current = null
    throw err
  })
}
Component.prototype.render = async function (state = {}) {
  const res = await this.resolve(state)
  if (res instanceof Partial) return res.render(state)
  return res
}
Component.prototype.renderToStream = function (state = {}) {
  const stream = new PassThrough()
  this.resolve(state).then(function (res) {
    if (res instanceof Partial) res.renderToStream(state).pipe(stream)
    else if (res) stream.write(res)
    else stream.end()
  })
  return stream
}
Component.prototype[Symbol.asyncIterator] = async function * (state = {}) {
  const res = await this.resolve(state)
  if (res instanceof Partial) yield * res
  else yield res
}

/**
 * Resolve a value to string
 * @param {*} value The value to resolve
 * @param {Object} state Current state
 * @returns {AsyncGenerator}
 */
async function * resolve (value, state) {
  if (Array.isArray(value)) {
    for (const val of value) yield * resolve(val, state)
    return
  }

  if (typeof value === 'function') value = value()
  if (value instanceof Partial) {
    yield * value[Symbol.asyncIterator](state)
  } else {
    yield value
  }
}

/**
 * Serialize an object to html attributes
 * @param {Object} obj An object
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
 * Create a reference to a element node (available in Browser only)
 * @class Ref
 */
class Ref {}

/**
 * A basic event emitter implementation
 * @class Partial
 */
class Emitter extends Map {
  constructor (emitter) {
    super()
    if (emitter) {
      // Forward all event to provided emitter
      this.on('*', emitter.emit.bind(emitter))
    }
  }

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
