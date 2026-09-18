import assert from 'node:assert/strict'
import test from 'node:test'
import { canSwitchFactoryUnit, hasPendingSectorAssignment, normalizeFactoryUnitCode } from '../src/services/unitAccess.js'

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

test('identifies users waiting for a sector without treating administrators as pending', () => {
  assert.equal(hasPendingSectorAssignment({ role: 'leitor', assignedSector: null }), true)
  assert.equal(hasPendingSectorAssignment({ role: 'leitor', assignedSector: 'CORTE' }), false)
  assert.equal(hasPendingSectorAssignment({ role: 'admin', assignedSector: null }), false)
  assert.equal(hasPendingSectorAssignment({ role: 'leitor', assignedSector: null, isGlobalAdmin: true }), false)
})
