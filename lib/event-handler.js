/** @type {RegExp} */
export const EVENT_PREFIX = /^on/

/** @type {WeakMap<Element, EventHandler>} */
export const events = new WeakMap()

/**
 * Implementation of EventListener
 * @link https://developer.mozilla.org/en-US/docs/web/api/eventlistener
 */
export class EventHandler extends Map {
  /**
   * @param {Element} element
   */
  constructor (element) {
    super()
    this.element = element
    events.set(element, this)
  }

  /**
   * @param {Element} element
   * @returns {EventHandler}
   */
  static get (element) {
    return events.get(element) || new EventHandler(element)
  }

  /**
   * @param {Event} event
   * @returns {any}
   */
  handleEvent (event) {
    const handle = this.get(event.type)
    return handle.call(event.currentTarget, event)
  }

  /**
   * @override
   * @param {string} key
   * @param {(function(Event): any)|null} value
   * @returns {this}
   */
  set (key, value) {
    const { element } = this
    const event = key.replace(EVENT_PREFIX, '')
    if (value) element.addEventListener(event, this)
    else element.removeEventListener(event, this)
    return super.set(event, value)
  }
}
