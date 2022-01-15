import { assign, update, toNode } from './utils.js'
import { stack, cache } from './context.js'
import { Partial } from './partial.js'
import { RENDER } from './emitter.js'

const ON_INIT = 0
const ON_UNMOUNT = 0
const ON_UPDATE = 1
const ON_RENDER = 2
const EXIT = Symbol('EXIT')

/**
 * @callback Initialize
 * @param {object} state
 * @param {function(string, ...any): void} emit
 * @returns {any}
 */

/**
 * @callback Resolver
 * @param {any} value Current value
 * @param {import('./context.js').Context} ctx Current context
 * @param {number} id Current depth
 * @param {function(any): any} next Call to continue walking
 * @returns {any}
 */

/**
 * Create component
 * @export
 * @class Component
 * @property {Initialize} fn Component initialization function
 * @property {any} key Unique component identifier
 * @property {any[]} args Render arguments
 * @property {Context} [child=null] Currently rendered child node
 * @property {function(): any} [update=null] Update function
 * @param {Initialize} fn Initialize function
 * @param {...any} [args] Render arguments
 * @returns {Component}
 */
export function Component (fn, ...args) {
  const key = args[0]?.key || fn
  return assign(Object.setPrototypeOf(function Proxy () {
    return Component(fn, ...(arguments.length ? arguments : args))
  }, Component.prototype), { fn, key, args })
}
Component.prototype = Object.create(Partial.prototype)
Component.prototype.constructor = Component

// Object.defineProperty(Component.prototype, 'current', {
//   get () {
//     return cache.get(this.child)
//   }
// })

export function initialize (component, ctx, render, replace) {
  console.log('initiailize', component.key.name)
  const { fn } = component

  ctx.args = component.args
  ctx.editors.push(function (component) {
    ctx.args = component.args
    rerender(walk(wrap(ctx.update(...ctx.args)), ON_UPDATE))
  })
  ctx.emitter.on(RENDER, function () {
    rerender(walk(wrap(ctx.update(...ctx.args)), ON_UPDATE))
  })

  try {
    stack.unshift(ctx)
    const value = walk(wrap(fn(ctx.state, ctx.emit)))
    if (value instanceof Partial) {
      ctx.child = ctx.spawn(value.key)
      return render(value, ctx.child)
    }
    return toNode(value)
  } finally {
    stack.shift()
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
        value.then((value) => {
          return walk(gen, depth, value)
        }).then(rerender)
        return null
      }

      const isPartial = value instanceof Partial
      const isFunction = typeof value === 'function'
      if (isFunction || isPartial) {
        if (depth === ON_INIT) ctx.update = isFunction ? value : () => value

        try {
          if (isPartial) return value
          return walk(wrap(value(...ctx.args)), depth + 1, value)
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

  function rerender (value) {
    console.log('rerender', value)
    if (value instanceof Partial) {
      if (value.key === ctx.child?.key) {
        update(ctx.child, value)
      } else {
        ctx.child = ctx.spawn(value.key)
        const node = value instanceof Component
          ? initialize(value, ctx.child, render, replace)
          : render(value, ctx.child)
        if (node) cache.set(node, ctx)
        replace(node)
      }
    } else {
      replace(toNode(value))
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
  yield * current
}

/**
 * Unwrap Component to DOM Node
 * @param {Component} component The component to render
 * @param {import('./context.js').Context} ctx Current context
 * @param {function(any): void} onupdate Update DOM
 * @param {function(Partial, Context): Node} render Render partial to Node
 * @returns {Node}
 */
export function unwind (component, ctx, onupdate, render) {
  const { fn, args } = component

  ctx.args = args
  ctx.node = null
  ctx.child = null
  ctx.update = null

  ctx.emitter.on(RENDER, maybeUpdate)

  ctx.editors.push(function editor (component) {
    ctx.args = component.args
    maybeUpdate()
  })

  try {
    stack.unshift(ctx)
    const value = walk(fn(ctx.state, ctx.emit), ctx, resolve)
    if (value instanceof Promise) {
      value.then(onupdate)
      ctx.node = null
    } else if (value instanceof Partial) {
      ctx.node = render(value, ctx.child)
    } else {
      ctx.node = toNode(value)
    }
    return ctx.node
  } finally {
    stack.shift(ctx)
  }

  async function maybeUpdate () {
    try {
      let value = walk(ctx.update(...ctx.args), ctx, resolve, ON_UPDATE)
      if (value instanceof Promise) {
        ctx.node = null
        onupdate(null)
        value = await value
      }
      if (value instanceof Partial) {
        value = render(value, ctx.child)
      }
      ctx.node = value
      onupdate(value)
    } catch (err) {
      if (err !== EXIT) throw err
    }
  }

  /** @type {Resolver} */
  function resolve (value, ctx, id, next) {
    let halt = false

    try {
      if (value instanceof Partial && value.key === ctx.child?.key) {
        update(ctx.child, value)
        throw EXIT
      }

      if (value instanceof Component) {
        ctx.child = ctx.spawn(value.key)
        return unwind(value, ctx.child, onupdate, render)
      }

      if (value instanceof Promise) {
        halt = true
        return value.then(next)
      }

      const isFunction = typeof value === 'function'

      if (id === ON_UNMOUNT) {
        ctx.update = isFunction ? value.bind(undefined) : () => value
      }

      if (isFunction) {
        return walk(value(...ctx.args), ctx, resolve, id + 1)
      }

      if (value instanceof Partial) {
        ctx.child = ctx.spawn(value.key)
        return value
      }
    } finally {
      if (next && !halt) {
        if (id === ON_UNMOUNT) ctx.onunmount = () => next(value)
        if (id === ON_UPDATE) window.requestAnimationFrame(() => next(value))
        if (id === ON_RENDER) next(value)
      }
    }

    return next ? next(value) : value
  }
}

/**
 * Recursively walk generators yielding to supplied resolve function
 * @param {any} value Current value
 * @param {import('./context.js').Context} ctx Current context
 * @param {Resolver} resolve Resolver function
 * @param {number} [id] Current depth
 * @returns {any}
 */
function walk (value, ctx, resolve, id = ON_UNMOUNT) {
  if (isGenerator(value)) {
    let res = value.next()
    return resolve(res.value, ctx, id, function next (resolved) {
      if (res.done) return resolved
      res = value.next(resolved)
      return resolve(res.value, ctx, id, next)
    })
  }
  return resolve(value, ctx, id)
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
