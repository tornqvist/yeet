/**
 * Create a fragment container
 * @param {DocumentFragment} fragment Fragment node
 */
export function Fragment (key, fragment) {
  this.key = key
  this.children = [...fragment.childNodes]
}
