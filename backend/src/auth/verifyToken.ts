import jsonwebtoken from 'jsonwebtoken';
import type { DecodedToken } from '../types/express';
import { vars } from '../config/dotenv';

export function verifyAccessToken(token: string, secret: string): DecodedToken {
  let decodedPayload: any;

  try {
    // 1. Em Produção e Dev: Tenta sempre validar a assinatura criptográfica oficial
    decodedPayload = jsonwebtoken.verify(token, secret);
  } catch (err: any) {
    // 2. Trava de Segurança: O fallback SÓ é permitido em ambiente de desenvolvimento local
    const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

    if (isDevelopment && err.name === 'JsonWebTokenError') {
      console.warn('⚠️ [DEV WARNING] Assinatura JWT ignorada em ambiente de desenvolvimento local.');
      decodedPayload = jsonwebtoken.decode(token);
    } else {
      // Em produção (ou se o token estiver realmente expirado), lança o erro e bloqueia o acesso
      throw err;
    }
  }

  // 3. Validação rigorosa dos campos obrigatórios do token
  if (!decodedPayload || typeof decodedPayload === 'string' || !decodedPayload.usuario) {
    throw new jsonwebtoken.JsonWebTokenError('Token sem identificação de usuário.');
  }

  return decodedPayload as DecodedToken;
}