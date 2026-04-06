import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma';

export const requireRole = (allowedRoles: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const loggedUser = req.user;

    const user = await prisma.user.findFirst({
      where: {
        matricula: Number(loggedUser?.matricula) 
      }
    })

    const userRole = user?.role;

    // Se for Admin (Hellen, Paulo, Hendrius, Midian), passa direto, tem poder absoluto
    if (userRole === 'admin') {
      return next();
    }

    // Se o cargo da pessoa não estiver na lista de permitidos, toma bloqueio 403
    if (!userRole || !allowedRoles.includes(userRole)) {
      return res.status(403).json({ error: 'Acesso negado: Seu nível não permite esta ação.' });
    }

    next(); // Tudo certo, pode executar a função!
  };
};