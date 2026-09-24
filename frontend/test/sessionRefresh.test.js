import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRefreshedSessionUser } from '../src/services/interceptors/sessionRefresh.js'

const tokenPayload = {
  usuario: 'operador.saj',
  nome: 'Operador SAJ',
  setor: 'Corte',
}

test('session refresh preserves the backend assigned sector', () => {
  const refreshed = buildRefreshedSessionUser({
    user: { id: 'old', role: 'leitor', assignedSector: 'Montagem' },
    token: 'new-token',
    tokenPayload,
    synced: {
      user: { id: 'new', nome: 'José Falcão', setor: 'Novo setor', funcao: 'Nova função', role: 'lider', assignedSector: 'Corte' },
      unit: { code: 'SAJ' },
      isGlobalAdmin: false,
    },
  })

  assert.equal(refreshed.assignedSector, 'Corte')
  assert.equal(refreshed.role, 'lider')
  assert.equal(refreshed.nome, 'José Falcão')
  assert.equal(refreshed.setor, 'Novo setor')
  assert.equal(refreshed.funcao, 'Nova função')
})

test('session refresh clears a revoked assigned sector when backend returns null', () => {
  const refreshed = buildRefreshedSessionUser({
    user: { role: 'lider', assignedSector: 'Corte' },
    token: 'new-token',
    tokenPayload,
    synced: { user: { role: 'leitor', assignedSector: null }, unit: { code: 'SAJ' } },
  })

  assert.equal(refreshed.assignedSector, null)
})
