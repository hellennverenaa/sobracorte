import jsonwebtoken from 'jsonwebtoken';
import type { DecodedToken } from '../types/express';

export function verifyAccessToken(token: string, secret: string): DecodedToken {
  if (!secret?.trim()) {
    throw new Error('Configuração de autenticação indisponível');
  }
  // A verificação criptográfica é obrigatória, independentemente do ambiente.
  const payload = jsonwebtoken.verify(token, secret);
  if (typeof payload !== 'object' || payload === null ||
      typeof payload.usuario !== 'string' || !payload.usuario.trim()) {
    throw new jsonwebtoken.JsonWebTokenError('Token sem identificação de usuário.');
  }
  if (typeof payload.exp !== 'number' || !Number.isFinite(payload.exp)) {
    throw new jsonwebtoken.JsonWebTokenError('Token sem expiração válida.');
  }
  // Matrícula é textual no provedor externo; tokens legados numéricos seguem válidos.
  if (payload.matricula !== undefined && payload.matricula !== null &&
      !((typeof payload.matricula === 'string' && /^\d+$/.test(payload.matricula.trim())) ||
        (typeof payload.matricula === 'number' && Number.isSafeInteger(payload.matricula) && payload.matricula > 0))) {
    throw new jsonwebtoken.JsonWebTokenError('Token com matrícula inválida.');
  }
  if (payload.unidade !== undefined &&
      (typeof payload.unidade !== 'string' || !payload.unidade.trim())) {
    throw new jsonwebtoken.JsonWebTokenError('Token com unidade inválida.');
  }
  for (const key of ['origem', 'authOrigin'] as const) {
    if (payload[key] !== undefined && (typeof payload[key] !== 'string' || !payload[key].trim())) {
      throw new jsonwebtoken.JsonWebTokenError('Token com origem inválida.');
    }
  }
  for (const key of ['id', 'authUserId'] as const) {
    if (payload[key] !== undefined &&
      !((typeof payload[key] === 'string' && payload[key].trim()) ||
        (typeof payload[key] === 'number' && Number.isSafeInteger(payload[key])))) {
    throw new jsonwebtoken.JsonWebTokenError('Token com identificador do provedor inválido.');
    }
  }
  return payload as unknown as DecodedToken;
}
