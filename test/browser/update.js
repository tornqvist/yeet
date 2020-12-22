import { suite } from 'uvu'
import * as assert from 'uvu/assert'
import { html, mount } from '../../index.js'

const order = suite('order')

order('is preserved for arrays', function () {
  const ul = document.createElement('ul')
  const children = [
    () => html`<li>1</li>`,
    () => html`<li>2</li>`,
    () => html`<li>3</li>`,
    () => html`<li>4</li>`
  ]
  mount(main(), ul)
  const [one, two, three, four] = ul.childNodes
  assert.is(ul.innerText, '1234')
  children.reverse()
  mount(main(), ul)
  // console.log(ul.childNodes[0].outerHTML, four.outerHTML)
  // assert.is(ul.childNodes[0], four)
  // assert.is(ul.childNodes[1], three)
  // assert.is(ul.childNodes[2], two)
  // assert.is(ul.childNodes[3], one)
  assert.is(ul.innerText, '4321')

  function main () {
    return html`<ul>${children.map((fn) => fn())}</ul>`
  }
})

order.run()
