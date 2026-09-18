import { StockAccessError } from './auth/stockAccess';
import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import { AuthController } from './controllers/AuthController';
import { ReportController } from './controllers/ReportController';
import { SettingsController } from './controllers/SettingsController';
import { ImportController } from './controllers/ImportController';
import { DashboardController } from './controllers/DashboardController';
import { StockItemController } from './controllers/StockItemController';
import { MountingPairController } from './controllers/MountingPairController';
import { StockMovementController } from './controllers/StockMovementController';
import { RequisitionController } from './controllers/RequisitionController';
import { prisma } from './prisma';
import { requireRole, requireAuth, requireSectorMatch, requireRequisitionsEnabled } from './middlewares/roleMiddleware';
import { isUserRole } from './auth/roles';
import { normalizeSector } from './utils/sectorHelper';
import {
  userService,
  UserNotFoundError,
  UserConcurrencyConflictError,
  UnauthorizedRoleAssignmentError,
} from './services/UserService';

const routes = Router();

export const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: 'Muitas requisições. Tente novamente em alguns minutos.' },
});

// O catálogo não deve consumir o orçamento de tentativas de login.
const unitCatalogLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: 'Muitas requisições. Tente novamente em alguns minutos.' },
});

export const authenticatedLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1200,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => `${req.tenant?.id || 'public'}:${String(req.user?.usuario || 'anon').toUpperCase()}`,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: 'Limite de requisições atingido. Tente novamente em alguns minutos.' },
});

export const mutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => `${req.tenant?.id || 'public'}:${String(req.user?.usuario || 'anon').toUpperCase()}`,
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: 'Limite de alterações atingido. Tente novamente em alguns minutos.' },
});

// A sincronização da sessão ocorre no login, na restauração/renovação do
// token e na troca de unidade. Ela grava a identidade local, mas não deve
// consumir o orçamento das mutações de estoque e configurações.
export const checkUserLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => {
    const identityId = req.effectiveContext?.identityId;
    if (identityId) return `identity:${identityId}`;
    const origin = String(req.user?.origem || req.user?.authOrigin || 'LEGADO').toUpperCase();
    const authUserId = String(req.user?.authUserId ?? req.user?.id ?? req.user?.usuario ?? 'anon').toUpperCase();
    return `provider:${origin}:${authUserId}`;
  },
  skip: () => process.env.NODE_ENV === 'test',
  message: { error: 'Limite de sincronizações atingido. Tente novamente em alguns minutos.' },
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

const reportController = new ReportController();
const authController = new AuthController();
const settingsController = new SettingsController();
const importController = new ImportController();
const dashboardController = new DashboardController();
const stockItemController = new StockItemController();
const mountingPairController = new MountingPairController();
const stockMovementController = new StockMovementController();
const requisitionController = new RequisitionController();

routes.get('/health', (_req, res) => res.json({ status: 'ok' }));
routes.get('/auth/health', (_req, res) => res.json({ status: 'ok' }));
routes.get('/factory-units', unitCatalogLimiter, async (_req, res) => {
  try {
    const units = await prisma.factoryUnit.findMany({
      where: { active: true },
      orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true, active: true, enableRequisitions: true },
    });
    return res.json({ data: units });
  } catch {
    return res.status(500).json({ error: 'Erro ao carregar unidades.' });
  }
});

// Configurações da Unidade Fabril Atual
routes.get('/factory-unit/current', requireAuth, authenticatedLimiter, async (req, res) => {
  try {
    const unit = await prisma.factoryUnit.findUnique({
      where: { id: req.tenant!.id },
      select: { id: true, code: true, name: true, active: true, enableRequisitions: true },
    });
    if (!unit) return res.status(404).json({ error: 'Unidade fabril não encontrada.' });
    return res.json({ data: unit });
  } catch (err) {
    console.error('Erro ao buscar unidade atual:', err);
    return res.status(500).json({ error: 'Erro ao buscar dados da unidade fabril.' });
  }
});

routes.patch('/factory-unit/current/settings', requireAuth, mutationLimiter, requireRole(['admin']), async (req, res) => {
  try {
    const { enableRequisitions } = req.body;
    if (typeof enableRequisitions !== 'boolean') {
      return res.status(400).json({ error: 'Parâmetro enableRequisitions inválido (deve ser booleano).' });
    }
    const updated = await prisma.factoryUnit.update({
      where: { id: req.tenant!.id },
      data: { enableRequisitions },
      select: { id: true, code: true, name: true, active: true, enableRequisitions: true },
    });
    return res.json({ message: 'Configurações da unidade atualizadas com sucesso.', data: updated });
  } catch (err) {
    console.error('Erro ao atualizar configurações da unidade:', err);
    return res.status(500).json({ error: 'Erro ao atualizar configurações da unidade fabril.' });
  }
});

// Rota legada desabilitada: credenciais são emitidas somente pelo provedor oficial.
routes.post('/auth/login', publicLimiter, authController.login);
routes.post('/auth/check-user', requireAuth, checkUserLimiter, authController.checkUser);

// 📦 ROTAS MULTI-SETOR (5 SETORES - ROUND-TRIP ÚNICO & CHÃO DE FÁBRICA)
routes.post('/inventory/batch', requireAuth, mutationLimiter, requireRole(['admin_setor', 'lider']), requireSectorMatch((req: any) => req.body?.sector || (Array.isArray(req.body?.items) ? req.body.items[0]?.sector : undefined)), stockItemController.createBatch);
routes.get('/inventory/search', requireAuth, authenticatedLimiter, stockItemController.search);
routes.get('/inventory/search-suggestions', requireAuth, authenticatedLimiter, stockItemController.suggestions);
routes.get('/inventory/combinations', requireAuth, authenticatedLimiter, stockItemController.combinations);
routes.delete('/inventory/stock-items/:id', requireAuth, mutationLimiter, requireRole(['admin_setor']), stockItemController.delete);

// 👞 CASAMENTO DE PARES NA MONTAGEM
routes.get('/inventory/mounting/matching-pairs', requireAuth, authenticatedLimiter, mountingPairController.getMatchingPairs);
routes.post('/inventory/mounting/execute-match', requireAuth, mutationLimiter, requireRole(['admin_setor', 'lider', 'movimentador']), requireSectorMatch((req: any) => req.body?.sector || 'MONTAGEM'), mountingPairController.executeMatch);

// 🔄 MOVIMENTAÇÕES & HISTÓRICO DE AUDITORIA MULTI-SETOR
routes.post('/inventory/movements', requireAuth, mutationLimiter, requireRole(['admin_setor', 'lider', 'movimentador']), requireSectorMatch((req: any) => req.body?.sector), stockMovementController.create);
routes.get('/inventory/movements/history', requireAuth, authenticatedLimiter, stockMovementController.history);

// 📋 MÓDULO DIGITAL DE REQUISIÇÕES & SOLICITAÇÕES DE REPOSIÇÃO
routes.post('/requisitions', requireAuth, mutationLimiter, requireRequisitionsEnabled, requisitionController.create);
routes.post('/requisitions/check-availability', requireAuth, mutationLimiter, requireRequisitionsEnabled, requisitionController.checkAvailability);
routes.get('/requisitions', requireAuth, authenticatedLimiter, requireRequisitionsEnabled, requisitionController.index);
routes.get('/requisitions/pending-count', requireAuth, authenticatedLimiter, requireRequisitionsEnabled, requisitionController.pendingCount);
routes.post('/requisitions/:id/fulfill', requireAuth, mutationLimiter, requireRequisitionsEnabled, requireRole(['admin', 'admin_setor']), requisitionController.fulfill);
routes.patch('/requisitions/:id/cancel', requireAuth, mutationLimiter, requireRequisitionsEnabled, requisitionController.cancel);

// 📊 DASHBOARD & INDICADORES ANALÍTICOS CONSOLIDADOS (SINGLE ROUND-TRIP)
routes.get('/dashboard/summary', requireAuth, authenticatedLimiter, dashboardController.getSummary);
routes.get('/reports/inventory', requireAuth, authenticatedLimiter, requireRole(['admin_setor', 'lider']), reportController.inventory);
routes.get('/reports/inventory/export', requireAuth, authenticatedLimiter, requireRole(['admin_setor', 'lider']), reportController.exportInventory);
routes.get('/reports/movements', requireAuth, authenticatedLimiter, requireRole(['admin_setor', 'lider']), reportController.movements);
routes.get('/reports/movements/export', requireAuth, authenticatedLimiter, requireRole(['admin_setor', 'lider']), reportController.exportMovements);
routes.get('/reports/requisitions', requireAuth, authenticatedLimiter, requireRole(['admin_setor', 'lider']), reportController.requisitions);
routes.get('/reports/requisitions/export', requireAuth, authenticatedLimiter, requireRole(['admin_setor', 'lider']), reportController.exportRequisitions);

routes.get('/users', requireAuth, authenticatedLimiter, requireRole(['admin']), async (req, res) => {
  try {
    const users = await prisma.userRoleBinding.findMany({
      where: { factoryUnitId: req.tenant!.id },
      include: { identity: true },
      orderBy: { identity: { nome: 'asc' } },
    });

    const safeUsers = users.map(({ identity, ...binding }) => ({
      ...identity,
      ...binding,
      identityId: identity.id,
      id: binding.id,
      matriculaDass: identity.matriculaDass ? Number(identity.matriculaDass) : null,
      assignedSector: binding.assignedSector || null,
    }));

    res.json(safeUsers);
  } catch (error) {
    console.error("Erro ao buscar usuários:", error);
    res.status(500).json({ error: 'Erro interno ao buscar usuários' });
  }
});

routes.get('/users/audit', requireAuth, authenticatedLimiter, requireRole(['admin']), async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const logs = await userService.getRoleAuditHistory(prisma, req.tenant!.id, limit);
    return res.json(logs);
  } catch (error) {
    console.error("Erro ao buscar auditoria de usuários:", error);
    return res.status(500).json({ error: 'Erro interno ao buscar histórico de auditoria.' });
  }
});

routes.put('/users/:id', requireAuth, mutationLimiter, requireRole(['admin']), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { role, assignedSector, expectedRole } = req.body;

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Usuário inválido.' });
    }
    if (!role || !isUserRole(role)) {
      return res.status(400).json({ error: 'Nível de acesso inválido.' });
    }

    const sec = assignedSector !== undefined
      ? (assignedSector ? normalizeSector(String(assignedSector)) : null)
      : null;

    const actor = {
      matricula: req.user?.matricula ? String(req.user.matricula) : null,
      nome: req.user?.nome || req.user?.usuario || 'Administrador',
      usuario: req.user?.usuario || 'admin',
      isGlobalAdmin: Boolean(req.isGlobalAdmin),
    };

    const result = await userService.updateUserRole(prisma, {
      targetUserId: id,
      factoryUnitId: req.tenant!.id,
      newRole: role,
      newSector: sec as any,
      expectedRole,
      actor,
    });

    const { identity, ...binding } = result.user;
    const safeUser = {
      ...identity,
      ...binding,
      identityId: identity.id,
      id: binding.id,
      matriculaDass: identity.matriculaDass ? Number(identity.matriculaDass) : null,
      assignedSector: binding.assignedSector || null,
    };

    return res.json(safeUser);
  } catch (error: any) {
    if (error instanceof UserNotFoundError) {
      return res.status(404).json({ error: error.message });
    }
    if (error instanceof UserConcurrencyConflictError) {
      return res.status(409).json({ error: error.message });
    }
    if (error instanceof StockAccessError) return res.status(400).json({ error: error.message });
    if (error instanceof UnauthorizedRoleAssignmentError) {
      return res.status(403).json({ error: error.message });
    }
    console.error("Erro ao atualizar usuário:", error);
    return res.status(500).json({ error: 'Erro interno ao atualizar usuário.' });
  }
});

routes.delete('/users/:id', requireAuth, mutationLimiter, requireRole(['admin']), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Usuário inválido' });
  }

  try {
    await userService.removeUser(prisma, id, req.tenant!.id, {
      usuario: req.effectiveContext!.usuario, isGlobalAdmin: Boolean(req.isGlobalAdmin),
    });
    return res.json({ message: 'Usuário removido com sucesso.' });
  } catch (error) {
    if (error instanceof UserNotFoundError) return res.status(404).json({ error: error.message });
    if (error instanceof UnauthorizedRoleAssignmentError) return res.status(403).json({ error: error.message });
    if (error instanceof UserConcurrencyConflictError) return res.status(409).json({ error: error.message });
    return res.status(500).json({ error: 'Erro interno ao remover usuário' });
  }
});

routes.get('/settings/categories',    requireAuth, authenticatedLimiter, settingsController.getCategories);
routes.post('/settings/categories',   requireAuth, mutationLimiter, requireRole(['admin', 'admin_setor']), settingsController.createCategory);
routes.put('/settings/categories/:id', requireAuth, mutationLimiter, requireRole(['admin', 'admin_setor']), settingsController.updateCategory);
routes.delete('/settings/categories/:id', requireAuth, mutationLimiter, requireRole(['admin', 'admin_setor']), settingsController.deleteCategory);

routes.get('/settings/units', requireAuth, authenticatedLimiter, settingsController.getUnits);

routes.get('/settings/locations',    requireAuth, authenticatedLimiter, settingsController.getLocations);
routes.post('/settings/locations',   requireAuth, mutationLimiter, requireRole(['admin', 'admin_setor']), settingsController.createLocation);
routes.put('/settings/locations/:id', requireAuth, mutationLimiter, requireRole(['admin', 'admin_setor']), settingsController.updateLocation);
routes.delete('/settings/locations/:id', requireAuth, mutationLimiter, requireRole(['admin', 'admin_setor']), settingsController.deleteLocation);

routes.get('/settings/origins',    requireAuth, authenticatedLimiter, settingsController.getOrigins);
routes.post('/settings/origins',   requireAuth, mutationLimiter, requireRole(['admin', 'admin_setor']), settingsController.createOrigin);
routes.delete('/settings/origins/:id', requireAuth, mutationLimiter, requireRole(['admin', 'admin_setor']), settingsController.deleteOrigin);

routes.post('/import/csv', requireAuth, mutationLimiter, requireRole(['admin', 'admin_setor']), upload.single('arquivo'), importController.importCSV);

export { routes };
