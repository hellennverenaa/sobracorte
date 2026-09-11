export const EXTERNAL_REGISTRATION_MIN_PASSWORD_LENGTH = 8

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function buildExternalRegistrationPayload(form) {
  return {
    matricula: text(form?.matricula),
    nome: text(form?.nome),
    unidade: text(form?.unidade || form?.unitCode).toUpperCase(),
    usuario: text(form?.usuario || form?.username),
    senha: typeof form?.senha === 'string' ? form.senha : '',
    setor: text(form?.setor) || null,
    funcao: text(form?.funcao) || null,
  }
}

export function validateExternalRegistration(form) {
  const payload = buildExternalRegistrationPayload(form)
  const errors = {}

  if (!payload.unidade) errors.unidade = 'Selecione uma unidade.'
  if (!payload.matricula) errors.matricula = 'Informe sua matrícula.'
  if (!payload.nome) errors.nome = 'Informe seu nome.'
  if (!payload.usuario) errors.usuario = 'Informe o usuário que será utilizado no acesso.'
  if (!payload.senha) errors.senha = 'Informe uma senha.'
  if (payload.senha && payload.senha.length < EXTERNAL_REGISTRATION_MIN_PASSWORD_LENGTH) {
    errors.senha = `A senha deve ter no mínimo ${EXTERNAL_REGISTRATION_MIN_PASSWORD_LENGTH} caracteres.`
  }
  if (payload.senha !== (typeof form?.confirmarSenha === 'string' ? form.confirmarSenha : '')) {
    errors.confirmarSenha = 'A confirmação de senha não confere.'
  }

  return { valid: Object.keys(errors).length === 0, errors, payload }
}

export function firstExternalRegistrationError(validation) {
  return Object.values(validation?.errors || {})[0] || ''
}

export async function registerExternalUser(authClient, form) {
  const validation = validateExternalRegistration(form)
  if (!validation.valid) {
    const error = new Error(firstExternalRegistrationError(validation))
    error.validation = validation
    throw error
  }

  return authClient.post('/auth/external/register', validation.payload)
}

export function externalRegistrationErrorMessage(error) {
  const status = error?.response?.status
  if (status === 400) return 'Os dados informados são inválidos. Confira os campos e tente novamente.'
  if (status === 403) return 'O cadastro externo não está disponível para esta unidade.'
  if (status === 409) return 'A matrícula ou o usuário já estão cadastrados nesta unidade.'
  if (status === 500) return 'Não foi possível concluir o cadastro. Tente novamente mais tarde.'
  if (error?.code === 'ERR_NETWORK' || error?.message === 'Network Error') {
    return 'O serviço de autenticação está temporariamente indisponível.'
  }
  return error?.response?.data?.message || 'Não foi possível concluir o cadastro. Tente novamente.'
}
