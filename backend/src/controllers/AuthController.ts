import { Request, Response } from 'express';
import { deriveInitialRole } from '../auth/roles';
import { prisma } from '../prisma';
import { normalizeRegistration, registrationToBigInt } from '../auth/tenant';

type AuthenticatedUser = NonNullable<Express.Request['user']>;

function serializeUser<T extends { matriculaDass: bigint | null }>(user: T) {
  return { ...user, matriculaDass: user.matriculaDass === null ? null : Number(user.matriculaDass) };
}

export async function syncUser(
  user: AuthenticatedUser,
  nativeUnitId: number,
  activeUnitId: number,
  isGlobalAdmin: boolean,
  client: any = prisma,
): Promise<any> {
  const usuario = String(user.usuario || '').toUpperCase().trim();
  if (!usuario) throw new Error('Token sem identificação de usuário.');

  const authOrigin = String(user.origem || user.authOrigin || 'LEGADO').trim().toUpperCase();
  const authUserId = String(user.authUserId ?? user.id ?? usuario).trim();
  if (!authOrigin || !authUserId) throw new Error('Token sem identidade estável.');
  if (!isGlobalAdmin && activeUnitId !== nativeUnitId) {
    throw new Error('Usuário comum só pode criar vínculo em sua unidade nativa.');
  }

  const commonData = {
    nome: user.nome || usuario,
    email: user.email || `${usuario.toLowerCase()}@grupodass.com.br`,
    setor: user.setor || 'NÃO DEFINIDO',
    funcao: user.funcao || 'NÃO DEFINIDO',
    matriculaDass: registrationToBigInt(normalizeRegistration(user.matricula)),
  };
  const identityKey = { nativeUnitId, authOrigin, authUserId };

  // Outra origem nunca usa matrícula ou usuário para herdar RBAC legado.
  const legacyCandidates = authOrigin === 'LEGADO' ? await client.user.findMany({
    where: {
      factoryUnitId: nativeUnitId,
      OR: [{ authOrigin: null }, { authOrigin: 'LEGADO' }],
      AND: [{ OR: [
        ...(commonData.matriculaDass ? [{ matriculaDass: commonData.matriculaDass }] : []),
        { usuario },
      ] }],
    },
    take: 2,
  }) : [];

  // Upserts tornam o bootstrap idempotente sob chamadas concorrentes. O
  // update vazio do vínculo preserva papel e setor atribuídos localmente.
  const identity = await client.authIdentity.upsert({
    where: { nativeUnitId_authOrigin_authUserId: identityKey },
    update: { usuario, ...commonData },
    create: { ...identityKey, usuario, ...commonData },
  });
  const binding = isGlobalAdmin ? null : await client.userRoleBinding.upsert({
    where: { identityId_factoryUnitId: { identityId: identity.id, factoryUnitId: nativeUnitId } },
    update: {},
    create: {
      identityId: identity.id,
      factoryUnitId: nativeUnitId,
      role: legacyCandidates.length === 1
        ? legacyCandidates[0].role
        : deriveInitialRole({ usuario, funcao: user.funcao }),
      assignedSector: legacyCandidates.length === 1 ? legacyCandidates[0].assignedSector : null,
    },
  });
  return { identity, binding };
}

export class AuthController {
  async checkUser(req: Request, res: Response) {
    if (!req.user || !req.tenant) return res.status(401).json({ error: 'Usuário não autenticado.' });

    try {
      const nativeCode = String(req.user.unidade || '').trim().toUpperCase();
      const nativeUnit = await prisma.factoryUnit.findFirst({
        where: { code: nativeCode, active: true },
        select: { id: true, code: true, name: true },
      });
      if (!nativeUnit) return res.status(403).json({ error: 'Unidade nativa inexistente ou inativa.' });

      const result = await syncUser(req.user, nativeUnit.id, req.tenant.id, Boolean(req.isGlobalAdmin));
      const effectiveUser = {
        ...result.identity,
        role: req.isGlobalAdmin ? 'admin' : (result.binding?.role || 'leitor'),
        assignedSector: result.binding?.assignedSector || null,
      };
      const effectiveContext = {
        userId: result.identity.id,
        identityId: result.identity.id,
        bindingId: result.binding?.id || null,
        factoryUnitId: req.tenant.id,
        effectiveRole: effectiveUser.role,
        assignedSector: effectiveUser.assignedSector,
        isGlobalAdmin: Boolean(req.isGlobalAdmin),
        usuario: result.identity.usuario,
        matriculaDass: result.identity.matriculaDass === null ? null : Number(result.identity.matriculaDass),
        nome: result.identity.nome,
      };

      return res.status(200).json({
        message: 'Usuário sincronizado com sucesso.',
        user: serializeUser(effectiveUser),
        identity: serializeUser(result.identity),
        binding: result.binding,
        effectiveContext,
        nativeUnit,
        unit: req.tenant,
        isGlobalAdmin: Boolean(req.isGlobalAdmin),
      });
    } catch (error) {
      console.error('Erro ao sincronizar usuário autenticado.', error);
      return res.status(500).json({ error: 'Erro interno ao processar usuário.' });
    }
  }

  async login(_req: Request, res: Response) {
    return res.status(403).json({ error: 'Login local desabilitado. Autentique-se pelo serviço oficial de autenticação.' });
  }
}
