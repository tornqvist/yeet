const TEXT_NODE = 3
const ELEMENT_NODE = 1
const COMMENT_NODE = 8
const FRAGMENT_NODE = 11
const PLACEHOLDER = /placeholder-(\d+)/

const { isArray } = Array
const { assign, create } = Object
const stack = []
const cache = new WeakMap()
const templates = new WeakMap()

export function html (strings, ...values) {
  return new Partial(strings, values)
}

export function render (partial, state = {}) {
  return mount(null, partial, state)
}

export function mount (node, partial, state = {}) {
  if (isCompatible(node, partial)) {
    update(cache.get(node), partial)
    return node
  }
  const ctx = new Context(partial.key, state)
  node = morph(partial, ctx, node)
  cache.set(node, ctx)
  return toNode(node)
}

export function Component (fn, ...args) {
  if (this instanceof Component) {
    this.fn = fn
    this.args = args
    this.key = args[0]?.key || fn
    return this
  }
  return (...args) => new Component(fn, ...args)
}
Component.prototype = create(Partial.prototype)
Component.prototype.constructor = Component

function morph (partial, ctx, node) {
  const template = partial instanceof Partial ? parse(partial) : toNode(partial)
  const { nodeType } = template

  if (!node) node = template.cloneNode()
  if (nodeType === TEXT_NODE || nodeType === COMMENT_NODE) {
    node.nodeValue = template.nodeValue
    return node
  }

  node = node.nodeType === FRAGMENT_NODE ? [...node.childNodes] : node

  const children = []
  const { editors } = ctx
  const oldChildren = isArray(node) ? node : [...node.childNodes]
  template.childNodes.forEach(function eachChild (child, index) {
    if (isPlaceholder(child)) {
      const id = getPlaceholderId(child)
      const value = partial.values[id]
      const oldChild = pluck(value, oldChildren)
      child = new Child(oldChild, index, children, node)
      transform(child, value, ctx)
      editors.push(function editor (partial) {
        const isComponent = partial instanceof Component
        transform(child, isComponent ? partial : partial.values[id], ctx)
      })
    } else {
      const newChild = morph(child, ctx, pluck(child, oldChildren))
      child = new Child(null, index, children, node)
      upsert(child, newChild)
    }

    children[index] = child
    if (isArray(node)) node[index] = child
  })

  remove(oldChildren)

  return node
}

function transform (child, value, ctx) {
  if (!value) return upsert(child, null)

  const pick = pool(child.node)

  if (isArray(value)) {
    value = value.flat().reduce(function (order, value, index) {
      let newChild = pick(value)
      if (!newChild) newChild = new Child(null, index, order, child)
      transform(newChild, value, ctx)
      order.push(newChild)
      return order
    }, [])
    upsert(child, value)
    // cache.set(value, ctx)
    return
  }

  const oldNode = pick(value)
  const isPartial = value instanceof Partial

  if (isPartial && oldNode) {
    const cached = cache.get(oldNode)
    if (cached?.key === value.key) {
      update(cached, value)
      return
    }
  }

  if (isPartial) ctx = new Context(value.key, create(ctx.state))

  if (value instanceof Component) {
    value = unwrap(value, ctx, child)
  } else {
    value = morph(value, ctx, oldNode)
  }

  if (isPartial) cache.set(value, ctx)

  upsert(child, value)
}

function unwrap (value, root, child, index = 0) {
  const current = root.stack[index]
  const { fn, args } = value
  const render = fn(current)

  current.editors.push(function editor ({ args }) {
    const value = render(...args)
    const next = root.stack[index + 1]
    if (next && next.key === value?.key) {
      update(next, value)
    } else {
      transform(child, value, current)
    }
  })

  value = render(...args)

  let ctx = current
  if (value instanceof Partial) {
    ctx = root.stack[index + 1] = new Context(value.key, create(current.state))
  }

  if (value instanceof Component) {
    return unwrap(value, root, child, index + 1)
  }

  const pick = pool(child.node)
  const oldNode = pick(value)

  return morph(value, ctx, oldNode)
}

function upsert (child, newNode) {
  const { node: oldNode, index, order } = child

  if (newNode === oldNode) return
  if (isArray(newNode) && !cache.has(newNode) && oldNode) {
    if (isArray(oldNode) && !cache.has(oldNode)) {
      newNode.forEach(function (_node, _index) {
        if (!_node) return

        const oldIndex = oldNode.indexOf(_node)
        if (oldIndex !== -1) oldNode.splice(oldIndex, 1)

        let parent = child.parent
        while (parent instanceof Child) parent = parent.parent

        const prev = findPrev(_index, newNode)
        if (_node instanceof Child) _node = _node.node
        if (_node) {
          if (prev && prev.nextSibling !== _node) {
            prev.after(toNode(_node))
          } else if (!prev && parent.firstChild !== _node) {
            parent.prepend(toNode(_node))
          }
        }
      })

      remove(oldNode)
    } else {
      replace(oldNode, newNode)
    }
  } else if (newNode) {
    if (oldNode) {
      replace(oldNode, newNode)
    } else {
      const prev = findPrev(index, order)
      let parent = child.parent
      while (parent instanceof Child) parent = parent.parent
      if (prev) {
        prev.after(toNode(newNode))
      } else if (parent.firstChild !== newNode) {
        parent.prepend(toNode(newNode))
      }
    }
  } else {
    remove(oldNode)
  }

  child.node = newNode
}

function update (ctx, partial) {
  try {
    stack.unshift(ctx.state)
    for (const editor of ctx.editors) editor(partial)
  } finally {
    stack.shift()
  }
}

function findPrev (index, list) {
  for (let i = index - 1; i >= 0; i--) {
    let prev = list[i]
    if (prev instanceof Child) prev = prev.node
    if (isArray(prev)) prev = findPrev(prev.length, prev)
    if (prev) return prev
  }
  const item = list[index]
  if (item instanceof Child && item.parent instanceof Child) {
    return findPrev(item.parent.index, item.parent.order)
  }
}

function remove (node) {
  if (node instanceof Child) node = node.node
  if (isArray(node)) node.forEach(remove)
  else if (node) node.remove()
}

function replace (oldNode, newNode) {
  if (isArray(oldNode)) {
    oldNode = oldNode[0]
    remove(oldNode.slice(1))
  }
  oldNode.replaceWith(toNode(newNode))
}

function pool (nodes) {
  nodes = isArray(nodes) && !cache.has(nodes) ? [...nodes] : [nodes]
  return (value) => pluck(value, nodes)
}

function pluck (value, list) {
  if (!value) return null
  for (let i = 0, len = list.length; i < len; i++) {
    let isMatch
    const child = list[i]
    const node = child instanceof Child ? child.node : child
    if (!node) continue
    if (isArray(node) && !cache.has(node)) return pluck(value, node)
    if (value instanceof Partial) isMatch = isCompatible(node, value)
    else if (child === value) isMatch = true
    else isMatch = node.nodeType === (value.nodeType || TEXT_NODE)
    if (isMatch) return list.splice(i, 1)[0]
  }
  return null
}

function toNode (value) {
  if (!value) return null
  if (value instanceof window.Node) return value
  if (value instanceof Child) return value.node
  if (isArray(value)) {
    const fragment = document.createDocumentFragment()
    for (const node of value) fragment.append(toNode(node))
    return fragment
  }
  return document.createTextNode(String(value))
}

function isCompatible (node, partial) {
  const cached = cache.get(node)
  if (!cached) return false
  if (cached.key === partial.key) return true
  return cached.stack.some((ctx) => ctx.key === partial.key)
}

function getPlaceholderId (node) {
  return +node.nodeValue.match(PLACEHOLDER)[1]
}

function isPlaceholder (node) {
  return PLACEHOLDER.test(node.nodeValue)
}

function parse (partial) {
  const { strings } = partial
  let template = templates.get(strings)
  if (template) return template
  const { length } = strings
  const html = strings.reduce(function (html, str, index) {
    html += str
    if (index < length - 1) html += `<!--placeholder-${index}-->`
    return html
  }, '').trim()
  template = document.createElement('template')
  template.innerHTML = html
  template = template.content
  if (template.childNodes.length === 1) template = template.firstChild
  templates.set(strings, template)
  return template
}

function Child (node, index, order, parent) {
  this.node = node
  this.index = index
  this.order = order
  this.parent = parent
}

function Partial (strings, values, isSVG) {
  this.key = strings
  this.strings = strings
  this.values = values
  this.isSVG = isSVG
}

function Context (key, state = {}) {
  this.key = key
  this.editors = []
  this.state = state
  this.stack = [this]
}
