import assert from 'node:assert/strict'
import test from 'node:test'
import { canSwitchFactoryUnit, normalizeFactoryUnitCode } from '../src/services/unitAccess.js'

test('only global administrators can switch factory units', () => {
  assert.equal(canSwitchFactoryUnit({ isGlobalAdmin: true, role: 'admin' }), true)
  assert.equal(canSwitchFactoryUnit({ isGlobalAdmin: false, role: 'admin' }), false)
  assert.equal(canSwitchFactoryUnit({ role: 'admin' }), false)
  assert.equal(canSwitchFactoryUnit(null), false)
})

test('normalizes the target factory unit code', () => {
  assert.equal(normalizeFactoryUnitCode(' saj '), 'SAJ')
  assert.equal(normalizeFactoryUnitCode(undefined), '')
})
