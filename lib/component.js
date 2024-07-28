import { stack } from './context.js'
import { RENDER } from './emitter.js'
import { Partial } from './partial.js'

const INIT = 0
const EFFECT = 1
const LAYOUT_EFFECT = 2

/** @typedef {import('./fragment.js').Fragment} Fragment */
/** @typedef {import('./context.js').Context} Context */

/**
 * @callback Init
 * @param {object} state
 * @param {function(string, ...any): void} emit
 * @returns {any}
 */

/** @type {WeakMap<Node|Fragment, Component>} */
export const components = new WeakMap()

export class Component {
  /** @type {WeakMap<Node|Fragment, Component[]>} */
  // static cache = new WeakMap()

  /**
   * @param {Init} init
   * @param  {...any} args
   */
  constructor(init, ...args) {
    this.key = args[0]?.key || init
    this.init = init
    this.args = args
  }

  /**
   * @param {Component} component
   * @returns {any}
   */
  // update(component) {
  //   throw new Error('Cannot update component before render')
  // }

  /**
   * @this {Component}
   * @param {Context} ctx
   * @param {function(any): void} render
   * @returns {any}
   */
  render(ctx, render) {
    const { init, args } = this
    const emit = ctx.emitter.emit.bind(ctx.emitter)

    /** @type {function(...any): any} */
    let rerender

    const onrender = () => {
      render(walk(wrap(rerender(...args)), EFFECT))
    }

    // this.update = function (component) {
    //   args.splice(0, args.length, ...component.args)
    //   try {
    //     stack.unshift(ctx)
    //     return walk(wrap(rerender(...args)), EFFECT)
    //   } finally {
    //     stack.shift()
    //   }
    // }

    ctx.emitter.on(RENDER, throttle(onrender))
    ctx.editors.push(function (component) {
      args.splice(0, args.length, ...component.args)
      try {
        stack.unshift(ctx)
        render(walk(wrap(rerender(...args)), EFFECT))
      } finally {
        stack.shift()
      }
    })

    try {
      stack.unshift(ctx)
      return walk(wrap(init(ctx.state, emit)), INIT)
    } finally {
      stack.shift()
    }

    /**
     * @param {Iterator<any>} generator
     * @param {number} id
     * @param {any} [prev]
     * @returns {any}
     */
    function walk(generator, id, prev) {
      try {
        stack.unshift(ctx)

        let next = generator.next(prev)
        do {
          if (next.value instanceof Promise) {
            next.value.then((res) => render(walk(generator, id, res)))
            return null
          }

          const isPartial = next.value instanceof Partial
          const isComponent = next.value instanceof Component
          const isFunction = typeof next.value === 'function'
          const value = isFunction ? next.value : () => next.value

          if (id === INIT) {
            rerender = value
          }

          if (isFunction || isPartial || isComponent) {
            const _next = () => generator.next()

            if (id === INIT) {
              ctx.hooks.push(_next)
            }

            if (id === EFFECT) {
              window.requestAnimationFrame(_next)
            }

            if (id === LAYOUT_EFFECT) {
              _next()
            }

            return isPartial || isComponent
              ? next.value
              : walk(wrap(value(...args)), id + 1)
          }

          if (!next.done) {
            next = generator.next(next.value)
          }
        } while (!next.done)

        return next.value
      } finally {
        stack.shift()
      }
    }
  }
}

/**
 * @param {any} value
 * @returns {Iterator<any>}
 */
function* wrap(value) {
  if (!isGenerator(value)) return value
  return yield* value
}

/**
 * @param {any} obj
 * @returns {Boolean}
 */
function isGenerator(obj) {
  return (
    obj && typeof obj.next === 'function' && typeof obj.throw === 'function'
  )
}

/**
 * @param {function(...any): void} fn
 * @returns {function(...any): void}
 */
function throttle(fn) {
  let scheduled = false
  return function (...args) {
    if (scheduled) return
    scheduled = true
    window.requestAnimationFrame(function () {
      scheduled = false
      fn(...args)
    })
  }
}
