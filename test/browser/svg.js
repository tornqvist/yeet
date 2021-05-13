import { suite } from 'uvu'
import * as assert from 'uvu/assert'
import { svg, html, render } from '../../examples/rewrite/lib.js'

const rendering = suite('rendering')

rendering('with root svg tag', function () {
  const res = render(svg`
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="50"/>
    </svg>
  `)
  assert.instance(res, window.SVGElement)
  assert.instance(res.firstElementChild, window.SVGElement)
})

rendering('stand alone svg child node', function () {
  const res = render(svg`<circle cx="50" cy="50" r="50"/>`)
  assert.instance(res, window.SVGElement)
})

rendering('as child of html tag', function () {
  const res = render(html`
    <div>
      ${svg`
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="50" r="50"/>
        </svg>
      `}
    </div>
  `)
  assert.instance(res.firstElementChild, window.SVGElement)
  assert.instance(res.firstElementChild.firstElementChild, window.SVGElement)
})

rendering.run()
