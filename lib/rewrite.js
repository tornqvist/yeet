const INIT = 0
const EFFECT = 1
const LAYOUT_EFFECT = 2
const WILDCARD = '*'
const RENDER = 'render'
const INTERMEDIATE = Symbol('INTERMEDIATE')
const TAG = /<[a-z-]+ [^>]+$/i
const COMMENT = /<!--(?!.*-->)/
const LEADING_WHITESPACE = /^\s+(<)/
const TRAILING_WHITESPACE = /(>)\s+$/
const ATTRIBUTE = /<[a-z-]+[^>]*?\s+(([^\t\n\f "'>/=]+)=("|')?)?$/i
const TEXT_NODE = 3
const ELEMENT_NODE = 1
const COMMENT_NODE = 8
const FRAGMENT_NODE = 11
const WHITESPACE = /^\s+$/
const PLACEHOLDER = /yeet-(\w+)-(\d+)/

/** @typedef {Object} State */

/**
 * @callback Init
 * @param {State} state
 * @param {function(string, ...any): void} emit
 */

/**
 * @callback Editor
 * @param {Partial} partial
 */

/** @type {WeakMap<Node|Fragment, Context>} */
const cache = new WeakMap()

/** @type {WeakMap<TemplateStringsArray, Node>} */
const templates = new WeakMap()

/** @type {WeakMap<Ref, Element>} */
const refs = new WeakMap()

/** @type {Context[]} */
const stack = []

function ref() {
  return new Ref()
}

class Ref {
  get current() {
    return refs.get(this)
  }
}

class Emitter extends Map {
  /**
   *
   * @param {string} event
   * @param {function(...any): void} fn
   */
  on(event, fn) {
    let listeners = this.get(event)
    if (!listeners) {
      listeners = new Set()
      this.set(event, listeners)
    }
    listeners.add(fn)
  }

  /**
   * @param {string} event
   * @param  {...any} args
   */
  emit(event, ...args) {
    if (event !== WILDCARD) {
      this.emit(WILDCARD, event, ...args)
    }

    const listeners = this.get(event)
    if (listeners) {
      for (const fn of listeners) {
        fn(...args)
      }
    }
  }
}

class Context {
  /**
   * @param {State} state
   * @param {any} key
   */
  constructor(state, key) {
    this.key = key
    this.state = state
    this.emitter = new Emitter()

    /** @type {Editor[]} */
    this.editors = []

    /** @type {(function(): void)[]} */
    this.hooks = []
  }

  /**
   * @param {any} key
   * @returns {Context}
   */
  spawn(key) {
    return new Context(Object.create(this.state), key)
  }
}

class Partial {
  /**
   * @param {TemplateStringsArray} strings
   * @param  {any[]} values
   * @param {boolean} isSVG
   */
  constructor(strings, values, isSVG) {
    this.strings = strings
    this.values = values
    this.key = strings
    this.isSVG = isSVG
  }
}

/** @type {WeakMap<Element, (Node|Slot)[]>} */
const slots = new WeakMap()

class Fragment {
  /**
   * @param {any} key
   * @param {(Node|Slot|null)[]} children
   */
  constructor (key, children) {
    this.key = key
    this.children = children
  }
}

class Slot {
  /**
   * @param {Element} parent
   * @param {number} index
   * @param {(Node|Slot|Fragment)[]} children
   */
  constructor(parent, index, children) {
    let siblings = slots.get(parent)
    if (!siblings) {
      siblings = [...parent.childNodes]
      slots.set(parent, siblings)
    }

    siblings.splice(index, children.length, this)

    /** @type {(Node|Slot|Fragment)[]} */
    this.children = children
    this.siblings = siblings
    this.parent = parent
    this.index = index
  }
}

/**
 * Create component
 * @param {Init} init
 * @returns {function(...any): Component}
 */
export function CreateComponent(init) {
  return function createComponent(...args) {
    return new Component(init, ...args)
  }
}

class Component {
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
   * @param {...any} args
   * @returns {any}
   */
  update(args) {
    throw new Error('Cannot update component before render')
  }

  /**
   * @this {Component}
   * @param {Context} ctx
   * @param {function(any): void} render
   * @returns
   */
  render(ctx, render) {
    const emit = ctx.emitter.emit.bind(ctx.emitter)

    /** @type {function(...any): any} */
    let rerender

    const onrender = () => {
      render(walk(wrap(rerender(...this.args)), EFFECT))
    }

    /**
     * @param {Iterator<any>} generator
     * @param {number} id
     * @param {any} [prev]
     * @returns {any}
     */
    const walk = (generator, id, prev) => {
      try {
        stack.unshift(ctx)

        let next = generator.next(prev)
        do {
          if (next.value instanceof Promise) {
            next.value.then((res) => render(walk(generator, id, res)))
            return INTERMEDIATE
          }

          const isFunction = typeof next.value === 'function'
          const isPartial = next.value instanceof Partial
          if (isFunction || isPartial) {
            const value = isFunction ? next.value : () => next.value
            const _next = () => generator.next()

            if (id === INIT) {
              rerender = value
              if (isFunction) ctx.hooks.push(_next)
            }

            if (id === EFFECT) {
              window.requestAnimationFrame(_next)
            }

            if (id === LAYOUT_EFFECT) {
              _next()
            }

            return isPartial
              ? next.value
              : walk(wrap(value(...this.args)), id + 1)
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

    this.update = (args) => {
      this.args = args
      return walk(wrap(rerender(...args)), EFFECT)
    }

    ctx.emitter.on(RENDER, throttle(onrender))

    return walk(wrap(this.init(ctx.state, emit)), INIT)
  }
}

/**
 * Wrap any value in a generator, delegating to existing generator
 * @param {any} value The value to be wrapped
 * @returns {Iterator<any>}
 */
function* wrap(value) {
  if (!isGenerator(value)) return value
  return yield* value
}

/**
 * Determine wether value is generator
 * @param {any} obj Object to test
 * @returns {Boolean}
 */
function isGenerator(obj) {
  return (
    obj && typeof obj.next === 'function' && typeof obj.throw === 'function'
  )
}

/**
 * Throttle given function to only execute once per frame
 * @param {function(...any): void} fn The function to throttle
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

/**
 * @param {TemplateStringsArray} strings
 * @param  {...any} values
 */
function html(strings, ...values) {
  return new Partial(strings, values, false)
}

/**
 * Determine whether node is a placeholder node
 * @param {Node} node The node to test
 * @returns {Boolean}
 */
function isPlaceholder(node) {
  const { nodeValue, nodeType } = node
  if (nodeType !== COMMENT_NODE) return false
  const match = nodeValue?.match(PLACEHOLDER)
  return match?.[1] === 'node'
}

/**
 * Get placeholder id
 * @param {Node} node The placeholder node
 * @returns {number}
 */
function getPlaceholderId(node) {
  // @ts-expect-error nodeValue is always defined
  return +node.nodeValue.match(PLACEHOLDER)[2]
}

/**
 * Parse partial
 * @param {Partial} partial The partial to parse
 * @returns {Node|null}
 */
function parse(partial) {
  const { strings, isSVG } = partial

  /** @type {Node|null|undefined} */
  let template = templates.get(strings)
  if (template) return template

  const { length } = strings
  let html = strings
    .reduce(function compile(html, string, index) {
      html += string
      if (index === length - 1) return html
      if (ATTRIBUTE.test(html)) html += `yeet-value-${index}`
      else if (TAG.test(html)) html += `yeet-attribute-${index}`
      else if (COMMENT.test(html)) html += `yeet-text-${index}`
      else html += `<!--yeet-node-${index}-->`
      return html
    }, '')
    .replace(LEADING_WHITESPACE, '$1')
    .replace(TRAILING_WHITESPACE, '$1')

  const wrap = isSVG && !html.startsWith('<svg')
  if (wrap) html = `<svg>${html}</svg>`

  const container = document.createElement('template')
  container.innerHTML = html
  template = container.content
  const { firstChild, childNodes } = template
  if (childNodes.length === 1 && firstChild && !isPlaceholder(firstChild)) {
    template = firstChild
    if (wrap) template = template.firstChild
  }

  if (template) templates.set(strings, template)

  return template
}

/**
 * @param {Partial|Component} value
 * @param {Element|string?} parent
 * @param {State} [state={}]
 */
function mount(value, parent, state = {}) {
  if (typeof parent === 'string') parent = document.querySelector(parent)
  if (!parent) throw new Error('Node not found')
  const slot = new Slot(parent, 0, [...parent.childNodes])
  mountSlot(value, slot, new Context(state, value.key))
}

/**
 * @typedef {(Partial|Component|INTERMEDIATE)} Mountable
 * @param {Mountable|Mountable[]} values
 * @param {Slot} slot
 * @param {Context} ctx
 * @returns {Slot}
 */
function mountSlot(values, slot, ctx) {
  if (!Array.isArray(values)) values = [values]

  const newChildren = []
  const { parent, children } = slot
  for (let i = 0; i < values.length; i++) {
    let value = values[i]

    if (value instanceof Component) {
      let index = 0
      const layers = []
      while (value instanceof Component) {
        layers.push(value)
        ctx = ctx.spawn(value.key)
        const editor = createComponentEditor(slot, ctx, index++, layers)
        value = value.render(ctx, function (next) {
          if (value === INTERMEDIATE && next) {
            mountSlot(next, slot, ctx)
          } else {
            editor(next)
          }
        })
      }
    }

    if (value instanceof Partial) {
      const { values, key } = value
      const template = parse(value)

      ctx = ctx.spawn(key)

      if (template) {
        if (template.nodeType === FRAGMENT_NODE) {
          let i = 0
          const fragment = new Fragment(key, [...template.childNodes].map(
            (child) => {
              // @ts-expect-error slot children are all nodes on mount
              const _child = mountChild(parent, child, i, children)
              if (_child) i++
              return _child
            }
          ))
          cache.set(fragment, ctx)
          newChildren.push(fragment)
        } else {
          // @ts-expect-error slot children are all nodes on mount
          const child = mountChild(parent, template, 0, children)
          if (child instanceof window.Node) cache.set(child, ctx)
          if (child) newChildren.push(child)
        }

        /**
         * @param {Element} parent
         * @param {Node|null} newChild
         * @param {number} index
         * @param {Node[]} list
         * @returns {Node|Slot|null}
         */
        function mountChild(parent, newChild, index, list) {
          for (let oldChild = list.shift(); oldChild; oldChild = list.shift()) {
            if (newChild) {
              if (isPlaceholder(newChild)) {
                // Put back node to mount on
                list.unshift(oldChild)

                const id = getPlaceholderId(newChild)
                const _slot = new Slot(parent, index, list)

                ctx.editors.push(createNodeEditor(id, _slot, ctx))

                mountSlot(values[id], _slot, ctx)

                return _slot
              }

              if (newChild.nodeType === ELEMENT_NODE) {
                if (oldChild.nodeName === newChild.nodeName) {
                  let i = 0
                  const children = [...oldChild.childNodes]
                  for (const child of newChild.childNodes) {
                    // @ts-expect-error oldChild is Element
                    if (mountChild(oldChild, child, i, children)) {
                      i++
                    }
                  }

                  remove(children)

                  return oldChild
                } else {
                  remove(oldChild)
                }
              } else {
                if (oldChild.nodeValue !== newChild.nodeValue) {
                  // @ts-expect-error oldChild is CharacterNode
                  if (WHITESPACE.test(newChild.nodeValue)) {
                    // Skip whitespace nodes
                    list.unshift(oldChild)
                    return null
                  } else {
                    // Update text nodes to account for interpolated partials
                    oldChild.nodeValue = newChild.nodeValue
                  }
                }

                return oldChild
              }
            } else {
              remove(oldChild)
            }
          }

          if (newChild) {
            if (isPlaceholder(newChild)) {
              const id = getPlaceholderId(newChild)
              const _slot = new Slot(parent, index, [])
              ctx.editors.push(createNodeEditor(id, _slot, ctx))
              morph(_slot, values[id], ctx)
              return _slot
            }

            newChild = newChild.cloneNode(true)
            const editors = compile(newChild, ctx)

            try {
              stack.unshift(ctx)
              for (const editor of editors) {
                // @ts-expect-error value is Partial
                editor(value)
              }
            } finally {
              stack.shift()
            }

            parent.appendChild(newChild)
            return newChild
          }

          return null
        }
      }
    } else if (value === INTERMEDIATE) {
      newChildren.push(...children.splice(0, 1))
    } else {
      for (let child = children.shift(); child; child = children.shift()) {
        if (child.nodeType === TEXT_NODE) {
          const content = String(value)
          if (child.nodeValue !== content) {
            child.nodeValue = content
          }
          newChildren.push(child)
          break
        } else {
          parent.removeChild(child)
        }
      }
    }
  }

  slot.children = newChildren

  return slot

}

/**
 * @param {Slot} slot
 * @param {Context} ctx
 * @param {number} [index=0]
 * @param {Component[]} [layers=[]]
 * @returns {function(any): void})}
 */
function createComponentEditor(slot, ctx, index = 0, layers = []) {
  return function editor(value) {
    let _index = index
    while (value instanceof Component) {
      const layer = layers[_index++]
      if (layer?.key === value.key) {
        layer.update?.(value.args)
        value = layer
      } else {
        ctx = ctx.spawn(value.key)
        layers.splice(_index, layers.length, value)
        value = value.render(
          ctx,
          createComponentEditor(slot, ctx, index++, layers)
        )
      }
    }
    morph(slot, value, ctx)
  }
}

/**
 * @param {number} id
 * @param {Slot} slot
 * @param {Context} ctx
 * @returns {Editor}
 */
function createNodeEditor(id, slot, ctx) {
  const onupdate = createComponentEditor(slot, ctx)

  return function (partial) {
    const value = partial.values[id]
    if (value instanceof Component) {
      onupdate(value)
    } else {
      morph(slot, value, ctx)
    }
  }
}

/**
 * @param {Slot} slot
 * @param {any} newChild
 * @param {Context} ctx
 */
function morph(slot, newChild, ctx) {
  const newChildren = Array.isArray(newChild) ? newChild : [newChild]

  slot.children = newChildren.map(function eachChild(newChild, index) {
    if (newChild instanceof Partial) {
      for (let i = index; i < slot.children.length; i++) {
        const oldChild = slot.children[i]
        if (!oldChild) continue
        if (oldChild instanceof Slot) {
          return morph(oldChild, newChild, ctx)
        } else {
          const cached = cache.get(oldChild)
          if (cached?.key === newChild.key) {
            update(cached, newChild)
            return oldChild
          }
        }
        remove(slot.children.splice(i, 1))
      }

      ctx = ctx.spawn(newChild.key)
      const _newChild = toNode(newChild, ctx)
      update(ctx, newChild)
      if (_newChild) {
        cache.set(_newChild, ctx)
        insert(_newChild, slot)
      }
      return _newChild
    } else if (newChild != null) {
      const oldChild = slot.children[index]
      if (oldChild?.nodeType === TEXT_NODE) {
        newChild = String(newChild)
        if (oldChild.nodeValue !== newChild) {
          oldChild.nodeValue = newChild
        }
        return oldChild
      } else {
        newChild = toNode(newChild, ctx)
        if (oldChild) replace(oldChild, newChild)
        else insert(newChild, slot)
        slot.children[index] = newChild
        return newChild
      }
    } else {
      remove(slot.children[index])
      return null
    }
  })
}

/**
 * @param {Node} node
 * @param {Slot} slot
 */
function insert(node, slot) {
  const next = slot.siblings
    .slice(slot.index)
    .flatMap(
      /**
       * @param {Slot|Node|null} child
       * @param {number} index
       * @param {(Slot|Node|null)[]} list
       * @returns {((Node|null)[])|Node|null}
       */
      function flat(child, index, list) {
        return child instanceof Slot ? child.children.flatMap(flat) : child
      }
    )
    .find(Boolean)

  if (next) slot.parent.insertBefore(node, next)
  else slot.parent.appendChild(node)
}

/**
 * @param {any} value
 * @param {Context} ctx
 * @returns {Node|null}
 */
function toNode(value, ctx) {
  if (value == null) return null
  if (value instanceof window.Node) return value
  if (Array.isArray(value)) {
    const fragment = document.createDocumentFragment()
    for (let node of value) {
      node = toNode(node, ctx)
      if (node) fragment.append()
    }
    return fragment
  }

  if (value instanceof Partial) {
    const template = parse(value)
    if (template) {
      const node = template.cloneNode(true)
      compile(node, ctx)
      return node
    }

    return null
  }

  return document.createTextNode(String(value))
}

/**
 * @param {Node} node
 * @param {Context} ctx
 * @returns {Editor[]}
 */
function compile(node, ctx) {
  handleNode(node, ctx)

  const length = ctx.editors.length
  const walker = document.createTreeWalker(node, 1 | 128, null)
  for (let next = walker.nextNode(); next; next = walker.nextNode()) {
    handleNode(next, ctx)
  }

  return ctx.editors.slice(length)
}

/**
 * @param {Node} node
 * @param {Context} ctx
 */
function handleNode(node, ctx) {
  const { nodeType } = node
  if (isPlaceholder(node)) {
    const id = getPlaceholderId(node)
    /** @type {Element} */
    const parent = node.parentElement
    /** @type {Node[]} */
    const children = [...parent.childNodes]
    const slot = new Slot(parent, children.indexOf(node), [node])
    ctx.editors.push(createNodeEditor(id, slot, ctx))
  } else if (nodeType === ELEMENT_NODE) {
    // const editor = getAttributeEditor(node)
    // if (editor) ctx.editors.push(editor)
  }
}

/**
 * @param {Context} ctx
 * @param {Partial} partial
 */
function update(ctx, partial) {
  try {
    stack.unshift(ctx)
    for (const editor of ctx.editors) {
      editor(partial)
    }
  } finally {
    stack.shift()
  }
}

/**
 * @param {Node|Slot|Fragment|null|(Node|Slot|Fragment|null)[]} node
 */
function remove(node) {
  if (!node) return
  if (Array.isArray(node)) {
    node.forEach(remove)
  } else if (node instanceof Slot || node instanceof Fragment) {
    remove(node.children)
  } else if (node instanceof window.Node) {
    node.parentNode?.removeChild(node)
  }
}

/**
 * @param {*} oldNode
 * @param {*} newNode
 */
function replace (oldNode, newNode) {
  if (Array.isArray(oldNode)) {
    const [first, ...rest] = oldNode
    replace(first, newNode)
    remove(rest)
  } else if (Array.isArray(newNode)) {
    const [first, ...rest] = newNode
    const next = oldNode.nextSibling
    replace(oldNode, first)
    for (const newNode of rest) {
      if (next) first.parentNode.insertBefore(newNode, next)
      else first.parentNode.appendChild(newNode)
    }
  } else {
    oldNode.replaceWith(newNode)
  }
}

// document.body.innerHTML = '<div id="app"><h1>Hello world!</h1></div>'
document.body.innerHTML =
 '<div id="app"><h1>Hello planet!</h1><ul><li>1</li><li>2</li><li>3</li><li>4</li></ul></div>'

const Proxy = CreateComponent(function Proxy(state, emit) {
  return (child) => child
})

const Greeting = CreateComponent(function Greeting(state, emit) {
  return (name) => html`<h1>Hello ${name}!</h1>`
})

const App = CreateComponent(function* App(state, emit) {
  let name = 'world'
  const items = [1, 2, 3]

  yield function* () {
    // yield new Promise((resolve) => setTimeout(resolve, 500))
          // ${items.map((item) => html`<li>${item}</li>`)}
    yield html`
      <div id="app">
        ${Proxy(Greeting(name))}
        <ul>
          ${html`
            <li>${items[0]}</li>
            <li>${items[1]}</li>
            <li>${items[2]}</li>
          `}
        </ul>
      </div>
    `
    if (name === 'world') {
      setTimeout(() => {
        name = 'planet'
        items.reverse()
        emit('render')
      }, 1000)
    }
    console.log('done')
  }

  console.error(new Error('Should not be here'))
})

mount(App(), 'body')

// mount(html`
//   <div id="app">
//     ${html`<h1>Hello world!</h1>`}
//     <ul>
//       ${[1, 2, 3].map((item) => html`<li>${item}</li>`)}
//     </ul>
//   </div>
// `, 'body')
