const TAG = /<[a-z-]+ [^>]+$/i
const COMMENT = /<!--(?!.*-->)/
const LEADING_WHITESPACE = /^\s+(<)/
const TRAILING_WHITESPACE = /(>)\s+$/
const ATTRIBUTE = /<[a-z-]+[^>]*?\s+(([^\t\n\f "'>/=]+)=("|')?)?$/i
const PLACEHOLDER_NODE = /__placeholder-node-(\d+)__/
const PLACEHOLDER_VALUE = /__placeholder-value-(\d+)__/
const PLACEHOLDER_VALUE_GLOBAL = /__placeholder-value-(\d+)__/g
const TEXT_NODE = 3
const COMMENT_NODE = 8
const ELEMENT_NODE = 1
const FRAGMENT_NODE = 11
const ON_UNMOUNT = 1
const ON_UPDATE = 2

/** @type {Array<Context>} */
const stack = []

/** @type {WeakMap<Array<string>, Node>} */
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
export function svg (strings, ...values) {
  return new Partial({ strings, values, isSVG: true })
}

/**
 * Treat raw html string as partial, bypassing escape
 * @export
 * @param {any} value
 * @returns {Partial}
 */
export function raw (value) {
  return new Partial({ strings: [String(value)], values: [] })
}

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
  const ctx = stack[0]
  return fn(ctx.state, ctx.emitter)
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
 * @export
 * @param {Partial} partial The partial to mount
 * @param {(Node|string)} node Any compatible node or node selector
 * @param {object} [state={}] Root state
 * @returns {Node}
 */
export function mount (partial, node, state = {}) {
  if (typeof node === 'string') node = document.querySelector(node)
  const { key } = partial
  let ctx = cache.get(node)
  if (ctx?.key !== key) {
    ctx = new Context(key, state)
    if (partial instanceof Component) {
      partial = unwrap(partial, ctx)
    }
    node = renderTemplate(partial, ctx, node)
  }
  ctx.update(partial)
  cache.set(node, ctx)
  return node
}

/**
 * Render partial to Node
 * @export
 * @param {Partia} partial The partial to be rendered
 * @param {object} [state={}] Root state
 * @returns {Node}
 */
export function render (partial, state = {}) {
  return renderWithContext(partial, new Context(partial.key, state))
}

/**
 * Render template, optionally canibalizing an existing node
 * @param {Partial} partial The partial to render
 * @param {Context} ctx The current node context
 * @param {Node} [node] An existing node to be updated
 * @returns {(Node|Placeholder)}
 */
function renderTemplate (partial, ctx, node) {
  const { editors } = ctx
  const { values } = partial

  return renderChild(parse(partial), node)

  function renderChild (template, node) {
    if (!node) {
      node = template.cloneNode()
    } else {
      // Remove any events attached to element
      if (events.has(node)) events.get(node).clear()
      // Call unmount hooks attached to element
      unhook(cache.get(node), false)
    }

    const { nodeType } = node

    if (nodeType === TEXT_NODE) {
      node.nodeValue = template.nodeValue
      return node
    }

    if (nodeType === COMMENT_NODE) {
      if (PLACEHOLDER_VALUE.test(node.nodeValue)) {
        editors.push(function (values) {
          node.nodeValue = resolveValue(template.nodeValue, values)
        })
      } else {
        node.nodeValue = template.nodeValue
      }
      return node
    }

    if (nodeType === ELEMENT_NODE && template.nodeType === ELEMENT_NODE) {
      /** @type {Array<{name: string, value: string}>} */
      const placeholders = []

      /** @type {Array<string>} */
      const fixed = []

      for (const { name, value } of template.attributes) {
        if (PLACEHOLDER_VALUE.test(name)) {
          node.removeAttribute(name)
          placeholders.push({ name, value })
        } else if (PLACEHOLDER_VALUE.test(value)) {
          placeholders.push({ name, value })
        } else {
          fixed.push(name)
        }
      }

      for (const name of fixed) {
        node.setAttribute(name, template.getAttribute(name))
      }

      if (placeholders.length) {
        editors.push(function attributeEditor (values) {
          const attrs = placeholders.reduce(function (attrs, { name, value }) {
            name = resolveValue(name, values)
            value = resolveValue(value, values)
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
        })
      }
    }

    /** @type {Array<Node>} */
    const children = []

    /** @type {Array<Node>} */
    const oldChildren = toArray(node.childNodes)

    for (const [index, child] of template.childNodes.entries()) {
      let oldChild, newChild
      if (isPlaceholderNode(child)) {
        const id = getPlaceholderId(child)
        const value = values[id]
        if (value instanceof Partial) {
          for (const child of oldChildren) {
            const ctx = cache.get(child)
            if (ctx?.key === value.key) {
              editors.push(createNodeEditor(child, id, index, children))
              oldChild = newChild = child
              break
            }
          }
        }
        if (!newChild) {
          newChild = child.cloneNode()
          editors.push(createNodeEditor(newChild, id, index, children))
        }
      } else {
        oldChild = oldChildren.find((oldChild) => canMount(child, oldChild))
        newChild = renderChild(child, oldChild)
      }

      // Cache node in list of children
      children.push(newChild)

      // Put child in place
      insert(index, newChild)

      // Drop oldChild from list of candidate nodes
      if (oldChild) oldChildren.splice(oldChildren.indexOf(oldChild), 1)
    }

    remove(oldChildren.filter(Boolean))

    return node

    /**
     * Insert child at index
     * @param {number} index Position of child
     * @param {Node} child The child to insert
     */
    function insert (index, child) {
      if (node.childNodes[index] === child) return
      if (index) children[index - 1].after(child)
      else if (node.firstChild) node.firstChild.before(child)
      else node.appendChild(child)
    }

    /**
     * Replace placeholder values with actual value
     * @param {string} str A node property to match w/ values
     * @param {Array<any>} values Values to which to resolve
     * @returns {string}
     */
    function resolveValue (str, values) {
      const match = str.match(PLACEHOLDER_VALUE)
      if (match && match[0] === str) return values[+match[1]]
      return String(str).replace(PLACEHOLDER_VALUE_GLOBAL, (_, id) => values[+id])
    }

    /**
     * Create a function which updated the element in place
     * @param {Node} oldChild The current child node
     * @param {number} id The partial id (positional index)
     * @param {Number} index The nodes current position
     * @param {Array<Node|Array<Node>>} list All sibling nodes
     * @returns {function(Array<any>): void}
     */
    function createNodeEditor (oldChild, id, index, list) {
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
                    oldChildren.splice(index, 1)
                    cached.update(newChild)
                    return child
                  }

                  // Store candidate for subsequent iterations
                  /** @type {Array<[Node, Context, Number]>} */
                  const candidate = [child, cached, index]
                  if (candidates) candidates.push(candidate)
                  else oldKeys.set(cached.key, [candidate])
                }
              }

              newChild = renderWithContext(newChild, spawn(ctx, newChild.key))
            }

            // TODO: Try and find a compatible non-keyed node to canibalize
            return toNode(newChild)
          })

          let prev = children.slice(0, index).reverse().find(Boolean)
          for (const child of newChild) {
            if (prev) prev.after(child)
            else node.appendChild(child)
            prev = child
          }

          remove(oldChildren)
        } else {
          if (oldChild && newChild instanceof Partial) {
            const oldChildren = isArray(oldChild) ? oldChild : [oldChild]
            for (const oldChild of oldChildren) {
              const cached = cache.get(oldChild)
              if (cached?.key === newChild.key) {
                cached.update(newChild)
                newChild = oldChild
                break
              }
            }
          }

          if (newChild instanceof Partial) {
            newChild = renderWithContext(newChild, spawn(ctx, newChild.key))
          }

          newChild = toNode(newChild)

          let nextChild = newChild
          if (newChild?.nodeType === FRAGMENT_NODE) {
            nextChild = [...newChild.childNodes]
          }

          if (oldChild) {
            if (newChild == null) remove(oldChild)
            else if (newChild !== oldChild) replace(oldChild, newChild)
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
    return unwind(fn(ctx.state, ctx.emit), ctx, args)
  } finally {
    stack.shift(ctx)
  }
}

/**
 * Unwind nested (generator) functions
 * @param {any} value Current value
 * @param {Context} ctx Current context
 * @param {Array<any>} [args=[]] Arguments to forward
 * @param {Number} [id=ON_UNMOUNT] Current resolution depth
 * @returns {any}
 */
function unwind (value, ctx, args = [], id = ON_UNMOUNT) {
  while (typeof value === 'function' && !(value instanceof Component)) {
    value = resolve(value)
    id++
  }

  if (isGenerator(value)) {
    let res = value.next()
    return resolve(res.value, function next (resolved) {
      res = value.next(resolved)
      const arg = res.done ? res.value : resolve(res.value, next)
      return unwind(arg, ctx, args, id + 1)
    })
  }

  return resolve(value)

  function resolve (value, next) {
    console.assert(!next || !(value instanceof Promise), 'swf: Detected a promise. Async components are only supported on the server. On the client you should return a placeholder value and rerender (`emit(\'render\')`) when the promise is resolved/rejected.')

    if (value instanceof Partial) {
      if (next) ctx.hooks.unshift([id, next])
      if (id === ON_UNMOUNT) {
        ctx.onupdate = () => value
      }
      if (value instanceof Component) {
        value = unwrap(value, spawn(ctx, value.key))
      }
      return value
    }

    if (typeof value === 'function') {
      if (next) ctx.hooks.unshift([id, next])
      if (id === ON_UNMOUNT) ctx.onupdate = value
      return unwind(value(...args), ctx, args, id + 1)
    }

    return next ? next(value) : value
  }
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
 * @param {Partial} partial The partial to parse
 * @returns {Node}
 */
function parse (partial) {
  const { strings, isSVG } = partial
  let template = templates.get(strings)
  if (template) return template

  const { length } = strings
  const tmpl = document.createElement('template')
  let html = strings.reduce(function compile (res, string, index) {
    res += string
    if (index === length - 1) return res
    if (ATTRIBUTE.test(res) || COMMENT.test(res)) res += `__placeholder-value-${index}__`
    else if (TAG.test(res)) res += `__placeholder-value-${index}__`
    else res += `<!--__placeholder-node-${index}__-->`
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
  if (nodeType === COMMENT_NODE && PLACEHOLDER_NODE.test(nodeValue)) {
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
  if (isArray(value)) {
    for (const child of value) remove(child)
  } else {
    value.remove()
    unhook(cache.get(value))
  }
}

/**
 * Replace node(s) with new node
 * @param {(Node|Array<Node>)} value The node(s) to replace
 * @param {Node} child The new node
 */
function replace (value, child) {
  if (isArray(value)) {
    replace(value[0], child)
    remove(value.slice(1))
  } else {
    value.replaceWith(child)
    unhook(cache.get(value))
  }
}

/**
 * Deplete the hooks of given context to the specified depth
 * @param {Context} ctx Constext whose hooks to call
 * @param {boolean} shallow Should nested contexts also be unhooked
 * @param {number} min Lowest level hook to call
 */
function unhook (ctx, deep = true, min = ON_UNMOUNT) {
  if (!ctx) return
  for (const [id, fn] of ctx.hooks) {
    if (id < min) continue
    if (id === ON_UPDATE) raf(fn)
    else fn()
  }
  if (deep) {
    for (const child of ctx.children) unhook(child, deep, min)
  }
}

/**
 * Test whether node is a placeholder comment node
 * @param {Node} node The node to test
 * @returns {boolean}
 */
function isPlaceholderNode (node) {
  const { nodeValue, nodeType } = node
  return nodeType === COMMENT_NODE && PLACEHOLDER_NODE.test(nodeValue)
}

/**
 * Get placeholder id (positional index) from placeholder node
 * @param {Node} node The placeholder comment node
 * @returns {number}
 */
function getPlaceholderId (node) {
  return +node.nodeValue.match(PLACEHOLDER_NODE)[1]
}

/**
 * A template partial
 * @export
 * @class Partial
 */
export class Partial {
  /**
   * Creates an instance of Partial.
   * @param {object} opts
   * @param {Array<string>} opts.strings
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
}

/**
 * @callback Emit
 * @param {string} event
 * @param {...any} args
 */

/**
 * @callback Constructor
 * @param {object} state
 * @param {Emit} emit
 * @returns {Component}
 */

/**
 * Creates a stateful component partial
 * @export
 * @param {Constructor} fn Component initialize function
 * @param {...args} args Arguments forwarded to component render function
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
 * Render partial to node with supplied context
 * @param {Partial} partial The partial to render
 * @param {Context} ctx The node contextot be used
 * @returns {Node}
 */
function renderWithContext (partial, ctx) {
  if (partial instanceof Component) {
    partial = unwrap(partial, ctx)
    if (!(partial instanceof Partial)) return toNode(partial)
  }
  const node = renderTemplate(partial, ctx)
  ctx.update(partial)
  cache.set(node, ctx)
  return node
}

/**
 * Create a new Context inheriting from given parent Context
 * @param {Context} parent Parent context
 * @param {any} key Partial key
 * @returns {Context}
 */
function spawn (parent, key) {
  const ctx = new Context(key, Object.create(parent.state))
  ctx.emitter.on('*', parent.emit)
  parent.children.push(ctx)
  return ctx
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
    /** @type {Array<[number, Function]>} */
    this.hooks = []

    /** @type {Array<Context>} */
    this.children = []

    /** @type {Array<Function>} */
    this.editors = []

    /** @type {(null|function(...any): any)} */
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
        partial = unwind(this.onupdate, this, partial.args)
      }

      for (const editor of this.editors) {
        editor(partial.values)
      }

      unhook(this, false, ON_UPDATE)
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
   * Emit event to all listeners, on this and all parent emitters
   * @param {string} event Event name
   * @param {...any} args Event parameters to be forwarded to listeners
   * @memberof Emitter
   */
  emit (event, ...args) {
    if (event !== '*') this.emit('*', event, ...args)
    if (!this.has(event)) return
    for (const fn of this.get(event)) fn(...args)
  }
}

/**
 * Reference a mounted node via ref#current
 * @class Ref
 * @export
 */
class Ref {
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
   * @param {string} key Event name
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
