import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildRecoveryUrl,
  buildRegistrationUrl,
  intersectFactoryUnits,
  isLegacyUnit,
  loginRequest,
  normalizeUnitCode,
} from '../src/services/loginFlow.js'

test('normalizes unit identifiers and keeps SEST on the legacy flow', () => {
  assert.equal(normalizeUnitCode('  sest '), 'SEST')
  assert.equal(isLegacyUnit(' sest '), true)
  assert.deepEqual(loginRequest('sest', ' user ', 'secret'), {
    endpoint: '/auth/login',
    payload: { usuario: 'user', senha: 'secret' },
    legacy: true,
  })
})

test('uses the external endpoint and includes the unit for non-SEST', () => {
  assert.deepEqual(loginRequest(' saj ', ' user ', 'secret'), {
    endpoint: '/auth/external/login',
    payload: { unidade: 'SAJ', usuario: 'user', senha: 'secret' },
    legacy: false,
  })
})

test('intersects catalogs, always allows SEST, and hides ITP and IVT', () => {
  const factory = { data: [
    { code: 'SEST', name: 'Santo Estêvão' },
    { code: 'SAJ', name: 'Santo Antônio de Jesus' },
    { code: 'ITB', name: 'Itabuna' },
    { code: 'VDC', name: 'Vitória da Conquista' },
    { code: 'ITP', name: 'Itapetinga' },
    { code: 'IVT', name: 'Ivitória' },
  ] }
  const external = { items: [{ codigo: 'SAJ' }, { codigo: 'ITB' }, { codigo: 'VDC' }, { codigo: 'ITP' }] }
  assert.deepEqual(intersectFactoryUnits(factory, external).map(unit => unit.code), ['SEST', 'SAJ', 'ITB', 'VDC'])
})

test('external catalog failure leaves SEST available', () => {
  assert.deepEqual(intersectFactoryUnits({ data: [{ code: 'SAJ' }, { code: 'SEST' }] }, []), [
    { code: 'SEST', name: 'SEST' },
  ])
})

test('builds registration and recovery URLs with a normalized unit', () => {
  assert.equal(buildRegistrationUrl('https://identidades.example/identities/', ' saj '), 'https://identidades.example/identities/register?unidade=SAJ')
  assert.equal(buildRecoveryUrl('/identities/', ' saj '), '/identities/recover?unidade=SAJ')
})
