const TAG = /<[a-z-]+ [^>]+$/i
const LEADING_WHITESPACE = /^\s+(<)/
const TRAILING_WHITESPACE = /(>)\s+$/
const ATTRIBUTE = /<[a-z-]+[^>]*?\s+(([^\t\n\f "'>/=]+)=("|')?)?$/i
const PLACEHOLDER = /(?:data-)?__placeholder(\d+)__/
const PLACEHOLDERS = /(?:data-)?__placeholder(\d+)__/g
const TEXT_NODE = 3
const COMMENT_NODE = 8
const ELEMENT_NODE = 1
const FRAGMENT_NODE = 11
const AFTER_UNMOUNT = 1
const AFTER_UPDATE = 2
const AFTER_RENDER = 3

/** @type {Array<Context>} */
const stack = []

/** @type {WeakMap<Array<String>, Node>} */
const templates = new WeakMap()

/** @type {WeakMap<Node, EventHandler>} */
const events = new WeakMap()

/** @type {WeakMap<Node, Context>} */
const cache = new WeakMap()

/** @type {WeakMap<Ref, Node>} */
const refs = new WeakMap()

const { requestAnimationFrame: raf } = window
const { isArray, from: toArray } = Array
const { entries, assign, keys } = Object

/**
 * Create HTML partial
 * @export
 * @param {Array<String>} strings Template literal strings
 * @param {...any} values Template literal values
 * @returns {Partial}
 */
export function html (strings, ...values) {
  return new Partial({ strings, values })
}

/**
 * Create SVG partial
 * @export
 * @param {Array<String>} strings Template literal strings
 * @param {...any} values Template literal values
 * @returns {Partial}
 */
export function svg (strings, ...values) {
  return new Partial({ strings, values, isSVG: true })
}

/**
 * Register a store function to be used for current component context
 * @export
 * @param {function(object, Emitter): any} fn Store function
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
 * Mount partial onto DOM node
 * @param {Partial} partial The partial to mount
 * @param {Node} node Any compatible node
 * @param {object} [state={}] Root state
 * @returns {Node}
 */
export function mount (partial, node, state = {}) {
  const { key } = partial
  let ctx = cache.get(node)
  if (ctx?.key !== key) {
    ctx = new Context(key, state)
    if (partial instanceof Component) {
      partial = unwrap(partial, ctx)
    }
    node = render(partial.template, ctx, node)
  }
  ctx.update(partial)
  cache.set(node, ctx)
  for (const [id, fn] of ctx.hooks) {
    if (id >= AFTER_RENDER) fn()
    if (id === AFTER_UPDATE) raf(fn)
  }
  return node
}

/**
 * Render template, optionally canibalizing an existing node
 * @param {Node} template The desired result
 * @param {Context} ctx The current node context
 * @param {Node} [node] An existing element to be updated
 * @returns {Node}
 */
function render (template, ctx, node) {
  if (!node) {
    node = template.cloneNode()
  } else {
    // Remove any events attached to element
    if (events.has(node)) events.get(node).clear()
    // Call unmount hooks attached to element
    const cached = cache.get(node)
    if (cached) {
      for (const [id, fn] of cached.hooks) {
        if (id === AFTER_UNMOUNT) fn()
      }
    }
  }

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

  if (nodeType === ELEMENT_NODE && template.nodeType === ELEMENT_NODE) {
    /** @type {Array<{name: String, value: String}>} */
    const placeholders = []

    /** @type {Array<String>} */
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
      ctx.editors.push(function attributeEditor (values) {
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
         * @param {String} str A node property to match w/ values
         * @returns {String}
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
    let newChild = render(child, ctx, oldChild)
    if (newChild instanceof Placeholder) {
      newChild = child.cloneNode()
      const editor = createNodeEditor(newChild, index, children)
      ctx.editors.push(editor)
    }
    children.push(newChild)
    node.appendChild(newChild)
    if (oldChild) oldChildren.splice(oldChildren.indexOf(oldChild), 1)
  }

  for (const oldChild of oldChildren) {
    oldChild.remove()
  }

  return node

  /**
   * Create a function which updated the element in place
   * @param {Node} oldChild The current (placeholder) node
   * @param {Number} index The nodes current position
   * @param {Array<Node|[Node]>} list All sibling nodes
   * @returns {function(Array<any>): void}
   */
  function createNodeEditor (oldChild, index, list) {
    const id = +oldChild.nodeValue.match(PLACEHOLDER)[1]

    return function editNode (values) {
      let newChild = values[id]

      if (isArray(newChild)) {
        /** @type {WeakMap<any, Array<[Node, Context, Number]>>} */
        const oldKeys = new WeakMap()

        /** @type {Array<Node>} */
        const oldChildren = isArray(oldChild) ? oldChild : [oldChild]

        newChild = newChild.flat().map(function (newChild) {
          if (newChild instanceof Partial) {
            const candidates = oldKeys.get(newChild.key)

            if (candidates?.length) {
              // Use candidate from a previous iteration
              const [oldChild, cached, index] = candidates.pop()
              oldChildren.splice(index, 1)
              cached.update(newChild)
              return oldChild
            }

            for (const [index, child] of oldChildren.entries()) {
              const cached = cache.get(child)
              if (cached) {
                // Update element in place
                if (cached.key === newChild.key) {
                  cached.update(newChild)
                  oldChildren.splice(index, 1)
                  return child
                }

                // Store candidate for subsequent iterations
                const candidate = [child, cached, index]
                if (candidates) candidates.push(candidate)
                else oldKeys.set(cached.key, [candidate])
              }
            }

            newChild = newChild.render(ctx.state)
          }

          newChild = toNode(newChild)
          for (const child of oldChildren) {
            if (canMount(newChild, child)) {
              return mount(newChild, child, ctx.state)
            }
          }

          return newChild
        })

        // FIXME: probably has an impact on performance
        const fragment = document.createDocumentFragment()
        for (const child of newChild) {
          if (child != null) fragment.appendChild(child)
        }
        insert(fragment)

        remove(oldChildren)
      } else {
        if (oldChild) {
          if (newChild instanceof Partial) {
            // TODO: Test old child is array
            const cached = cache.get(oldChild)
            if (cached?.key === newChild.key) {
              cached.update(newChild)
              newChild = oldChild
            } else {
              newChild = newChild.render(ctx.state)
            }
          }
        } else if (newChild instanceof Partial) {
          newChild = newChild.render(ctx.state)
        }

        newChild = toNode(newChild)

        let nextChild = newChild
        if (newChild?.nodeType === FRAGMENT_NODE) {
          nextChild = [...newChild.childNodes]
        }

        if (oldChild) {
          if (newChild == null) remove(oldChild)
          else replace(oldChild, newChild)
        } else if (newChild != null) {
          insert(toNode(newChild))
        }

        newChild = nextChild
      }

      oldChild = list[index] = newChild
    }

    function insert (newChild) {
      let next
      for (const value of list.slice(index + 1)) {
        if (isArray(value)) next = value.find(Boolean)
        else next = value
        if (value) break
      }
      if (next) next.before(newChild)
      else node.append(newChild)
    }
  }
}

/**
 * Determine wether two nodes are compatible
 * @param {Node} [a]
 * @param {Node} [b]
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
 * Unwrap component value
 * @param {Component} component The component to unwrap
 * @param {Context} ctx Current component context
 * @returns {any}
 */
function unwrap (component, ctx) {
  const { fn, args } = component

  try {
    stack.unshift(ctx)

    const { hooks } = ctx
    return unwind(fn(ctx.state, ctx.emit), function resolve (id, value, next) {
      console.assert(!next || !(value instanceof Promise), 'swf: Detected a promise. Async components are only supported on the server. On the client you should return a placeholder value and rerender (`emit(\'render\')`) when the promise is resolved/rejected.')

      if (value instanceof Partial) {
        if (next) hooks.unshift([id, next])
        if (id === AFTER_UNMOUNT) {
          ctx.onupdate = () => value
        }
        if (value instanceof Component) {
          value = unwrap(value, ctx)
        }
        return value
      }

      if (typeof value === 'function') {
        if (next) hooks.unshift([id, next])
        if (id === AFTER_UNMOUNT) {
          ctx.onupdate = value
          return value(...args)
        } else {
          return value()
        }
      }

      return next ? next(value) : value
    })
  } finally {
    stack.shift(ctx)
  }
}

/**
 * Unwind nested (generator) functions yielding each time to callback function
 * @param {any} value Current value
 * @param {function(Number, any, Function?): any} resolve Function for resolving yield/return values
 * @param {Number} [id=AFTER_UNMOUNT] Current resolution depth
 * @returns {any}
 */
function unwind (value, resolve, id = AFTER_UNMOUNT) {
  while (typeof value === 'function' && !(value instanceof Component)) {
    value = resolve(id, value)
    id++
  }

  if (isGenerator(value)) {
    let res = value.next()
    return resolve(id, res.value, function next (resolved) {
      res = value.next(resolved)
      const arg = res.done ? res.value : resolve(id, res.value, next)
      return unwind(arg, resolve, id + 1)
    })
  }

  return resolve(id, value)
}

/**
 * Determine wether an object is a generator
 * @param {any} obj The object to test
 * @returns {Boolean}
 */
function isGenerator (obj) {
  return obj &&
    typeof obj.next === 'function' &&
    typeof obj.throw === 'function'
}

/**
 * Parse template string into template element
 * @param {Array<String>} strings Template literal strings
 * @param {Boolean} [isSVG=false] Toggle parsing of SVG elements
 * @returns {Node}
 */
function parse (strings, isSVG = false) {
  let template = templates.get(strings)
  if (template) return template

  const { length } = strings
  const tmpl = document.createElement('template')
  let html = strings.reduce(function compile (res, string, index) {
    res += string
    if (index === length - 1) return res
    if (ATTRIBUTE.test(res)) res += `__placeholder${index}__`
    else if (TAG.test(res)) res += `data-__placeholder${index}__`
    else res += `<!--__placeholder${index}__-->`
    return res
  }, '').replace(LEADING_WHITESPACE, '$1').replace(TRAILING_WHITESPACE, '$1')

  if (isSVG) html = `<svg>${html}</svg>`
  else console.assert(!html.includes('<svg'), 'swf: It looks likes you\'re trying to render an svg element with the html tag, use the svg tag instead')
  tmpl.innerHTML = html

  const { content } = tmpl
  if (isSVG) {
    const children = content.firstElementChild.childNodes
    template = children.length > 1 ? toNode(toArray(children)) : children[0]
  } else {
    template = content.childNodes.length > 1 ? content : content.childNodes[0]
  }

  const { nodeType, nodeValue } = template
  if (nodeType === COMMENT_NODE && PLACEHOLDER.test(nodeValue)) {
    template = content
  }

  templates.set(strings, template)
  return template
}

/**
 * Convert value to Node
 * @param {any} value The value to convert
 * @returns {Node}
 */
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

/**
 * Remove node
 * @param {(Node|Array<Node>} value The node to remove
 */
function remove (value) {
  if (!isArray(value)) value.remove()
  else for (const child of value) child.remove()
}

/**
 * Replace node(s) with new node
 * @param {(Node|Array<Node>)} value The node(s) to replace
 * @param {Node} child The new node
 */
function replace (value, child) {
  if (isArray(value)) {
    value[0].replaceWith(child)
    remove(value.slice(1))
  } else {
    value.replaceWith(child)
  }
}

/**
 * Placeholder value for a template hole
 * @class Placeholder
 */
class Placeholder {}

/**
 * A template partial
 * @export
 * @class Partial
 */
export class Partial {
  /**
   * Creates an instance of Partial.
   * @param {object} opts
   * @param {Array<String>} opts.strings
   * @param {Array<any>} opts.values
   * @param {Boolean} opts.isSVG
   * @memberof Partial
   */
  constructor ({ strings, values, isSVG = false }) {
    this.key = strings
    this.strings = strings
    this.values = values
    this.isSVG = isSVG
  }

  get template () {
    return parse(this.strings, this.isSVG)
  }

  /**
   * Render partial to Node
   * @param {object} [state={}] Initial state
   * @returns {Node}
   * @memberof Partial
   */
  render (state = {}) {
    const ctx = new Context(this.key, state)
    const node = render(this.template, ctx)
    ctx.update(this)
    cache.set(node, ctx)
    return node
  }
}

/**
 * Creates a stateful component partial
 * @export
 * @param {function(object, function(String, ...any): any)} fn Component initialize function
 * @param {...args} args Arguments forwarded to component update function
 * @returns Component
 */
export function Component (fn, ...args) {
  Object.setPrototypeOf(Render, Component.prototype)
  Render.key = args[0]?.key || fn
  Render.args = args
  Render.fn = fn
  return Render

  function Render () {
    if (arguments.length) args = arguments
    return new Component(fn, ...args)
  }
}

Component.prototype = Object.create(Partial.prototype)
Component.prototype.constructor = Component

/**
 * Render component to node
 * @param {object} [state={}] Initial state
 * @returns {Node}
 */
Component.prototype.render = function (state = {}) {
  const ctx = new Context(this.key, state)
  const partial = unwrap(this, ctx)
  if (!(partial instanceof Partial)) return toNode(partial)
  const node = render(partial.template, ctx)
  ctx.update(partial)
  cache.set(node, ctx)
  return node
}

/**
 * Contextual data tied to a mounted node
 * @class Context
 */
class Context {
  /**
   * Creates an instance of Context.
   * @param {any} key
   * @param {object} [state={}]
   * @memberof Context
   */
  constructor (key, state = {}) {
    /** @type {Array<[Number, Function]>} */
    this.hooks = []

    /** @type {Array<Function>} */
    this.editors = []

    /** @type {null|function(...any): any} */
    this.onupdate = null

    this.key = key
    this.state = state
    this.emitter = new Emitter()
    this.emit = this.emitter.emit.bind(this.emitter)
  }

  /**
   * Update node with registered editors
   * @param {Partial} partial The partial to use for update
   * @memberof Context
   */
  update (partial) {
    try {
      stack.unshift(this)

      if (partial instanceof Component) {
        partial = unwind(this.onupdate(...partial.args), (id, value, next) => {
          console.assert(!next || !(value instanceof Promise), 'swf: Detected a promise. Async components are only supported on the server. On the client you should return a placeholder value and rerender (`emit(\'render\')`) when the promise is resolved/rejected.')

          if (value instanceof Partial) {
            if (next) this.hooks.unshift([id, next])
            if (value instanceof Component) {
              value = unwrap(value, this)
            }
            return value
          }

          if (typeof value === 'function') {
            if (next) this.hooks.unshift([id, next])
            return value()
          }

          return next ? next(value) : value
        }, AFTER_UPDATE)
      }

      for (const editor of this.editors) {
        editor(partial.values)
      }

      for (const [id, fn] of this.hooks) {
        if (id >= AFTER_RENDER) fn()
        if (id === AFTER_UPDATE) raf(fn)
      }
    } finally {
      stack.shift()
    }
  }
}

/**
 * Generic event emitter
 * @class Emitter
 * @extends {Map}
 */
class Emitter extends Map {
  /**
   * Attach listener for event
   * @param {String} event Event name
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
   * @param {String} event Event name
   * @param {function(...any): void} fn Registered listener
   * @memberof Emitter
   */
  removeListener (event, fn) {
    const listeners = this.get(event)
    if (listeners) listeners.delete(fn)
  }

  /**
   * Emit event to all listeners, on this and all parent emitters
   * @param {String} event Event name
   * @param {...any} args Event parameters to be forwarded to listeners
   * @memberof Emitter
   */
  emit (event, ...args) {
    this.emit('*', [event, ...args])
    if (!this.has(event)) return
    for (const fn of this.get(event)) fn(...args)
  }
}

/**
 * Reference a mounted node via ref#current
 * @class Ref
 * @export
 */
export class Ref {
  get current () {
    return refs.get(this)
  }
}

/**
 * Implementation of EventListener
 * @link https://developer.mozilla.org/en-US/docs/web/api/eventlistener
 * @class EventHandler
 * @extends {Map}
 */
class EventHandler extends Map {
  /**
   * Creates an instance of EventHandler.
   * @param {Node} node The node onto which to attach events
   * @memberof EventHandler
   */
  constructor (node) {
    super()
    const cached = events.get(node)
    if (cached) return cached
    this.node = node
  }

  /**
   * Delegate to assigned event listener
   * @param {Event} event
   * @returns {any}
   * @memberof EventHandler
   */
  handleEvent (event) {
    const handle = this.get(event.type)
    return handle(event)
  }

  /**
   * Add event listener
   * @param {String} key Event name
   * @param {function(Event): any} value Event listener
   * @memberof EventHandler
   */
  set (key, value) {
    const { node } = this
    const event = key.replace(/^on/, '')
    if (value) node.addEventListener(event, this)
    else node.removeEventListener(event, this)
    super.set(event, value)
  }
}
