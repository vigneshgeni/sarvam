import { test } from 'node:test'
import assert from 'node:assert/strict'
import { exportHasHiddenPaint, prepareExportNode } from '../src/utils/shareImage.js'

function el(style = {}, kids = []) {
  const node = {
    style: { opacity: '', visibility: '', animation: '', transition: '', transform: '', position: '', ...style },
    classList: { remove() {} },
    tagName: 'DIV',
    children: kids,
    querySelectorAll() {
      return kids.flatMap((child) => [child, ...child.querySelectorAll()])
    },
  }
  return node
}

test('an export node has no opacity 0 or hidden element', () => {
  const root = el(
    { opacity: '0', visibility: 'hidden', position: 'sticky' },
    [el({ opacity: '0' }), el({ visibility: 'hidden', position: 'fixed' })],
  )
  prepareExportNode(root)
  assert.equal(exportHasHiddenPaint(root), false)
  assert.equal(root.style.position, 'static')
  assert.equal(root.children[1].style.position, 'static')
})
