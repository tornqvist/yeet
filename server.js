const RENDER = 'render'
const REF_ATTR = /\s*ref=("|')?$/i
const ATTRIBUTE = /<[a-z-]+[^>]*?\s+(([^\t\n\f "'>/=]+)=("|')?)?$/i
const BOOL_PROPS = [
  'async', 'autofocus', 'autoplay', 'checked', 'controls', 'default',
  'defaultchecked', 'defer', 'disabled', 'formnovalidate', 'hidden',
  'ismap', 'loop', 'multiple', 'muted', 'novalidate', 'open', 'playsinline',
  'readonly', 'required', 'reversed', 'selected'
]

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

/** @type {Context|null} */
let current

/** @type {WeakMap<object, Context>} */
const cache = new WeakMap()

/**
 * @callback Store
 * @param {object} state
 * @param {Emitter} emitter
 * @returns {any}
 */

/**
 * Register a store function to be used for current component context
 * @export
 * @param {Store} fn Store function
 * @returns {any}
 */
export function use (fn) {
  return fn(current.state, current.emitter)
}

/**
 * Create HTML partial
 * @export
 * @param {Array<string>} strings Template literal strings
 * @param {...any} values Template literal values
 * @returns {Partial}
 */
export function html (strings, ...values) {
  return new Partial({ strings, values })
}

/**
 * Create SVG partial
 * @export
 * @param {Array<string>} strings Template literal strings
 * @param {...any} values Template literal values
 * @returns {Partial}
 */
export const svg = html

/**
 * Treat raw HTML string as partial, bypassing HTML escape behavior
 * @export
 * @param {any} value
 * @returns {Partial}
 */
export function raw (value) {
  return new Raw(value)
}

/**
 * Declare where partial is to be mounted in DOM, useful for SSR
 * @export
 * @param {Node|string} node Any compatible node or node selector
 * @param {Partial} partial The partial to mount
 * @param {object} [state={}] Root state
 * @returns {Partial}
 */
export function mount (selector, partial, state = {}) {
  partial.selector = selector
  partial.state = state
  return partial
}

/**
 * Render partial to promise
 * @export
 * @param {Partial} partial The partial to be rendered
 * @param {object} [state={}] Root state
 * @returns {Promise}
 */
export async function render (partial, state = {}) {
  if (typeof partial === 'function') partial = partial()
  if (partial instanceof Component) partial = await unwrap(partial, state)
  if (!(partial instanceof Partial)) return Promise.resolve(partial)

  let string = ''
  for await (const chunk of parse(partial, state)) string += chunk
  return string
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
 * Create a context object
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
 * Holder of raw HTML value
 * @class Raw
 */
class Raw extends String {}

/**
  * Create a HTML partial object
 * @export
 * @class Partial
 */
export class Partial {
  constructor ({ strings, values }) {
    this.strings = strings
    this.values = values
  }

  async * [Symbol.asyncIterator] (state = {}) {
    yield * parse(this, state)
  }
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
    return this
  }
  return (...args) => new Component(fn, ...args)
}
Component.prototype = Object.create(Partial.prototype)
Component.prototype.constructor = Component
Component.prototype[Symbol.asyncIterator] = async function * (state = {}) {
  yield * await unwrap(this, state)
}

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

    // Aggregate HTML as we pass through
    html += string

    const isAttr = ATTRIBUTE.test(html)

    // Flatten arrays
    if (Array.isArray(value)) {
      value = await Promise.all(value.flat())
    }

    if (isAttr) {
      if (value instanceof Ref) {
        const match = REF_ATTR.exec(string)
        console.assert(match, !match && `yeet: Got a ref as value for \`${string.match(ATTRIBUTE)?.[2]}\`, use instead \`ref=\${myRef}\`.`)
        yield string.replace(match[0], '')
        continue
      } else if (typeof value === 'boolean' || value == null) {
        const [, attr, name, quote] = html.match(ATTRIBUTE)
        if (attr && BOOL_PROPS.includes(name)) {
          console.assert(!quote, quote && `yeet: Boolean attribute \`${name}\` should not be quoted, use instead \`${name}=\${${JSON.stringify(value)}}\`.`)
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

  if (typeof value === 'function') value = value()
  if (value instanceof Component) value = await unwrap(value, state)
  if (value instanceof Partial) {
    yield * parse(value, state)
  } else {
    yield value instanceof Raw ? value : escape(value)
  }
}

/**
 * Escape HTML characters
 * @param {string} value
 * @returns {string}
 */
function escape (value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Unwrap Component value
 * @param {Component} component
 * @param {object} state
 * @returns {any}
 */
function unwrap (component, state) {
  const { fn, args } = component
  const ctx = current = new Context(state)
  const emit = ctx.emitter.emit.bind(ctx.emitter)
  return unwind(fn(ctx.state, emit), ctx, args)
}

/**
 * Serialize an object to HTML attributes
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
    current = ctx
    value = value(...args)
    args = []
  }
  if (value instanceof Component) {
    value = await unwrap(value, ctx.state)
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
 * Generic event emitter
 * @class Emitter
 * @extends {Map}
 */
class Emitter extends Map {
  constructor (emitter) {
    super()
    if (emitter) {
      // Forward all event to provided emitter
      this.on('*', emitter.emit.bind(emitter))
    }
  }

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
    if (event === RENDER) return
    if (event !== '*') this.emit('*', event, ...args)
    if (!this.has(event)) return
    for (const fn of this.get(event)) fn(...args)
  }
}
