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
import { prisma } from './prisma';
import { requireRole, requireAuth } from './middlewares/roleMiddleware';
import { isUserRole } from './auth/roles';

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
routes.get('/factory-units', async (_req, res) => {
  try {
    const units = await prisma.factoryUnit.findMany({
      where: { active: true },
      orderBy: { code: 'asc' },
      select: { code: true, name: true },
    });
    return res.json({ data: units });
  } catch {
    return res.status(500).json({ error: 'Erro ao carregar unidades.' });
  }
});

routes.post('/auth/check-user', requireAuth, authController.checkUser);

routes.get('/materials', requireAuth, materialController.index);
routes.post('/materials', requireAuth, requireRole(['lider']), materialController.create);
routes.put('/materials/:id', requireAuth, requireRole(['lider']), materialController.update);
routes.delete('/materials/:id', requireAuth, requireRole(['lider']), materialController.delete);
routes.post('/materials/bulk', requireAuth, requireRole(['admin']), materialController.importBatch);

// 📦 ROTAS MULTI-SETOR (5 SETORES - ROUND-TRIP ÚNICO & CHÃO DE FÁBRICA)
routes.post('/inventory/batch', requireAuth, stockItemController.createBatch);
routes.get('/inventory/search', requireAuth, stockItemController.search);

// 👞 CASAMENTO DE PARES NA MONTAGEM
routes.get('/inventory/mounting/matching-pairs', requireAuth, mountingPairController.getMatchingPairs);
routes.post('/inventory/mounting/execute-match', requireAuth, mountingPairController.executeMatch);

// 🔄 MOVIMENTAÇÕES & HISTÓRICO DE AUDITORIA MULTI-SETOR
routes.post('/inventory/movements', requireAuth, stockMovementController.create);
routes.get('/inventory/movements/history', requireAuth, stockMovementController.history);

routes.get('/stats', requireAuth, materialController.stats);
routes.get('/dashboard/origem-sobras', requireAuth, dashboardController.getOrigemSobras);
routes.get('/dashboard/distribuicao', requireAuth, dashboardController.getDistribuicao);
routes.get('/dashboard/top-materiais', requireAuth, dashboardController.getTopMateriais);

routes.get('/movements', requireAuth, movementController.index);
routes.post('/movements', requireAuth, requireRole(['lider', 'movimentador']), movementController.create);

routes.get('/reports/inventory', requireAuth, requireRole(['lider']), reportController.inventory);
routes.get('/reports/movements', requireAuth, requireRole(['lider']), reportController.movements);

routes.get('/users', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { factoryUnitId: req.tenant!.id },
      orderBy: { nome: 'asc' }
    });

    const safeUsers = users.map(user => ({
      ...user,
      matriculaDass: user.matriculaDass ? Number(user.matriculaDass) : null
    }));

    res.json(safeUsers);
  } catch (error) {
    console.error("Erro ao buscar usuários:", error);
    res.status(500).json({ error: 'Erro interno ao buscar usuários' });
  }
});

routes.put('/users/:id', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { role } = req.body;

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Usuário inválido' });
    }
    if (!isUserRole(role)) {
      return res.status(400).json({ error: 'Nível de acesso inválido' });
    }

    const result = await prisma.user.updateMany({
      where: { id, factoryUnitId: req.tenant!.id },
      data: { role }
    });
    if (result.count === 0) return res.status(404).json({ error: 'Usuário não encontrado' });
    const updatedUser = await prisma.user.findFirstOrThrow({ where: { id, factoryUnitId: req.tenant!.id } });

    const safeUser = {
      ...updatedUser,
      matriculaDass: updatedUser.matriculaDass ? Number(updatedUser.matriculaDass) : null
    };

    res.json(safeUser);
  } catch (error) {
    console.error("Erro ao atualizar usuário:", error);
    res.status(500).json({ error: 'Erro interno ao atualizar usuário' });
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

routes.get('/settings/categories',    requireAuth, settingsController.getCategories);
routes.post('/settings/categories',   requireAuth, requireRole(['admin']), settingsController.createCategory);
routes.put('/settings/categories/:id', requireAuth, requireRole(['admin']), settingsController.updateCategory);
routes.delete('/settings/categories/:id', requireAuth, requireRole(['admin']), settingsController.deleteCategory);

routes.get('/settings/units', requireAuth, settingsController.getUnits);
routes.post('/settings/units', requireAuth, requireRole(['admin']), settingsController.createUnit);
routes.delete('/settings/units/:id', requireAuth, requireRole(['admin']), settingsController.deleteUnit);

routes.get('/settings/locations',    requireAuth, settingsController.getLocations);
routes.post('/settings/locations',   requireAuth, requireRole(['admin']), settingsController.createLocation);
routes.delete('/settings/locations/:id', requireAuth, requireRole(['admin']), settingsController.deleteLocation);

routes.get('/settings/origins',    requireAuth, settingsController.getOrigins);
routes.post('/settings/origins',   requireAuth, requireRole(['admin']), settingsController.createOrigin);
routes.delete('/settings/origins/:id', requireAuth, requireRole(['admin']), settingsController.deleteOrigin);

routes.post('/import/csv', requireAuth, requireRole(['admin']), upload.single('arquivo'), importController.importCSV);

export { routes };
