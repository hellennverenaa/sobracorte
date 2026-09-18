import { Request, Response } from 'express';
import { deriveInitialRole } from '../auth/roles';
import { prisma } from '../prisma';
import { normalizeRegistration, registrationToBigInt } from '../auth/tenant';

type AuthenticatedUser = NonNullable<Express.Request['user']>;

export class LegacyIdentityConflictError extends Error {
  constructor() {
    super('Identidade legada ambígua. Solicite a revisão do vínculo de acesso ao administrador.');
  }
}

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
  const existingIdentity = await client.authIdentity.findUnique({
    where: { nativeUnitId_authOrigin_authUserId: identityKey },
  });
  const existingBinding = !isGlobalAdmin && existingIdentity
    ? await client.userRoleBinding.findUnique({
        where: { identityId_factoryUnitId: { identityId: existingIdentity.id, factoryUnitId: nativeUnitId } },
      })
    : null;

  // Outra origem nunca usa matrícula ou usuário para herdar RBAC legado.
  // Administradores globais não criam vínculo na unidade visitada. Evite
  // consultar usuários legados da unidade nativa sob o tenant ativo, pois
  // essa consulta cruzada é bloqueada pelo TenantGuard.
  // Transitório até identity:audit aprovar o banco real: vínculos existentes
  // nunca dependem de User nem herdam alterações posteriores do legado.
  const legacyCandidates = !existingBinding && !isGlobalAdmin && authOrigin === 'LEGADO' ? await client.user.findMany({
    where: {
      factoryUnitId: nativeUnitId,
      AND: [
        { OR: [{ authOrigin: null }, { authOrigin: '' }, { authOrigin: 'LEGADO' }] },
        { OR: [
          { authUserId },
          { AND: [
            { OR: [{ authUserId: null }, { authUserId: '' }] },
            { OR: [
              ...(commonData.matriculaDass ? [{ matriculaDass: commonData.matriculaDass }] : []),
              { usuario },
            ] },
          ] },
        ] },
      ],
    },
    take: 2,
  }) : [];
  if (legacyCandidates.length > 1) throw new LegacyIdentityConflictError();

  // The identity/RBAC migration predates the stable numeric ID emitted by the
  // legacy auth service. It therefore used the login as authUserId. On the
  // first login after that migration, adopt the signed provider ID instead of
  // creating a second identity and binding for the same person.
  if (!existingBinding && authOrigin === 'LEGADO' && legacyCandidates.length === 1) {
    const legacyUser = legacyCandidates[0];
    const migratedOrigin = String(legacyUser.authOrigin || 'LEGADO').trim().toUpperCase();
    const migratedUserId = String(legacyUser.authUserId || legacyUser.usuario).trim();
    const migratedIdentity = await client.authIdentity.findUnique({
      where: {
        nativeUnitId_authOrigin_authUserId: {
          nativeUnitId,
          authOrigin: migratedOrigin,
          authUserId: migratedUserId,
        },
      },
    });
    const migratedBinding = migratedIdentity ? await client.userRoleBinding.findUnique({
      where: { identityId_factoryUnitId: { identityId: migratedIdentity.id, factoryUnitId: nativeUnitId } },
    }) : null;

    if (migratedIdentity && migratedBinding) {
      const runTransaction = typeof client.$transaction === 'function'
        ? (operation: (tx: any) => Promise<any>) => client.$transaction(operation)
        : (operation: (tx: any) => Promise<any>) => operation(client);
      return runTransaction(async (tx: any) => {
        const identity = existingIdentity
          ? await tx.authIdentity.update({
              where: { id: existingIdentity.id },
              data: { usuario, ...commonData },
            })
          : await tx.authIdentity.update({
              where: { id: migratedIdentity.id },
              data: { authOrigin, authUserId, usuario, ...commonData },
            });
        const binding = existingIdentity
          ? await tx.userRoleBinding.update({
              where: { id_factoryUnitId: { id: migratedBinding.id, factoryUnitId: nativeUnitId } },
              data: { identityId: existingIdentity.id },
            })
          : migratedBinding;
        await tx.user.update({
          where: { id_factoryUnitId: { id: legacyUser.id, factoryUnitId: nativeUnitId } },
          data: { authOrigin, authUserId },
        });
        return { identity, binding };
      });
    }
  }

  // O update vazio preserva permissões, mas pode fazer Prisma emular o
  // upsert. Um conflito concorrente só é aceito recarregando a mesma chave.
  const identity = await client.authIdentity.upsert({
    where: { nativeUnitId_authOrigin_authUserId: identityKey },
    update: { usuario, ...commonData },
    create: { ...identityKey, usuario, ...commonData },
  });
  const bindingKey = { identityId_factoryUnitId: { identityId: identity.id, factoryUnitId: nativeUnitId } };
  const binding = isGlobalAdmin ? null : await client.userRoleBinding.upsert({
    where: bindingKey,
    update: {},
    create: {
      identityId: identity.id,
      factoryUnitId: nativeUnitId,
      role: legacyCandidates.length === 1
        ? legacyCandidates[0].role
        : deriveInitialRole({ usuario, funcao: user.funcao }),
      assignedSector: legacyCandidates.length === 1 ? legacyCandidates[0].assignedSector : null,
    },
  }).catch(async (error: { code?: string }) => {
    if (error.code !== 'P2002') throw error;
    const concurrentBinding = await client.userRoleBinding.findUnique({ where: bindingKey });
    if (!concurrentBinding) throw error;
    return concurrentBinding;
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
      const accessStatus = req.isGlobalAdmin || effectiveUser.role === 'admin' || effectiveUser.assignedSector
        ? 'active'
        : 'pending_sector_assignment';
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
        accessStatus,
      });
    } catch (error) {
      if (error instanceof LegacyIdentityConflictError) return res.status(409).json({ error: error.message });
      console.error('Erro ao sincronizar usuário autenticado.', error);
      return res.status(500).json({ error: 'Erro interno ao processar usuário.' });
    }
  }

  async login(_req: Request, res: Response) {
    return res.status(403).json({ error: 'Login local desabilitado. Autentique-se pelo serviço oficial de autenticação.' });
  }
}
