import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma';
import { vars } from "../config/dotenv"
import { verifyAccessToken } from '../auth/verifyToken';

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  let token = req.cookies.token;

  if (!token && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      token = parts[1];
    }
  }

  if (!token) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  if (!vars.PRIVATE_KEY) {
    return res.status(500).json({ error: 'Configuração de autenticação indisponível' });
  }

  try {
    req.user = verifyAccessToken(token, vars.PRIVATE_KEY);
    next();
  } catch (error) {
      if (error instanceof Error && error.name === "TokenExpiredError") {
        return res.status(401).json({ message: "Token expirado", expired: true });
      }
      return res.status(401).json({
        message: "Acesso negado! Você não tem permissões para acessar essa funcionalidade!",
      });
  }
}

export const requireRole = (allowedRoles: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const apiUser = req.user;

    if (!apiUser || !apiUser.usuario) {
      return res.status(401).json({ error: 'Usuário não identificado no token' });
    }

    try {
      const user = await prisma.user.findUnique({
        where: { usuario: String(apiUser.usuario).toUpperCase().trim() }
      });

      const userRole = user?.role;

      if (userRole === 'admin') {
        req.user = { ...apiUser, role: userRole };
        return next();
      }

      if (!userRole || !allowedRoles.includes(userRole)) {
        return res.status(403).json({ error: 'Acesso negado: Seu nível não permite esta ação.' });
      }

      req.user = { ...apiUser, role: user.role };
      next();

    } catch (error) {
      console.error("Erro no roleMiddleware:", error);
      return res.status(500).json({ error: 'Erro interno ao validar permissões' });
    }
  };
};
