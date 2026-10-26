export const SLOT_COUNT = 100
export const DEFAULT_RESERVATION_MINUTES = 15

export function parseReservationMinutes(value) {
  if (value === undefined || value === '') return DEFAULT_RESERVATION_MINUTES
  const minutes = Number(value)
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 1440) {
    throw new Error('RESERVATION_TTL_MINUTES must be an integer between 1 and 1440.')
  }
  return minutes
}

export function validateNumbers(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > SLOT_COUNT) return null
  if (!value.every((number) => Number.isInteger(number) && number >= 1 && number <= SLOT_COUNT)) return null
  const unique = [...new Set(value)]
  return unique.length === value.length ? unique.sort((a, b) => a - b) : null
}

export function getReservationExpiry(minutes, now = Date.now()) {
  return new Date(now + minutes * 60_000)
}
