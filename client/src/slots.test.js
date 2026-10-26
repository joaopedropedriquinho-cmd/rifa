import test from 'node:test'
import assert from 'node:assert/strict'

test('the number display uses two digits for positions 1 through 100', () => {
  const labels = Array.from({ length: 100 }, (_, index) => String(index + 1).padStart(2, '0'))
  assert.equal(labels.length, 100)
  assert.equal(labels[0], '01')
  assert.equal(labels[98], '99')
  assert.equal(labels[99], '100')
})
