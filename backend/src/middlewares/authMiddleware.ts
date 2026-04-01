import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma';

// 1. O PORTEIRO: Verifica se a pessoa tem a pulseira VIP (Token da DASS) e quem ela é
export const checkAuth = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  const token = authHeader.split(' ')[1];

  try {
    // Descriptografa o token da DASS para achar a matrícula do funcionário
    const payloadBase64 = token.split('.')[1];
    const payloadJson = Buffer.from(payloadBase64, 'base64').toString('utf-8');
    const apiUser = JSON.parse(payloadJson);

    // 🚀 A MÁGICA DO DBA: Vai no nosso PostgreSQL e puxa o nível de acesso real (role)
    const dbUser = await prisma.user.findUnique({
      where: { usuario: apiUser.usuario }
    });

    if (!dbUser) {
      return res.status(401).json({ error: 'Usuário não encontrado no banco local' });
    }

    // Pendura os dados do usuário na requisição para o Node.js lembrar quem é
    (req as any).user = dbUser;
    
    next(); // Pode entrar!
  } catch (error) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
};

// 2. O LEÃO DE CHÁCARA: Verifica se a pessoa tem permissão para aquela ação específica
export const requireRole = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const userRole = (req as any).user?.role;

    // Se for Admin (Hellen, Paulo, Hendrius, Midian), passa direto, tem poder absoluto
    if (userRole === 'admin') {
      return next();
    }

    // Se o cargo da pessoa não estiver na lista de permitidos, toma bloqueio 403
    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({ error: 'Acesso negado: Seu nível não permite esta ação.' });
    }

    next(); // Tudo certo, pode executar a função!
  };
};