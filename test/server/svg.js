import { suite } from 'uvu'
import * as assert from 'uvu/assert'
import { svg, html } from '../../server.js'

const render = suite('render')

render('with root svg tag', async function () {
  const res = svg`
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="50"/>
    </svg>
  `
  assert.snapshot(dedent`
    <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <circle cx="50" cy="50" r="50"/>
    </svg>
  `, dedent(await res.render()))
})

render('as child of html tag', async function () {
  const res = html`
    <div>
      ${svg`
        <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="50" r="50"/>
        </svg>
      `}
    </div>
  `
  assert.snapshot(dedent`
    <div>
      <svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="50" r="50"/>
      </svg>
    </div>
  `, dedent(await res.render()))
})

render.run()

function dedent (string) {
  if (Array.isArray(string)) string = string.join('')
  return string.replace(/\n\s+/g, '\n').trim()
}
