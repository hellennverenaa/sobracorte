import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma';
import jsonwebtoken from "jsonwebtoken"

const PRIVATE_KEY = "chave-segredo" // TODO: Colocar segredo em .env

// TODO: fazer interceotir de  req. no frontend para chamar rota de refresh de token apos expiracao
export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const token = req.cookies.token; // Cookie de autenticacao vinda da api principal de autenticacao
  
  if (!token) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  jsonwebtoken.verify(token, PRIVATE_KEY, async (error: any, decoded: any) => {
    if (error) {
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

      console.log("User SObracorte");
      console.log(user);
      
      

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