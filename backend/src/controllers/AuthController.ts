import { Request, Response } from 'express';
import { deriveInitialRole } from '../auth/roles';
import { prisma } from '../prisma';
import { normalizeRegistration, registrationToBigInt } from '../auth/tenant';

type AuthenticatedUser = NonNullable<Express.Request['user']>;

function serializeUser<T extends { matriculaDass: bigint | null }>(user: T) {
  return {
    ...user,
    matriculaDass: user.matriculaDass === null ? null : Number(user.matriculaDass),
  };
}

export async function syncUser(user: AuthenticatedUser, factoryUnitId: number, client: any = prisma) {
  const usuario = String(user.usuario || '').toUpperCase().trim();
  if (!usuario) throw new Error('Token sem identificação de usuário.');

  const authOrigin = String(user.origem || user.authOrigin || 'LEGADO').trim().toUpperCase();
  const authUserId = String(user.authUserId ?? user.id ?? usuario).trim();
  if (!authOrigin || !authUserId) throw new Error('Token sem identidade estável.');

  const email = user.email || `${usuario.toLowerCase()}@grupodass.com.br`;
  const commonData = {
    nome: user.nome || usuario,
    email,
    setor: user.setor || 'NÃO DEFINIDO',
    funcao: user.funcao || 'NÃO DEFINIDO',
    matriculaDass: registrationToBigInt(normalizeRegistration(user.matricula)),
  };

  const identity = { factoryUnitId, authOrigin, authUserId };
  const stable = await client.user.findUnique?.({
    where: { factoryUnitId_authOrigin_authUserId: identity },
  });
  if (stable) {
    return client.user.update({ where: { id: stable.id }, data: { usuario, ...commonData } });
  }

  // Only bind an unclaimed/legacy profile in the same unit. A matching
  // registration in a different unit or from another external origin is not
  // an authorization signal.
  const legacyCandidates = await client.user.findMany?.({
    where: {
      factoryUnitId,
      OR: [
        { authOrigin: null },
        { authOrigin: 'LEGADO' },
      ],
      AND: [{ OR: [
        ...(commonData.matriculaDass ? [{ matriculaDass: commonData.matriculaDass }] : []),
        { usuario },
      ] }],
    },
    take: 2,
  });
  // Do not guess when historical records are ambiguous. A new identity is
  // safer than inheriting another user's local RBAC.
  if (legacyCandidates?.length === 1) {
    const legacy = legacyCandidates[0];
    return client.user.update({
      where: { id: legacy.id },
      data: { usuario, ...commonData, authOrigin, authUserId },
    });
  }

  return client.user.create({
    data: { usuario, ...commonData, authOrigin, authUserId, role: deriveInitialRole({ usuario, funcao: user.funcao }), factoryUnitId },
  });
}

export class AuthController {
  async checkUser(req: Request, res: Response) {
    if (!req.user || !req.tenant) {
      return res.status(401).json({ error: 'Usuário não autenticado.' });
    }

    try {
      const user = await syncUser(req.user, req.tenant.id);
      const effectiveUser = req.isGlobalAdmin ? { ...user, role: 'admin' } : user;

      return res.status(200).json({
        message: 'Usuário sincronizado com sucesso.',
        user: serializeUser(effectiveUser),
        unit: req.tenant,
        isGlobalAdmin: Boolean(req.isGlobalAdmin),
      });
    } catch (error) {
      console.error('Erro ao sincronizar usuário autenticado.', error);
      return res.status(500).json({ error: 'Erro interno ao processar usuário.' });
    }
  }

  async login(_req: Request, res: Response) {
    return res.status(403).json({
      error: 'Login local desabilitado. Autentique-se pelo serviço oficial de autenticação.',
    });
  }
}
