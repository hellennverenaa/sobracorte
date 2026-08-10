import { Request, Response } from 'express';
import { deriveInitialRole } from '../auth/roles';
import { prisma } from '../prisma';

type AuthenticatedUser = NonNullable<Express.Request['user']>;

function serializeUser<T extends { matriculaDass: bigint | null }>(user: T) {
  return {
    ...user,
    matriculaDass: user.matriculaDass === null ? null : Number(user.matriculaDass),
  };
}

async function syncUser(user: AuthenticatedUser) {
  const usuario = String(user.usuario || '').toUpperCase().trim();
  if (!usuario) throw new Error('Token sem identificação de usuário.');

  const email = user.email || `${usuario.toLowerCase()}@grupodass.com.br`;
  const commonData = {
    nome: user.nome || usuario,
    email,
    setor: user.setor || 'NÃO DEFINIDO',
    funcao: user.funcao || 'NÃO DEFINIDO',
    matriculaDass: user.matricula ? BigInt(user.matricula) : null,
  };

  return prisma.user.upsert({
    where: { usuario },
    update: commonData,
    create: {
      usuario,
      ...commonData,
      role: deriveInitialRole({ usuario, funcao: user.funcao }),
    },
  });
}

export class AuthController {
  async checkUser(req: Request, res: Response) {
    if (!req.user) {
      return res.status(401).json({ error: 'Usuário não autenticado.' });
    }

    try {
      const user = await syncUser(req.user);
      return res.status(200).json({ message: 'Usuário sincronizado com sucesso.', user: serializeUser(user) });
    } catch (error) {
      console.error('Erro ao sincronizar usuário autenticado.');
      return res.status(500).json({ error: 'Erro interno ao processar usuário.' });
    }
  }
}
