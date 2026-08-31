import { Request, Response, NextFunction } from 'express';
import { prisma } from '../prisma';
import jwt from 'jsonwebtoken';
import { vars } from "../config/dotenv"
import { verifyAccessToken } from '../auth/verifyToken';
import { requireActiveTenant, resolveTenantRequestWithAdminCheck, TenantAuthorizationError } from '../auth/tenant';
import { tenantStorage } from '../context/tenantContext';

export const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
  let token = req.cookies.token;

  if (!token && req.headers.authorization) {
    const parts = req.headers.authorization.split(' ');
    if (parts.length === 2 && parts[0] === 'Bearer') {
      token = parts[1];
    }
  }

  if (!token) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  if (!vars.PRIVATE_KEY) {
    return res.status(500).json({ error: 'Configuração de autenticação indisponível' });
  }

  try {
    const decodedComplete = jwt.decode(token, { complete: true });
    const user = verifyAccessToken(token, vars.PRIVATE_KEY);
    const { requestedUnit, isGlobalAdmin } = await resolveTenantRequestWithAdminCheck(
      user,
      req.get('X-Dass-Unit'),
      vars.GLOBAL_ADMIN_REGISTRATIONS,
      async (matricula, usuario) => {
        const adminUser = await prisma.user.findFirst({
          where: {
            OR: [
              { matriculaDass: BigInt(matricula) },
              { usuario: usuario }
            ],
            role: 'admin'
          }
        });
        return Boolean(adminUser);
      }
    );

    // `prisma.factoryUnit` é um modelo GLOBAL — o interceptor de tenant é
    // ignorado para ele, portanto esta query é segura fora do contexto.
    const tenant = await requireActiveTenant(requestedUnit, (code) => prisma.factoryUnit.findFirst({
        where: { code, active: true },
        select: { id: true, code: true, name: true },
      }));

    req.user = user;
    req.tenant = tenant;
    req.isGlobalAdmin = isGlobalAdmin;

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
    const apiUser = req.user;

    if (!apiUser || !apiUser.usuario) {
      return res.status(401).json({ error: 'Usuário não identificado no token' });
    }

    try {
      if (!req.tenant) return res.status(401).json({ error: 'Unidade não identificada.' });
      if (req.isGlobalAdmin) {
        req.user = { ...apiUser, role: 'admin' };
        return next();
      }
      const user = await prisma.user.findUnique({
        where: { factoryUnitId_usuario: {
          factoryUnitId: req.tenant.id,
          usuario: String(apiUser.usuario).toUpperCase().trim(),
        } }
      });

      const userRole = user?.role;

      if (userRole === 'admin') {
        req.user = { ...apiUser, role: userRole, assignedSector: user?.assignedSector || null };
        return next();
      }

      if (!userRole || !allowedRoles.includes(userRole)) {
        return res.status(403).json({ error: 'Acesso negado: Seu nível não permite esta ação.' });
      }

      req.user = { ...apiUser, role: user.role, assignedSector: user?.assignedSector || null };
      next();

    } catch (error) {
      console.error("Erro no roleMiddleware:", error);
      return res.status(500).json({ error: 'Erro interno ao validar permissões' });
    }
  };
};

/**
 * Middleware para validar se o usuário tem permissão para operar no setor específico (RBAC Setorial)
 */
export const requireSectorMatch = (getSector: (req: Request) => string | undefined) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.user?.role === 'admin' || req.isGlobalAdmin) {
      return next();
    }

    const targetSector = getSector(req);
    const userAssignedSector = req.user?.assignedSector;

    if (userAssignedSector && targetSector) {
      const normalizedTarget = targetSector.toUpperCase().trim();
      const normalizedUser = userAssignedSector.toUpperCase().trim();
      if (normalizedTarget !== normalizedUser) {
        return res.status(403).json({
          error: `Acesso negado: Seu perfil tem permissão de operação apenas no setor ${userAssignedSector}.`,
        });
      }
    }

    next();
  };
};
