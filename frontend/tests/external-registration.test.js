import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildExternalRegistrationPayload,
  externalRegistrationErrorMessage,
  externalRegistrationFieldErrors,
  externalRegistrationRequirements,
  firstExternalRegistrationError,
  getExternalRegistrationPolicy,
  registerExternalUser,
  validateExternalRegistration,
} from '../src/services/auth/externalRegistration.js'

const validForm = {
  unidade: ' saj ',
  matricula: ' 15000000 ',
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
    matricula: '15000000',
    nome: 'Pessoa Externa',
    usuario: 'PESSOA.EXTERNA',
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

test('cadastro inválido falha antes de chamar o serviço', async () => {
  let called = false
  const authClient = {
    post: async () => {
      called = true
    },
  }

  await assert.rejects(
    () => registerExternalUser(authClient, { ...validForm, senha: 'curta' }),
    (error) => {
      assert.match(error.message, /no mínimo 8/)
      assert.ok(error.validation)
      return true
    },
  )
  assert.equal(called, false)
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
  assert.match(externalRegistrationErrorMessage({ response: { status: 503 } }), /configuração.*indisponível/)
  assert.match(externalRegistrationErrorMessage({ response: { status: 500 } }), /Tente novamente mais tarde/)
  assert.match(externalRegistrationErrorMessage({ code: 'ERR_NETWORK' }), /temporariamente indisponível/)
})

const sajPolicy = {
  unidade: 'SAJ',
  autocadastro_disponivel: true,
  politica: {
    usuario: { partes: 2, separador: '.', minimo_por_parte: 3, maximo_por_parte: 15, caracteres: 'LETRAS_ASCII' },
    matricula: { tipo: 'NUMERICA', prefixo: '15', sufixo: null, comprimento: 8 },
    descricao: 'Use NOME.SOBRENOME e matrícula de 8 dígitos iniciando por 15.',
  },
}

test('valida matrícula e usuário usando a política pública', () => {
  assert.equal(validateExternalRegistration(validForm, sajPolicy).valid, true)
  const invalid = validateExternalRegistration({ ...validForm, matricula: '16000000', usuario: 'AB.SILVA' }, sajPolicy)
  assert.equal(invalid.valid, false)
  assert.match(invalid.errors.matricula, /começando por 15/)
  assert.match(invalid.errors.usuario, /NOME\.SOBRENOME/)
})

test('gera requisitos específicos e independentes para cada campo', () => {
  assert.deepEqual(externalRegistrationRequirements(sajPolicy), {
    matricula: 'Use 8 dígitos, começando por 15.',
    usuario: 'NOME.SOBRENOME. Use exatamente 2 partes separadas por “.”, com 3 a 15 letras sem acentos em cada parte.',
    senha: 'Use pelo menos 8 caracteres e no máximo 72 bytes.',
  })
})

test('rejeita senha que excede o limite do bcrypt em bytes', () => {
  const validation = validateExternalRegistration({
    ...validForm,
    senha: '😀'.repeat(19),
    confirmarSenha: '😀'.repeat(19),
  }, sajPolicy)
  assert.equal(validation.valid, false)
  assert.match(validation.errors.senha, /72 bytes/)
})

test('rejeita textos opcionais e nome acima do limite do serviço', () => {
  for (const field of ['nome', 'setor', 'funcao']) {
    const validation = validateExternalRegistration({ ...validForm, [field]: 'A'.repeat(151) }, sajPolicy)
    assert.equal(validation.valid, false)
    assert.match(validation.errors[field], /150 caracteres/)
  }
})

test('consulta política com unidade normalizada', async () => {
  const calls = []
  const authClient = { get: async (url) => { calls.push(url); return { data: sajPolicy } } }
  assert.deepEqual(await getExternalRegistrationPolicy(authClient, ' saj '), sajPolicy)
  assert.deepEqual(calls, ['/auth/external/policies/SAJ'])
})

test('extrai erros estruturados por campo', () => {
  const error = { response: { status: 400, data: {
    code: 'REGISTRATION_POLICY_VIOLATION',
    fields: { matricula: { code: 'INVALID_UNIT_REGISTRATION', message: 'Matrícula inválida para SAJ.' } },
  } } }
  assert.deepEqual(externalRegistrationFieldErrors(error), { matricula: 'Matrícula inválida para SAJ.' })
  assert.equal(externalRegistrationErrorMessage(error), 'Matrícula inválida para SAJ.')
})
