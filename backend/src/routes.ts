import { Router } from 'express';
import multer from 'multer';
import { AuthController } from './controllers/AuthController';
import { MaterialController } from './controllers/MaterialController';
import { MovementController } from './controllers/MovementController';
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
import {
  userService,
  UserNotFoundError,
  UserConcurrencyConflictError,
  UnauthorizedRoleAssignmentError,
} from './services/UserService';

const routes = Router();

const upload = multer({ storage: multer.memoryStorage() });

const reportController = new ReportController();
const authController = new AuthController();
const materialController = new MaterialController();
const movementController = new MovementController();
const settingsController = new SettingsController();
const importController = new ImportController();
const dashboardController = new DashboardController();
const stockItemController = new StockItemController();
const mountingPairController = new MountingPairController();
const stockMovementController = new StockMovementController();
const requisitionController = new RequisitionController();

routes.get('/health', (_req, res) => res.json({ status: 'ok' }));
routes.get('/auth/health', (_req, res) => res.json({ status: 'ok' }));
routes.get('/factory-units', async (_req, res) => {
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
routes.get('/factory-unit/current', requireAuth, async (req, res) => {
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

routes.patch('/factory-unit/current/settings', requireAuth, requireRole(['admin']), async (req, res) => {
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

routes.post('/auth/login', authController.login);
routes.post('/auth/check-user', requireAuth, authController.checkUser);

routes.get('/materials', requireAuth, materialController.index);
routes.post('/materials', requireAuth, requireRole(['admin_setor', 'lider']), requireSectorMatch(() => 'CORTE'), materialController.create);
routes.put('/materials/:id', requireAuth, requireRole(['admin_setor', 'lider']), requireSectorMatch(() => 'CORTE'), materialController.update);
routes.delete('/materials/:id', requireAuth, requireRole(['admin_setor']), requireSectorMatch(() => 'CORTE'), materialController.delete);
routes.post('/materials/bulk', requireAuth, requireRole(['admin']), materialController.importBatch);

// 📦 ROTAS MULTI-SETOR (5 SETORES - ROUND-TRIP ÚNICO & CHÃO DE FÁBRICA)
routes.post('/inventory/batch', requireAuth, requireRole(['admin_setor', 'lider']), requireSectorMatch((req: any) => req.body?.sector || (Array.isArray(req.body?.items) ? req.body.items[0]?.sector : undefined)), stockItemController.createBatch);
routes.get('/inventory/search', requireAuth, stockItemController.search);
routes.get('/inventory/search-suggestions', requireAuth, stockItemController.suggestions);
routes.get('/inventory/combinations', requireAuth, stockItemController.combinations);
routes.delete('/inventory/stock-items/:id', requireAuth, requireRole(['admin_setor']), stockItemController.delete);

// 👞 CASAMENTO DE PARES NA MONTAGEM
routes.get('/inventory/mounting/matching-pairs', requireAuth, mountingPairController.getMatchingPairs);
routes.post('/inventory/mounting/execute-match', requireAuth, requireRole(['admin_setor', 'lider', 'movimentador']), requireSectorMatch((req: any) => req.body?.sector || 'MONTAGEM'), mountingPairController.executeMatch);

// 🔄 MOVIMENTAÇÕES & HISTÓRICO DE AUDITORIA MULTI-SETOR
routes.post('/inventory/movements', requireAuth, requireRole(['admin_setor', 'lider', 'movimentador']), requireSectorMatch((req: any) => req.body?.sector), stockMovementController.create);
routes.get('/inventory/movements/history', requireAuth, stockMovementController.history);

// 📋 MÓDULO DIGITAL DE REQUISIÇÕES & SOLICITAÇÕES DE REPOSIÇÃO
routes.post('/requisitions', requireAuth, requireRequisitionsEnabled, requisitionController.create);
routes.post('/requisitions/check-availability', requireAuth, requireRequisitionsEnabled, requisitionController.checkAvailability);
routes.get('/requisitions', requireAuth, requireRequisitionsEnabled, requisitionController.index);
routes.get('/requisitions/pending-count', requireAuth, requireRequisitionsEnabled, requisitionController.pendingCount);
routes.post('/requisitions/:id/fulfill', requireAuth, requireRequisitionsEnabled, requireRole(['admin', 'admin_setor']), requisitionController.fulfill);
routes.patch('/requisitions/:id/cancel', requireAuth, requireRequisitionsEnabled, requisitionController.cancel);

// 📊 DASHBOARD & INDICADORES ANALÍTICOS CONSOLIDADOS (SINGLE ROUND-TRIP)
routes.get('/dashboard/summary', requireAuth, dashboardController.getSummary);
routes.get('/stats', requireAuth, materialController.stats);
routes.get('/dashboard/origem-sobras', requireAuth, dashboardController.getOrigemSobras);
routes.get('/dashboard/distribuicao', requireAuth, dashboardController.getDistribuicao);
routes.get('/dashboard/top-materiais', requireAuth, dashboardController.getTopMateriais);

routes.get('/movements', requireAuth, movementController.index);
routes.post('/movements', requireAuth, requireRole(['admin_setor', 'lider', 'movimentador']), requireSectorMatch(() => 'CORTE'), movementController.create);

routes.get('/reports/inventory', requireAuth, reportController.inventory);
routes.get('/reports/movements', requireAuth, reportController.movements);
routes.get('/reports/data', requireAuth, reportController.movements);
routes.get('/reports/requisitions', requireAuth, reportController.requisitions);

routes.get('/users', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { factoryUnitId: req.tenant!.id },
      orderBy: { nome: 'asc' }
    });

    const safeUsers = users.map(user => ({
      ...user,
      matriculaDass: user.matriculaDass ? Number(user.matriculaDass) : null,
      assignedSector: user.assignedSector || null,
    }));

    res.json(safeUsers);
  } catch (error) {
    console.error("Erro ao buscar usuários:", error);
    res.status(500).json({ error: 'Erro interno ao buscar usuários' });
  }
});

routes.get('/users/audit', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 50;
    const logs = await userService.getRoleAuditHistory(prisma, req.tenant!.id, limit);
    return res.json(logs);
  } catch (error) {
    console.error("Erro ao buscar auditoria de usuários:", error);
    return res.status(500).json({ error: 'Erro interno ao buscar histórico de auditoria.' });
  }
});

routes.put('/users/:id', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { role, assignedSector, expectedRole } = req.body;

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Usuário inválido.' });
    }
    if (!role || !isUserRole(role)) {
      return res.status(400).json({ error: 'Nível de acesso inválido.' });
    }

    let sec = assignedSector !== undefined ? (assignedSector ? String(assignedSector).toUpperCase().trim() : null) : null;
    if (sec === 'CABEDAIS' || sec === 'EXPEDICAO') sec = 'DISTRIBUICAO';

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

    const safeUser = {
      ...result.user,
      matriculaDass: result.user.matriculaDass ? Number(result.user.matriculaDass) : null,
      assignedSector: result.user.assignedSector || null,
    };

    return res.json(safeUser);
  } catch (error: any) {
    if (error instanceof UserNotFoundError) {
      return res.status(404).json({ error: error.message });
    }
    if (error instanceof UserConcurrencyConflictError) {
      return res.status(409).json({ error: error.message });
    }
    if (error instanceof UnauthorizedRoleAssignmentError) {
      return res.status(403).json({ error: error.message });
    }
    console.error("Erro ao atualizar usuário:", error);
    return res.status(500).json({ error: 'Erro interno ao atualizar usuário.' });
  }
});

routes.delete('/users/:id', requireAuth, requireRole(['admin']), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Usuário inválido' });
  }

  try {
    const target = await prisma.user.findFirst({ where: { id, factoryUnitId: req.tenant!.id }, select: { usuario: true } });
    if (!target) return res.status(404).json({ error: 'Usuário não encontrado' });
    if (target.usuario === req.user?.usuario) {
      return res.status(409).json({ error: 'Não é possível remover o próprio usuário.' });
    }

    await prisma.user.deleteMany({ where: { id, factoryUnitId: req.tenant!.id } });
    return res.json({ message: 'Usuário removido com sucesso.' });
  } catch {
    return res.status(500).json({ error: 'Erro interno ao remover usuário' });
  }
});

routes.get('/settings/categories',    requireAuth, requireRole(['admin', 'admin_setor']), settingsController.getCategories);
routes.post('/settings/categories',   requireAuth, requireRole(['admin', 'admin_setor']), settingsController.createCategory);
routes.put('/settings/categories/:id', requireAuth, requireRole(['admin', 'admin_setor']), settingsController.updateCategory);
routes.delete('/settings/categories/:id', requireAuth, requireRole(['admin', 'admin_setor']), settingsController.deleteCategory);

routes.get('/settings/units', requireAuth, requireRole(['admin', 'admin_setor']), settingsController.getUnits);
routes.post('/settings/units', requireAuth, requireRole(['admin', 'admin_setor']), settingsController.createUnit);
routes.delete('/settings/units/:id', requireAuth, requireRole(['admin', 'admin_setor']), settingsController.deleteUnit);

routes.get('/settings/locations',    requireAuth, requireRole(['admin', 'admin_setor']), settingsController.getLocations);
routes.post('/settings/locations',   requireAuth, requireRole(['admin', 'admin_setor']), settingsController.createLocation);
routes.put('/settings/locations/:id', requireAuth, requireRole(['admin', 'admin_setor']), settingsController.updateLocation);
routes.delete('/settings/locations/:id', requireAuth, requireRole(['admin', 'admin_setor']), settingsController.deleteLocation);

routes.get('/settings/origins',    requireAuth, requireRole(['admin', 'admin_setor']), settingsController.getOrigins);
routes.post('/settings/origins',   requireAuth, requireRole(['admin', 'admin_setor']), settingsController.createOrigin);
routes.delete('/settings/origins/:id', requireAuth, requireRole(['admin', 'admin_setor']), settingsController.deleteOrigin);

routes.post('/import/csv', requireAuth, requireRole(['admin', 'admin_setor']), upload.single('arquivo'), importController.importCSV);

export { routes };
