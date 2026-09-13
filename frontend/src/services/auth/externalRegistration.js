export const EXTERNAL_REGISTRATION_MIN_PASSWORD_LENGTH = 8
export const EXTERNAL_REGISTRATION_MAX_PASSWORD_BYTES = 72
export const EXTERNAL_REGISTRATION_MAX_TEXT_LENGTH = 150

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function identifier(value) {
  return text(value).toUpperCase()
}

export function buildExternalRegistrationPayload(form) {
  return {
    matricula: identifier(form?.matricula),
    nome: text(form?.nome),
    unidade: text(form?.unidade || form?.unitCode).toUpperCase(),
    usuario: identifier(form?.usuario || form?.username),
    senha: typeof form?.senha === 'string' ? form.senha : '',
    setor: text(form?.setor) || null,
    funcao: text(form?.funcao) || null,
  }
}

export function validateExternalRegistration(form, policyResponse) {
  const payload = buildExternalRegistrationPayload(form)
  const errors = {}

  if (!payload.unidade) errors.unidade = 'Selecione uma unidade.'
  if (!payload.matricula) errors.matricula = 'Informe sua matrícula.'
  if (!payload.nome) errors.nome = 'Informe seu nome.'
  if (!payload.usuario) errors.usuario = 'Informe o usuário que será utilizado no acesso.'
  if (!payload.senha) errors.senha = 'Informe uma senha.'
  if (payload.nome.length > EXTERNAL_REGISTRATION_MAX_TEXT_LENGTH) {
    errors.nome = `O nome deve ter no máximo ${EXTERNAL_REGISTRATION_MAX_TEXT_LENGTH} caracteres.`
  }
  if (payload.setor && payload.setor.length > EXTERNAL_REGISTRATION_MAX_TEXT_LENGTH) {
    errors.setor = `O setor deve ter no máximo ${EXTERNAL_REGISTRATION_MAX_TEXT_LENGTH} caracteres.`
  }
  if (payload.funcao && payload.funcao.length > EXTERNAL_REGISTRATION_MAX_TEXT_LENGTH) {
    errors.funcao = `A função deve ter no máximo ${EXTERNAL_REGISTRATION_MAX_TEXT_LENGTH} caracteres.`
  }
  if (payload.senha && payload.senha.length < EXTERNAL_REGISTRATION_MIN_PASSWORD_LENGTH) {
    errors.senha = `A senha deve ter no mínimo ${EXTERNAL_REGISTRATION_MIN_PASSWORD_LENGTH} caracteres.`
  }
  if (payload.senha && new TextEncoder().encode(payload.senha).length > EXTERNAL_REGISTRATION_MAX_PASSWORD_BYTES) {
    errors.senha = `A senha deve ter no máximo ${EXTERNAL_REGISTRATION_MAX_PASSWORD_BYTES} bytes.`
  }
  if (payload.senha !== (typeof form?.confirmarSenha === 'string' ? form.confirmarSenha : '')) {
    errors.confirmarSenha = 'A confirmação de senha não confere.'
  }

  const policy = policyResponse?.politica
  const requirements = externalRegistrationRequirements(policyResponse)
  if (policy && payload.usuario) {
    const username = policy.usuario
    const parts = payload.usuario.split(username.separador)
    const validParts = parts.length === username.partes && parts.every((part) =>
      /^[A-Z]+$/.test(part) &&
      part.length >= username.minimo_por_parte &&
      part.length <= username.maximo_por_parte,
    )
    if (!validParts) errors.usuario = requirements.usuario
  }
  if (policy && payload.matricula) {
    const registration = policy.matricula
    const validType = registration.tipo !== 'NUMERICA' || /^\d+$/.test(payload.matricula)
    const validPrefix = !registration.prefixo || payload.matricula.startsWith(registration.prefixo)
    const validSuffix = !registration.sufixo || payload.matricula.endsWith(registration.sufixo)
    if (!validType || !validPrefix || !validSuffix || payload.matricula.length !== registration.comprimento) {
      errors.matricula = requirements.matricula
    }
  }

  return { valid: Object.keys(errors).length === 0, errors, payload }
}

export function externalRegistrationRequirements(policyResponse) {
  const policy = policyResponse?.politica
  const password = `Use pelo menos ${EXTERNAL_REGISTRATION_MIN_PASSWORD_LENGTH} caracteres e no máximo ${EXTERNAL_REGISTRATION_MAX_PASSWORD_BYTES} bytes.`
  if (!policy) return { senha: password }

  const username = policy.usuario
  const registration = policy.matricula
  const separator = username.separador
  const usernameExample = username.partes === 2 && separator === '.' ? 'NOME.SOBRENOME. ' : ''
  const characterDescription = username.caracteres === 'LETRAS_ASCII' ? 'letras sem acentos' : 'caracteres permitidos'
  const suffix = registration.sufixo ? ` e terminar por ${registration.sufixo}` : ''
  const prefix = registration.prefixo ? `, começando por ${registration.prefixo}` : ''
  const registrationType = registration.tipo === 'NUMERICA' ? 'dígitos' : 'caracteres'

  return {
    usuario: `${usernameExample}Use exatamente ${username.partes} partes separadas por “${separator}”, com ${username.minimo_por_parte} a ${username.maximo_por_parte} ${characterDescription} em cada parte.`,
    matricula: `Use ${registration.comprimento} ${registrationType}${prefix}${suffix}.`,
    senha: password,
  }
}

export function firstExternalRegistrationError(validation) {
  return Object.values(validation?.errors || {})[0] || ''
}

export async function registerExternalUser(authClient, form, policyResponse) {
  const validation = validateExternalRegistration(form, policyResponse)
  if (!validation.valid) {
    const error = new Error(firstExternalRegistrationError(validation))
    error.validation = validation
    throw error
  }

  return authClient.post('/auth/external/register', validation.payload)
}

export async function getExternalRegistrationPolicy(authClient, unitCode) {
  const response = await authClient.get(`/auth/external/policies/${encodeURIComponent(identifier(unitCode))}`)
  return response.data
}

export function externalRegistrationFieldErrors(error) {
  if (error?.response?.data?.code !== 'REGISTRATION_POLICY_VIOLATION') return {}
  return Object.fromEntries(
    Object.entries(error.response.data.fields || {}).map(([field, violation]) => [field, violation?.message || 'Valor inválido.']),
  )
}

export function externalRegistrationErrorMessage(error) {
  const status = error?.response?.status
  if (status === 400) return Object.values(externalRegistrationFieldErrors(error))[0] || 'Os dados informados são inválidos. Confira os campos e tente novamente.'
  if (status === 403) return 'O cadastro externo não está disponível para esta unidade.'
  if (status === 409) return 'A matrícula ou o usuário já estão cadastrados.'
  if (status === 429) return 'Há muitas solicitações no momento. Aguarde e tente novamente.'
  if (status === 503) return error?.response?.data?.code === 'REGISTRATION_PROTECTION_UNAVAILABLE'
    ? 'A proteção de cadastro está temporariamente indisponível.'
    : 'A configuração de cadastro está temporariamente indisponível.'
  if (status >= 500) return 'Não foi possível concluir o cadastro. Tente novamente mais tarde.'
  if (error?.code === 'ERR_NETWORK' || error?.message === 'Network Error') {
    return 'O serviço de autenticação está temporariamente indisponível.'
  }
  return error?.response?.data?.message || 'Não foi possível concluir o cadastro. Tente novamente.'
}
