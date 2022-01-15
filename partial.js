import { isPlaceholder } from './utils.js'

const TAG = /<[a-z-]+ [^>]+$/i
const COMMENT = /<!--(?!.*-->)/
const LEADING_WHITESPACE = /^\s+(<)/
const TRAILING_WHITESPACE = /(>)\s+$/
const ATTRIBUTE = /<[a-z-]+[^>]*?\s+(([^\t\n\f "'>/=]+)=("|')?)?$/i

/** @type {WeakMap<Array<string>, Node>} */
const templates = new WeakMap()

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
 * Parse partial
 * @export
 * @param {Partial} partial The partial to parse
 * @returns {Node}
 */
export function parse (partial) {
  const { strings, isSVG } = partial
  let template = templates.get(strings)
  if (template) return template

  const { length } = strings
  let html = strings.reduce(function compile (html, string, index) {
    html += string
    if (index === length - 1) return html
    if (ATTRIBUTE.test(html) || COMMENT.test(html)) html += `yeet-${index}`
    else if (TAG.test(html)) html += `data-yeet-${index}`
    else html += `<!--yeet-${index}-->`
    return html
  }, '').replace(LEADING_WHITESPACE, '$1').replace(TRAILING_WHITESPACE, '$1')

  const wrap = isSVG && !html.startsWith('<svg')
  if (wrap) html = `<svg>${html}</svg>`

  template = document.createElement('template')
  template.innerHTML = html
  template = template.content
  if (template.childNodes.length === 1 && !isPlaceholder(template.firstChild)) {
    template = template.firstChild
    if (wrap) template = template.firstChild
  }

  templates.set(strings, template)

  return template
}
