import { Readable, PassThrough } from 'stream'

const REF_ATTR = /\s*ref=("|')?$/i
const ATTRIBUTE = /<[a-z-]+[^>]*?\s+(([^\t\n\f "'>/=]+)=("|')?)?$/i
const BOOL_PROPS = [
  'async', 'autofocus', 'autoplay', 'checked', 'controls', 'default',
  'defaultchecked', 'defer', 'disabled', 'formnovalidate', 'hidden',
  'ismap', 'loop', 'multiple', 'muted', 'novalidate', 'open', 'playsinline',
  'readonly', 'required', 'reversed', 'selected'
]

/** @type {Context|null} */
let current

/** @type {WeakMap<object, Context>} */
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
 * @returns {any}
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
 * @param {...any} values Interpolated values
 * @returns
 */
export function html (strings, ...values) {
  return new Partial({ strings, values })
}

/**
 * Create svg partial
 * @example
 * svg`<circle cx="50" cy="50" r="50"/>`
 * @export
 * @param {string[]} strings Template literal strings
 * @param {...any} values Interpolated values
 * @returns
 */
export const svg = html

/**
 * Declare where partial is to be mounted in DOM, useful for SSR
 * @example
 * export mount(html`<body>Hello world</body>`, 'body')
 * @export
 * @param {Partial} partial The partial to mount
 * @param {string} selector A DOM selector
 * @param {object} [state] Initial state
 * @returns {Partial}
 */
export function mount (partial, selector, state = {}) {
  partial.selector = selector
  partial.state = state
  return partial
}

/**
 * Render partial to promise
 * @export
 * @param {Partial} partial The partial to render
 * @param {object} [state={}] Root state passed down to components
 * @returns {Promise}
 */
export async function render (partial, state = {}) {
  if (partial instanceof Component) partial = await unwrap(partial, state)
  if (!(partial instanceof Partial)) return Promise.resolve(partial)

  let string = ''
  for await (const chunk of parse(partial, state)) string += chunk
  return string
}

/**
 * Render partial to stream
 * @export
 * @param {Partial} partial The partial to render
 * @param {object} [state={}] Root state passed down to components
 * @returns {Readable}
 */
export function renderToStream (partial, state = {}) {
  if (partial instanceof Component) {
    const stream = new PassThrough()
    unwrap(partial, state).then(async function (res) {
      if (res instanceof Partial) renderToStream(res, state).pipe(stream)
      else if (res) stream.write(res)
      else stream.end()
    }, function (err) {
      stream.destroy(err)
    })
    return stream
  }
  return Readable.from(parse(partial, state))
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
 * @param {object} [state={}] Initial state
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
 * @param {...any} [args] Arguments to forward to component
 * @return {Component}
 */
export function Component (fn, ...args) {
  Object.setPrototypeOf(Render, Component.prototype)
  Render.fn = fn
  Render.args = args
  return Render

  function Render () {
    if (arguments.length) args = arguments
    return new Component(fn, ...args)
  }
}
Component.prototype = Object.create(Partial.prototype)
Component.prototype.constructor = Component

/**
 * Create iterable for partial
 * @param {Partial} partial The partial to parse
 * @param {object} [state={}] Root state passed down to components
 * @memberof Partial
 * @returns {AsyncGenerator}
 */
async function * parse (partial, state = {}) {
  const { strings, values } = partial

  // Claim top level state to prevent mutations
  if (!cache.has(state)) cache.set(state, partial)

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
          // Drop falsy boolean attributes altogether
          if (!value) yield string.slice(0, (attr.length + 1) * -1)
          // Leave only the attribute name in place for truthy attributes
          else yield string.slice(0, (attr.length - name.length) * -1)
          continue
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

/**
 * Resolve a value to string
 * @param {any} value The value to resolve
 * @param {object} state Current state
 * @returns {AsyncGenerator}
 */
async function * resolve (value, state) {
  if (Array.isArray(value)) {
    for (const val of value) yield * resolve(val, state)
    return
  }

  if (value instanceof Component) value = await unwrap(value, state)
  if (value instanceof Partial) {
    yield * parse(value, state)
  } else {
    yield value
  }
}

function unwrap (component, state) {
  const { fn, args } = component
  const ctx = current = new Context(state)
  const emit = ctx.emitter.emit.bind(ctx.emitter)
  return unwind(fn(ctx.state, emit), ctx, args)
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
 * Unwind nested generators, awaiting yielded promises
 * @param {any} value The value to unwind
 * @param {Context} ctx Current context
 * @param {Array} args Arguments to forward to setup functions
 * @returns {Promise<*>}
 */
async function unwind (value, ctx, args) {
  while (typeof value === 'function') {
    if (value instanceof Component) {
      value = await unwrap(value, ctx.state)
    } else {
      current = ctx
      value = value(...args)
      args = [] // Only forward arguments once – to the setup function
    }
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
 * @param {any} value
 * @returns {boolean}
 */
function isObject (value) {
  return Object.prototype.toString.call(value) === '[object Object]'
}

/**
 * Determine whether value is a generator object
 * @param {any} obj
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
 * @class Emitter
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
