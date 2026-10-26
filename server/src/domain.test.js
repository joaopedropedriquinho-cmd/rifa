import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DEFAULT_RESERVATION_MINUTES,
  SLOT_COUNT,
  getReservationExpiry,
  parseReservationMinutes,
  validateNumbers,
} from './domain.js'

test('the application defines exactly 100 positions', () => {
  assert.equal(SLOT_COUNT, 100)
  assert.equal(validateNumbers(Array.from({ length: SLOT_COUNT }, (_, index) => index + 1)).length, 100)
})

test('reservation numbers are unique integers in range and returned sorted', () => {
  assert.deepEqual(validateNumbers([8, 2, 100]), [2, 8, 100])
  assert.equal(validateNumbers([1, 1]), null)
  assert.equal(validateNumbers([0]), null)
  assert.equal(validateNumbers([101]), null)
  assert.equal(validateNumbers(['1']), null)
  assert.equal(validateNumbers([]), null)
})

test('reservation duration has a safe default and an explicit upper bound', () => {
  assert.equal(parseReservationMinutes(undefined), DEFAULT_RESERVATION_MINUTES)
  assert.equal(parseReservationMinutes('30'), 30)
  assert.throws(() => parseReservationMinutes('0'))
  assert.throws(() => parseReservationMinutes('1441'))
})

test('reservation expiry is calculated from server time', () => {
  assert.equal(getReservationExpiry(15, 1_000).getTime(), 901_000)
})
