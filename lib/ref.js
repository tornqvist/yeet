/** @type {WeakMap<Ref, Node>} */
export const refs = new WeakMap()

/**
 * Reference a mounted node via ref#current
 */
export class Ref {
  /**
   * Current Node
   */
  get current () {
    return refs.get(this)
  }
}