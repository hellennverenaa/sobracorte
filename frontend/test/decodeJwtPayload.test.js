import assert from 'node:assert/strict'
import test from 'node:test'
import { decodeJwtPayload } from '../src/services/decodeJwtPayload.js'

test('decodifica caracteres UTF-8 do token sem corromper nome, setor e função', () => {
  const payload = { nome: 'José Falcão', setor: 'Produção', funcao: 'Líder' }
  const token = `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`
  assert.deepEqual(decodeJwtPayload(token), payload)
})
