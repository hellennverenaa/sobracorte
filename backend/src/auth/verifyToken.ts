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
  // Matrícula é opcional: o fluxo vigente também identifica admins pelo usuário.
  if (payload.matricula !== undefined && payload.matricula !== null &&
      !((typeof payload.matricula === 'string' && /^\d+$/.test(payload.matricula)) ||
        typeof payload.matricula === 'number')) {
    throw new jsonwebtoken.JsonWebTokenError('Token com matrícula inválida.');
  }
  if (payload.matricula !== undefined && payload.matricula !== null &&
      (!Number.isSafeInteger(Number(payload.matricula)) || Number(payload.matricula) <= 0)) {
    throw new jsonwebtoken.JsonWebTokenError('Token com matrícula inválida.');
  }
  if (payload.unidade !== undefined &&
      (typeof payload.unidade !== 'string' || !payload.unidade.trim())) {
    throw new jsonwebtoken.JsonWebTokenError('Token com unidade inválida.');
  }
  return payload as unknown as DecodedToken;
}
