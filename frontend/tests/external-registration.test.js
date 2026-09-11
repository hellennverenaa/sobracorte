import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildExternalRegistrationPayload,
  externalRegistrationErrorMessage,
  firstExternalRegistrationError,
  registerExternalUser,
  validateExternalRegistration,
} from '../src/services/auth/externalRegistration.js'

const validForm = {
  unidade: ' saj ',
  matricula: ' A001X ',
  nome: ' Pessoa Externa ',
  usuario: ' pessoa.externa ',
  senha: 'senha-segura',
  confirmarSenha: 'senha-segura',
  setor: ' Produção ',
  funcao: ' Operador ',
}

test('monta payload externo sem confirmação de senha e normaliza a unidade', () => {
  assert.deepEqual(buildExternalRegistrationPayload(validForm), {
    unidade: 'SAJ',
    matricula: 'A001X',
    nome: 'Pessoa Externa',
    usuario: 'pessoa.externa',
    senha: 'senha-segura',
    setor: 'Produção',
    funcao: 'Operador',
  })
  assert.equal('confirmarSenha' in buildExternalRegistrationPayload(validForm), false)
})

test('valida obrigatórios, senha mínima e confirmação', () => {
  const validation = validateExternalRegistration({ ...validForm, senha: 'curta', confirmarSenha: 'outra' })

  assert.equal(validation.valid, false)
  assert.match(firstExternalRegistrationError(validation), /no mínimo 8/)
  assert.match(validation.errors.confirmarSenha, /não confere/)
})

test('cadastro chama o endpoint externo com payload validado', async () => {
  const calls = []
  const authClient = { post: async (...args) => { calls.push(args); return { status: 201 } } }

  const response = await registerExternalUser(authClient, validForm)

  assert.equal(response.status, 201)
  assert.deepEqual(calls, [[
    '/auth/external/register',
    buildExternalRegistrationPayload(validForm),
  ]])
})

test('mensagens cobrem respostas HTTP e falha de rede', () => {
  assert.match(externalRegistrationErrorMessage({ response: { status: 400 } }), /dados informados são inválidos/)
  assert.match(externalRegistrationErrorMessage({ response: { status: 403 } }), /não está disponível/)
  assert.match(externalRegistrationErrorMessage({ response: { status: 409 } }), /já estão cadastrados/)
  assert.match(externalRegistrationErrorMessage({ response: { status: 500 } }), /Tente novamente mais tarde/)
  assert.match(externalRegistrationErrorMessage({ code: 'ERR_NETWORK' }), /temporariamente indisponível/)
})
