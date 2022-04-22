import { suite } from 'uvu'
import * as assert from 'uvu/assert'
import { svg, html, render } from '../../index.js'

const rendering = suite('rendering')

rendering('with root svg tag', function () {
  const div = document.createElement('div')
  render(svg`
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="50"/>
    </svg>
  `, div)
  assert.instance(div.firstElementChild, window.SVGElement)
  assert.instance(div.firstElementChild.firstElementChild, window.SVGElement)
})

rendering('stand alone svg child node', function () {
  const parent = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  render(svg`<circle cx="50" cy="50" r="50"/>`, parent)
  assert.instance(parent.firstElementChild, window.SVGElement)
})

rendering('as child of html tag', function () {
  const div = document.createElement('div')
  render(html`
    <div>
      ${svg`
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="50" r="50"/>
        </svg>
      `}
    </div>
  `, div)
  assert.instance(div.firstElementChild.firstElementChild, window.SVGElement)
  assert.instance(div.firstElementChild.firstElementChild.firstElementChild, window.SVGElement)
})

rendering.run()
