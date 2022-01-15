/** @type {RegExp} */
export const EVENT_PREFIX = /^on/

/** @type {WeakMap<Node, EventHandler>} */
export const events = new WeakMap()

/**
 * Implementation of EventListener
 * @link https://developer.mozilla.org/en-US/docs/web/api/eventlistener
 * @class EventHandler
 * @extends {Map}
 */
export class EventHandler extends Map {
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
    const event = key.replace(EVENT_PREFIX, '')
    if (value) node.addEventListener(event, this)
    else node.removeEventListener(event, this)
    super.set(event, value)
  }
}
