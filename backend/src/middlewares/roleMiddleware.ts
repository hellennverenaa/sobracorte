import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma';
import jsonwebtoken from "jsonwebtoken"
import { vars } from "../config/dotenv"

// TODO: fazer interceotir de  req. no frontend para chamar rota de refresh de token apos expiracao
export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  let token = req.cookies.token // Cookie de autenticacao vinda da api principal de autenticacao

  // 2. Tenta pegar do Header (Localhost)
  if (!token && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      token = parts[1];
    }
  }

  if (!token) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  jsonwebtoken.verify(token, vars.PRIVATE_KEY ?? "minha-chave", async (error: any, decoded: any) => {
    if (error) {
      // A IMUNIDADE LOCAL: Verifica se o pedido veio do seu notebook (localhost)
      const isLocal = req.headers.origin?.includes('localhost') || req.headers.host?.includes('localhost');

      // Se for no seu notebook, nós perdoamos o token expirado de 1 minuto do Hendrius!
      if (isLocal) {
        const decodedFallback = jsonwebtoken.decode(token);

        // A MÁGICA DO TYPESCRIPT: Comprova que não é string e força o cast
        if (decodedFallback && typeof decodedFallback === 'object') {
          req.user = decodedFallback as any;
          return next();
        }
      }

      // Se não for local (Produção), a trava age normalmente:
      if (error.name === "TokenExpiredError") {
        return res.status(401).json({ message: "Token expirado", expired: true });
      }
      return res.status(401).json({
        message: "Acesso negado! Você não tem permissões para acessar essa funcionalidade!",
      });
    }

    req.user = decoded;
    next();
  });
}

export const requireRole = (allowedRoles: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    // ==========================================
    // 1. O PORTEIRO (Lê o Token que o Vue mandou)
    // ==========================================
    let apiUser = req.user;

    if (!apiUser || !apiUser.usuario) {
      return res.status(401).json({ error: 'Usuário não identificado no token' });
    }

    // ==========================================
    // 2. O LEÃO DE CHÁCARA (Verifica o Banco)
    // ==========================================
    try {
      const user = await prisma.user.findUnique({
        where: { usuario: String(apiUser.usuario) }
      });

      const userRole = user?.role;

      // Se for admin, tem passe livre em tudo
      if (userRole === 'admin') {
        (req as any).user = user; // Injeta para uso no controller
        return next();
      }

      // Se não tiver na lista de permitidos, toma bloqueio
      if (!userRole || !allowedRoles.includes(userRole)) {
        return res.status(403).json({ error: 'Acesso negado: Seu nível não permite esta ação.' });
      }

      (req as any).user = user; // Injeta para uso no controller
      next(); // Tudo certo, pode entrar!

    } catch (error) {
      console.error("Erro no roleMiddleware:", error);
      return res.status(500).json({ error: 'Erro interno ao validar permissões' });
    }
  };
};