/**
 * Create a fragment container
 * @class
 * @param {any} key The key of the originating partial
 * @param {Node[]} children Fragment child nodes
 */
export function Fragment (key, children) {
  this.key = key
  this.children = children
}
