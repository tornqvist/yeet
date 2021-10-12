export const TEXT_NODE = 3
export const ELEMENT_NODE = 1
export const COMMENT_NODE = 8
export const FRAGMENT_NODE = 11
export const HOOK = Symbol('HOOK')
export const PLACEHOLDER = /^yeet-(\d+)$/

export const { assign, keys, entries } = Object
export const { isArray } = Array

const ON = /^on/
const WILDCARD = '*'

/** @type {WeakMap<Node, Context>} */
export const cache = new WeakMap()

/** @type {WeakMap<Ref, Node>} */
export const refs = new WeakMap()

/** @type {WeakMap<Node, EventHandler>} */
const events = new WeakMap()

/** @type {Array<Context>} */
export const stack = []

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

export function Context (key, state) {
  this.key = key
  this.editors = []
  this.state = state
  this.stack = [this]
  this.emitter = new Emitter()
  this.emit = this.emitter.emit.bind(this.emitter)
  this.emitter.on(HOOK, (fn) => this.hooks.push(fn))
}

/**
 * Create a HTML partial object
 * @export
 * @class Partial
 * @param {Array<string>} strings Template strings
 * @param {Array<any>} values Template partials
 * @param {Boolean} isSVG Whether the partial is an SVG node
 */
export function Partial (strings, values, isSVG = false) {
  this.key = strings
  this.strings = strings
  this.values = values
  this.isSVG = isSVG
}

/**
 * Execute context editors with partial values
 * @param {Context} ctx Context which to update
 * @param {Partial} partial Partial with which to update
 */
export function update (ctx, partial) {
  try {
    stack.unshift(ctx.state)
    for (const editor of ctx.editors) editor(partial)
  } finally {
    stack.shift()
  }
}

/**
 * Remove node
 * @param {Node|Child|Array<Node>} node Node to remove
 */
export function remove (node) {
  if (isArray(node)) {
    node.forEach(remove)
  } else if (node) {
    node.remove()
  }
}

/**
 * Replace node
 * @param {Node|Child|Array<Node>} oldNode Node to be replaced
 * @param {Node} newNode New node to insert
 */
export function replace (oldNode, newNode) {
  if (isArray(oldNode)) {
    remove(oldNode.slice(1))
    replace(oldNode[0], newNode)
  } else {
    oldNode.replaceWith(newNode)
  }
}

/**
 * Cast value to node
 * @param {any} value The value to be cast
 * @returns {Node}
 */
export function toNode (value) {
  if (!value) return null
  if (value instanceof window.Node) return value
  if (isArray(value)) {
    const fragment = document.createDocumentFragment()
    for (const node of value) fragment.append(toNode(node))
    return fragment
  }
  return document.createTextNode(String(value))
}

/**
 * Determine whether node is a placeholder node
 * @param {Node} node The node to test
 * @returns {Boolean}
 */
export function isPlaceholder (node) {
  const { nodeValue, nodeType } = node
  return nodeType === COMMENT_NODE && PLACEHOLDER.test(nodeValue)
}

/**
 * Get placeholder id
 * @param {Node} node The placeholder node
 * @returns {number}
 */
export function getPlaceholderId (node) {
  return +node.nodeValue.match(PLACEHOLDER)[1]
}

/**
 * Create an attribute editor function
 * @param {Node} template Template node
 * @param {Node} node Target node
 * @returns {Editor}
 */
export function createAttributeEditor (node) {
  const placeholders = []

  for (const { name, value } of node.attributes) {
    if (PLACEHOLDER.test(name) || PLACEHOLDER.test(value)) {
      placeholders.push({ name, value })
      node.removeAttribute(name)
    }
  }

  if (!placeholders.length) return null

  /** @type {Editor} */
  return function attributeEditor (partial) {
    const attrs = placeholders.reduce(function (attrs, { name, value }) {
      name = PLACEHOLDER.test(name)
        ? resolvePlaceholders(name, partial.values)
        : name
      value = PLACEHOLDER.test(value)
        ? resolvePlaceholders(value, partial.values)
        : value
      if (typeof name === 'object') {
        if (isArray(name)) {
          for (const value of name.flat()) {
            if (typeof value === 'object') assign(attrs, value)
            else attrs[value] = ''
          }
        } else {
          assign(attrs, name)
        }
      } else if (ON.test(name)) {
        const events = EventHandler.get(node)
        events.set(name, value)
      } else if (name === 'ref') {
        if (typeof value === 'function') value(node)
        else refs.set(value, node)
      } else if (value != null) {
        attrs[name] = value
      }
      return attrs
    }, {})

    for (let [name, value] of entries(attrs)) {
      if (isArray(value)) value = value.join(' ')
      if (name in node) {
        node[name] = value
      } else if (node.getAttribute(name) !== value) {
        node.setAttribute(name, value)
      }
    }

    const allowed = keys(attrs).concat(fixed)
    for (let i = 0, len = node.attributes.length; i < len; i++) {
      const { name } = node.attributes[i]
      if (!allowed.includes(name)) {
        if (name in node) {
          node[name] = typeof node[name] === 'boolean' ? false : ''
        }
        node.removeAttribute(name)
      }
    }
  }
}

/**
 * Resolve values from placeholder string
 * @param {string} str String from which to match values
 * @param {Array<any>} values List of values to replace placeholders with
 * @returns {any}
 */
function resolvePlaceholders (str, values) {
  const [match, id] = str.match(PLACEHOLDER)
  if (match === str) return values[+id]
  const pattern = new RegExp(PLACEHOLDER, 'g')
  return str.replace(pattern, (_, id) => values[+id])
}

/**
 * Implementation of EventListener
 * @link https://developer.mozilla.org/en-US/docs/web/api/eventlistener
 * @class EventHandler
 * @extends {Map}
 */
class EventHandler extends Map {
  /**
   * Create a new EventHandler
   * @param {Node} node The node onto which to attach events
   * @memberof EventHandler
   */
  constructor (node) {
    super()
    this.node = node
    events.set(node, this)
  }

  /**
   * Get an existing EvetnHandler for node or create a new one
   * @param {Node} node The node to bind listeners to
   * @returns {EventHandler}
   */
  static get (node) {
    return events.get(node) || new EventHandler(node)
  }

  /**
   * Delegate to assigned event listener
   * @param {Event} event
   * @returns {any}
   * @memberof EventHandler
   */
  handleEvent (event) {
    const handle = this.get(event.type)
    return handle.call(event.currentTarget, event)
  }

  /**
   * Add event listener
   * @param {string} key Event name
   * @param {function(Event): any} value Event listener
   * @memberof EventHandler
   */
  set (key, value) {
    const { node } = this
    const event = key.replace(ON, '')
    if (value) node.addEventListener(event, this)
    else node.removeEventListener(event, this)
    super.set(event, value)
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
   * Emit event to all listeners
   * @param {string} event Event name
   * @param {...any} args Event parameters to be forwarded to listeners
   * @memberof Emitter
   */
  emit (event, ...args) {
    if (event !== WILDCARD) this.emit(WILDCARD, event, ...args)
    if (!this.has(event)) return
    for (const fn of this.get(event)) fn(...args)
  }
}
