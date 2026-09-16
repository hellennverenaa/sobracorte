import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma';
import { vars } from "../config/dotenv"
import { verifyAccessToken } from '../auth/verifyToken';
import { requireActiveTenant, resolveTenantRequest, TenantAuthorizationError, normalizeRegistration, registrationToBigInt } from '../auth/tenant';
import { tenantStorage } from '../context/tenantContext';
import { EffectiveContext } from '../types/express';

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  // O Bearer explícito representa a sessão renovada. Nunca recorrer ao cookie
  // quando esse cabeçalho estiver presente, mesmo se ele for inválido.
  const authorization = req.headers.authorization;
  const token = authorization !== undefined
    ? /^Bearer ([^\s]+)$/i.exec(authorization)?.[1]
    : req.cookies?.token;

  if (!token) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  if (!vars.PRIVATE_KEY) {
    return res.status(500).json({ error: 'Configuração de autenticação indisponível' });
  }

  try {
    const user = verifyAccessToken(token, vars.PRIVATE_KEY);
    const { requestedUnit, isGlobalAdmin } = resolveTenantRequest(
      user,
      req.get('X-Dass-Unit'),
      vars.GLOBAL_ADMIN_IDENTITIES,
    );

    // `prisma.factoryUnit` é um modelo GLOBAL — o interceptor de tenant é
    // ignorado para ele, portanto esta query é segura fora do contexto.
    const tenant = await requireActiveTenant(requestedUnit, (code) => prisma.factoryUnit.findFirst({
        where: { code, active: true },
        select: { id: true, code: true, name: true, enableRequisitions: true },
      }));

    // Busca o usuário no banco de dados na unidade ativa para estabelecer o contexto efetivo em tempo real
    const usuario = String(user.usuario || '').toUpperCase().trim();
    const authOrigin = String(user.origem || user.authOrigin || 'LEGADO').trim().toUpperCase();
    const authUserId = String(user.authUserId ?? user.id ?? usuario).trim();
    // This lookup deliberately runs with the same tenant guard used by the
    // request. Provider claims never grant a local role or sector.
    const nativeUnit = String(user.unidade || '').trim().toUpperCase();
    const nativeFactory = await prisma.factoryUnit.findFirst({ where: { code: nativeUnit, active: true }, select: { id: true } });
    const identity = authOrigin && authUserId && nativeFactory
      ? await prisma.authIdentity.findUnique({ where: { nativeUnitId_authOrigin_authUserId: { nativeUnitId: nativeFactory.id, authOrigin, authUserId } } })
      : null;
    const binding = identity
      ? await tenantStorage.run({ tenantId: tenant.id }, () => prisma.userRoleBinding.findUnique({ where: { identityId_factoryUnitId: { identityId: identity.id, factoryUnitId: tenant.id } } }))
      : null;

    const effectiveRole = isGlobalAdmin ? 'admin' : (binding?.role || 'leitor');
    const assignedSector = isGlobalAdmin ? null : (binding?.assignedSector || null);

    const effectiveContext: EffectiveContext = {
      userId: identity?.id || 0,
      identityId: identity?.id || 0,
      bindingId: binding?.id || null,
      factoryUnitId: tenant.id,
      effectiveRole,
      assignedSector,
      isGlobalAdmin,
      usuario,
      matriculaDass: identity?.matriculaDass ? Number(identity.matriculaDass) : (() => {
        const registration = registrationToBigInt(normalizeRegistration(user.matricula));
        return registration === null ? null : Number(registration);
      })(),
      nome: identity?.nome || user.nome || usuario,
    };

    req.user = {
      ...user,
      role: effectiveRole,
      assignedSector,
    };
    req.tenant = tenant;
    req.isGlobalAdmin = isGlobalAdmin;
    req.effectiveContext = effectiveContext;

    // ── Ativa o contexto de tenant para toda a cadeia de execução downstream.
    // A partir daqui, toda query do Prisma em modelos multi-tenant terá
    // `factoryUnitId` injetado automaticamente pelo $extends em prisma.ts.
    tenantStorage.run({ tenantId: tenant.id }, () => next());
  } catch (error) {
      if (error instanceof TenantAuthorizationError) {
        return res.status(error.status).json({ error: error.message });
      }
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
    const effective = req.effectiveContext;

    if (!effective || !effective.usuario) {
      return res.status(401).json({
        message: "Acesso negado! Usuário não autenticado!",
      });
    }

    if (effective.isGlobalAdmin || effective.effectiveRole === 'admin') {
      return next();
    }

    if (!allowedRoles.includes(effective.effectiveRole)) {
      return res.status(403).json({
        message: "Acesso negado! Seu perfil de acesso não permite realizar esta operação.",
      });
    }

    next();
  };
};

/**
 * Middleware para validar se o setor da operação corresponde ao assignedSector do usuário
 */
export const requireSectorMatch = (getSector: (req: Request) => string | undefined) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const effective = req.effectiveContext;
    if (effective?.isGlobalAdmin || effective?.effectiveRole === 'admin') {
      return next();
    }

    const targetSector = getSector(req);
    const userAssignedSector = effective?.assignedSector;

    if (userAssignedSector && targetSector) {
      let normalizedTarget = targetSector.toUpperCase().trim();
      let normalizedUser = userAssignedSector.toUpperCase().trim();
      if (normalizedTarget === 'CABEDAIS' || normalizedTarget === 'EXPEDICAO') normalizedTarget = 'DISTRIBUICAO';
      if (normalizedUser === 'CABEDAIS' || normalizedUser === 'EXPEDICAO') normalizedUser = 'DISTRIBUICAO';

      if (normalizedTarget !== normalizedUser) {
        return res.status(403).json({
          error: `Acesso negado: Seu perfil tem permissão de operação apenas no setor ${userAssignedSector}.`,
        });
      }
    }

    next();
  };
};

/**
 * Middleware para validar se o módulo de Requisições está ativo na unidade atual
 */
export const requireRequisitionsEnabled = (req: Request, res: Response, next: NextFunction) => {
  if (!req.tenant) {
    return res.status(401).json({ error: 'Unidade fabril não identificada.' });
  }

  if (req.tenant.enableRequisitions === false) {
    return res.status(403).json({ error: 'Módulo de Requisições desativado nesta unidade.' });
  }

  next();
};
