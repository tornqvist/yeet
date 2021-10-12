import { HOOK, Partial, Context, stack, assign, update } from './shared.js'

const ON_UNMOUNT = 0
const ON_UPDATE = 1
const ON_RENDER = 2

export function Component (fn, ...args) {
  const key = args[0]?.key || fn
  return assign(Object.setPrototypeOf(function Proxy () {
    return Component(fn, ...(arguments.length ? arguments : args))
  }, Component.prototype), { key, fn, args })
}

export function unwind (component, root, replace, index = 0) {
  let renderer
  let ctx = root.stack[index]
  const { fn, args } = component

  try {
    stack.unshift(ctx)
    let value = walk(fn(ctx.state, ctx.emit), resolve)
    if (value instanceof Promise) {
      value.then(onupdate, onupdate)
      return null
    }
    if (value instanceof Component) {
      while (value instanceof Component) {
        ctx = new Context(Object.create(ctx.state))
        root.stack.push(ctx)
        value = unwind(value, root, index + 1)
      }
      return value
    } else if (value instanceof Partial) {
      ctx = new Context(Object.create(ctx.state))
      root.stack.push(ctx)
    }
    return value
  } finally {
    stack.shift(ctx)
  }

  function onupdate (value = unwind(call(renderer, ...args), resolve, ON_UPDATE)) {
    const next = root.stack[index + 1]
    if (next && next.key === value?.key) {
      update(next, value)
    } else {
      replace(value)
    }
  }

  function resolve (value, id, next) {
    if (value instanceof Promise) {
      return value.then(next, next).then(function (value) {
        return resolve(value, id, next)
      })
    }
    try {
      if (id === ON_UNMOUNT) renderer = value
      if (typeof value === 'function') {
        return unwind(value(...args), resolve, id + 1)
      }
      if (value instanceof Partial) return value
    } finally {
      if (next) {
        if (id === ON_UNMOUNT) ctx.emit(HOOK, next.bind(undefined, value))
        if (id === ON_UPDATE) window.requestAnimationFrame(() => next(value))
        if (id === ON_RENDER) next(value)
      }
    }
    return next ? next(value) : value
  }
}

function walk (value, resolve, id = ON_UNMOUNT) {
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
 * Call provided function
 * @param {function(...any): any} fn Function to be called
 * @param  {...any} args Arguments to forward to provided function
 * @returns {any}
 */
function call (fn, ...args) {
  return typeof fn === 'function' ? fn(...args) : fn
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
