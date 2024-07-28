export class Partial {
  /**
   * @param {TemplateStringsArray|string[]} strings
   * @param  {any[]} values
   * @param {object} [opts]
   * @param {TemplateStringsArray|string} [opts.key]
   * @param {boolean} [opts.isSVG=false]
   */
  constructor(strings, values, opts) {
    this.strings = strings
    this.values = values
    this.key = opts?.key || strings
    this.isSVG = Boolean(opts?.isSVG)
  }
}
