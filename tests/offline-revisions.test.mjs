import test from 'node:test'
import assert from 'node:assert/strict'
import { checkLocalRevisionShop } from '../lib/revision-offline.ts'
import { requireLogoutConsent, canMutateStock } from '../lib/offline-policy.ts'
import { isOfflineSection } from '../lib/offline-sections.ts'
import { parseRevisionSession, toggleRevisionCheck } from '../lib/inventory-revision.ts'

test('offline revision restores marks and completion after cold reload', () => {
  const marked = toggleRevisionCheck([], 'p-1', true)
  const saved = JSON.stringify({ checkedProductIds: marked, finished: true })
  assert.deepEqual(parseRevisionSession(saved), { checkedProductIds: ['p-1'], finished: true })
  assert.equal(isOfflineSection('revisions'), true)
})
test('matching local shop QR is accepted without network', () => {
  assert.equal(checkLocalRevisionShop(12, 12).ok, true)
})
test('foreign local shop QR is rejected', () => {
  const result = checkLocalRevisionShop(13, 12)
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'foreign_shop')
})
test('missing cached shop identifier never authorizes offline QR', () => {
  assert.equal(checkLocalRevisionShop(12, null).ok, false)
})
test('online-only screens remain unavailable offline', () => {
  for (const screen of ['money', 'vitrina', 'clients', 'otchety', 'shops', 'notifications', 'suppliers']) assert.equal(isOfflineSection(screen), false)
})
test('stock mutability follows the current connection', () => {
  assert.equal(canMutateStock(false), false)
  assert.equal(canMutateStock(true), true)
})
test('first logout confirmation is not consent to destroy unsynced data', () => {
  assert.throws(() => requireLogoutConsent(5), error => error.count === 5)
  assert.doesNotThrow(() => requireLogoutConsent(5, { discardUnsynced: true }))
})
