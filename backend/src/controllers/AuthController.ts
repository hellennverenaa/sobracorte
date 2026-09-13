import { Request, Response } from 'express';
import { INITIAL_USER_ROLE } from '../auth/roles';
import { normalizeRegistration, registrationToBigInt } from '../auth/tenant';
import { prisma } from '../prisma';

type AuthenticatedUser = NonNullable<Express.Request['user']>;

function serializeUser<T extends { matriculaDass: bigint | null }>(user: T) {
  return {
    ...user,
    matriculaDass: user.matriculaDass === null ? null : user.matriculaDass.toString(),
  };
}

export async function syncUser(user: AuthenticatedUser, factoryUnitId: number, client: any = prisma) {
  const usuario = String(user.usuario || '').toUpperCase().trim();
  if (!usuario) throw new Error('Token sem identificação de usuário.');

  const matricula = normalizeRegistration(user.matricula);
  const authOrigin = String(user.origem || 'LEGADO').toUpperCase();
  const authUserId = user.id == null ? null : String(user.id);
  const email = user.email || `${usuario.toLowerCase()}@grupodass.com.br`;
  const commonData = {
    nome: user.nome || usuario,
    email,
    setor: user.setor || 'NÃO DEFINIDO',
    funcao: user.funcao || 'NÃO DEFINIDO',
    matriculaDass: registrationToBigInt(matricula),
  };

  if (!authUserId || typeof client.user.findUnique !== 'function') {
    return client.user.upsert({ where: { factoryUnitId_usuario: { factoryUnitId, usuario } }, update: commonData, create: { usuario, ...commonData, role: INITIAL_USER_ROLE, factoryUnitId } });
  }
  const stable = await client.user.findUnique({ where: { factoryUnitId_authOrigin_authUserId: { factoryUnitId, authOrigin, authUserId } } });
  if (stable) return client.user.update({ where: { id: stable.id }, data: { ...commonData, usuario } });
  const legacy = await client.user.findFirst?.({ where: { factoryUnitId, authOrigin: null, OR: [{ matriculaDass: commonData.matriculaDass }, { usuario }] } });
  if (legacy) return client.user.update({ where: { id: legacy.id }, data: { ...commonData, usuario, authOrigin, authUserId } });
  return client.user.create({ data: { usuario, ...commonData, authOrigin, authUserId, role: INITIAL_USER_ROLE, factoryUnitId } });
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
}
