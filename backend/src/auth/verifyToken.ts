import jsonwebtoken from 'jsonwebtoken';
import type { DecodedToken } from '../types/express';

export function verifyAccessToken(token: string, secret: string): DecodedToken {
  const decoded = jsonwebtoken.verify(token, secret);
  if (!decoded || typeof decoded === 'string' || !decoded.usuario) {
    throw new jsonwebtoken.JsonWebTokenError('Token sem identificação de usuário.');
  }
  return decoded as DecodedToken;
}
