import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildIdentitiesRegistrationUrl,
  buildLoginPayload,
  getLoginEndpoint,
  isLegacyUnit,
  loginByUnit,
  selectInitialUnit,
  shouldDiscardStoredUnit,
} from '../src/services/auth/loginFlow.js'

test('URL de cadastro usa a base do DASS Identidades e codifica a unidade', () => {
  assert.equal(
    buildIdentitiesRegistrationUrl(' http://localhost:5173/identities/ ', ' saj '),
    'http://localhost:5173/identities/register?unidade=SAJ',
  )
  assert.equal(buildIdentitiesRegistrationUrl('', 'SAJ'), null)
  assert.equal(buildIdentitiesRegistrationUrl('http://localhost:5173/identities', 'SEST'), null)
})

test('SEST usa o login Unix e não envia unidade', () => {
  assert.equal(isLegacyUnit('SEST'), true)
  assert.equal(getLoginEndpoint('SEST'), '/auth/login')
  assert.deepEqual(buildLoginPayload('SEST', 'USUARIO', 'senha'), {
    usuario: 'USUARIO',
    senha: 'senha',
  })
})

test('unidade externa usa o login externo e envia a unidade', () => {
  assert.equal(isLegacyUnit(' saj '), false)
  assert.equal(getLoginEndpoint(' saj '), '/auth/external/login')
  assert.deepEqual(buildLoginPayload(' saj ', 'USUARIO', 'senha'), {
    unidade: 'SAJ',
    usuario: 'USUARIO',
    senha: 'senha',
  })
})

test('loginByUnit centraliza endpoint e payload', async () => {
  const calls = []
  const authClient = {
    post: async (...args) => {
      calls.push(args)
      return { data: { data: { token: 'token' } } }
    },
  }

  const response = await loginByUnit(authClient, 'SAJ', 'USUARIO', 'senha')

  assert.equal(response.data.data.token, 'token')
  assert.deepEqual(calls, [[
    '/auth/external/login',
    { unidade: 'SAJ', usuario: 'USUARIO', senha: 'senha' },
  ]])
})

test('unidade externa não mascara falhas operacionais com fallback legado', async () => {
  const expected = { response: { status: 500 } }
  const calls = []
  const authClient = {
    post: async (...args) => {
      calls.push(args)
      throw expected
    },
  }

  await assert.rejects(() => loginByUnit(authClient, 'SAJ', 'USUARIO', 'senha'), expected)
  assert.equal(calls.length, 1)
})

test('unidade salva continua selecionada somente quando está disponível', () => {
  const units = [{ code: 'SAJ', name: 'Santo Antônio de Jesus' }, { code: 'SEST', name: 'SEST' }]

  assert.equal(selectInitialUnit(units, 'SAJ'), 'SAJ')
  assert.equal(selectInitialUnit(units, 'STJ'), 'SAJ')
  assert.equal(shouldDiscardStoredUnit(units, 'STJ'), true)
  assert.equal(shouldDiscardStoredUnit(units, 'SAJ'), false)
})

test('sem unidades disponíveis não há seleção nem unidade persistida válida', () => {
  assert.equal(selectInitialUnit([], 'STJ'), '')
  assert.equal(shouldDiscardStoredUnit([], 'STJ'), true)
})
