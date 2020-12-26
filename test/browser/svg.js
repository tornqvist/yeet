import { suite } from 'uvu'
import * as assert from 'uvu/assert'
import { svg, html } from '../../index.js'

const render = suite('render')

render('with root svg tag', function () {
  const res = svg`
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="50"/>
    </svg>
  `.render()
  assert.instance(res, window.SVGElement)
  assert.instance(res.firstElementChild, window.SVGElement)
})

render('stand alone svg child node', function () {
  const res = svg`<circle cx="50" cy="50" r="50"/>`.render()
  assert.instance(res, window.SVGElement)
})

render('as child of html tag', function () {
  const res = html`
    <div>
      ${svg`
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="50" r="50"/>
        </svg>
      `}
    </div>
  `.render()
  assert.instance(res.firstElementChild, window.SVGElement)
  assert.instance(res.firstElementChild.firstElementChild, window.SVGElement)
})

render.run()
