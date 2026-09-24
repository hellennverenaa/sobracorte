export function decodeJwtPayload(token) {
  const payload = token.split('.')[1]?.replace(/-/g, '+').replace(/_/g, '/')
  if (!payload) throw new Error('Token inválido recebido do serviço de autenticação.')
  const bytes = Uint8Array.from(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '=')), char => char.charCodeAt(0))
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
}
