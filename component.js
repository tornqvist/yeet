import { RENDER } from './emitter.js'
import { Partial } from './partial.js'
import { stack, cache } from './context.js'
import { assign, update, toNode } from './utils.js'

/** @typedef {import('./context.js').Context} Context */
/** @typedef {import('./morph.js').onupdate} onupdate */

/**
 * @callback Initialize
 * @param {object} state Component state object
 * @param {function(string, ...any): void} emit Emit events to component event emitter
 * @returns {any}
 */

/**
 * @typedef {object} Component Component instance
 * @property {Initialize} fn Component initialization function
 * @property {any} key Unique component identifier
 * @property {any[]} args Render arguments
 */

const ON_INIT = 0
const ON_UPDATE = 1
const ON_RENDER = 2

export { CreateComponent as Component }

/**
 * Create component
 * @param {Initialize} fn Initialize function
 * @param {...any} [args] Render arguments
 * @returns {Component}
 */
function CreateComponent (fn, ...args) {
  const key = args[0]?.key ?? fn
  return assign(Object.setPrototypeOf(function Proxy () {
    return CreateComponent(fn, ...(arguments.length ? arguments : args))
  }, CreateComponent.prototype), { fn, key, args })
}
CreateComponent.prototype = Object.create(Partial.prototype)
CreateComponent.prototype.constructor = CreateComponent

/**
 * Render component
 * @param {Context} ctx Current context
 * @param {onupdate} onupdate Update DOM in place
 * @returns {Node | Fragment| null}
 */
CreateComponent.prototype.render = function (ctx, onupdate) {
  const { child, value } = this.initialize(ctx, onupdate)
  const node = value instanceof Partial
    ? value.render(child, onupdate)
    : toNode(value)
  if (node) cache.set(node, ctx)
  return node
}

/**
 * Initialize component
 * @param {Context} ctx Current context
 * @param {onupdate} onupdate Update DOM in place
 * @returns {{ child?: Context, value: any }}
 */
CreateComponent.prototype.initialize = function (ctx, onupdate) {
  let { fn, args } = this
  let rerender, child

  console.log('initialize', fn.name)

  ctx.editors.push(function componentEditor (component) {
    args = component.args
    handleUpdate()
  })
  ctx.emitter.on(RENDER, handleUpdate)

  try {
    stack.unshift(ctx)
    const value = walk(wrap(fn(ctx.state, ctx.emit)))
    if (value instanceof Partial) {
      child = ctx.spawn(value.key)
    }
    if (value instanceof CreateComponent) {
      return value.initialize(child, onupdate)
    }
    return { child, value }
  } finally {
    stack.shift()
  }

  function handleUpdate () {
    try {
      stack.unshift(ctx)
      const value = walk(wrap(rerender(...args)), ON_UPDATE)
      const isPartial = value instanceof Partial
      if (isPartial && value.key === child?.key) {
        update(child, value)
      } else if (value instanceof CreateComponent) {
        child = ctx.spawn(value.key)
        const inner = value.initialize(child, onupdate)
        onupdate(inner.value, inner.child, afterupdate)
      } else {
        child = isPartial ? ctx.spawn(value.key) : null
        onupdate(value, child, afterupdate)
      }
    } finally {
      stack.shift()
    }
  }

  /**
   * Cache the component context with the rendered node
   * @param {any} node The updated node
   */
  function afterupdate (node) {
    if (node) cache.set(node, ctx)
  }

  /**
   * Recursively walk a generator looking for partials and functions
   * @param gen Generator to walk
   * @param depth Current function depth
   * @param prev Initial value to send to the generator
   * @returns {any}
   */
  function walk (gen, depth = ON_INIT, prev) {
    while (true) {
      const { done, value } = gen.next(prev)

      if (value instanceof Promise) {
        value
          .then((value) => walk(gen, depth, value))
          .then(function (value) {
            if (value instanceof Partial) {
              child = ctx.spawn(value.key)
            }
            onupdate(value, child, afterupdate)
          })
        return null
      }

      const isPartial = value instanceof Partial
      const isFunction = typeof value === 'function'
      if (isFunction || isPartial) {
        if (depth === ON_INIT) rerender = isFunction ? value : () => value

        try {
          if (isPartial) return value
          return walk(wrap(value(...args)), depth + 1, value)
        } finally {
          const deplete = queue(gen)
          if (depth === ON_INIT) ctx.onunmount = deplete
          if (depth === ON_UPDATE) window.requestAnimationFrame(deplete)
          if (depth === ON_RENDER) deplete()
        }
      }

      if (done) return value

      prev = value
    }
  }
}

/**
 * Create a function which will deplete the given generator
 * @param {Iterable<any>} generator Generator to be depleeted
 * @returns {function(): void}
 */
function queue (generator) {
  return function () {
    let current = generator.next()
    while (!current.done) current = generator.next(current.value)
  }
}

/**
 * Wrap any value in a generator, delegating to existing generator
 * @param {any} current The object to be wrapped
 * @returns {Iterable<any>}
 */
function * wrap (current) {
  if (!isGenerator(current)) return current
  return yield * current
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
