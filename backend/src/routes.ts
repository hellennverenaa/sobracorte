import { Router } from 'express';
import multer from 'multer';
import os from 'node:os';
import rateLimit from 'express-rate-limit';
import { AuthController } from './controllers/AuthController';
import { MaterialController } from './controllers/MaterialController';
import { MovementController } from './controllers/MovementController';
import { ReportController } from './controllers/ReportController';
import { SettingsController } from './controllers/SettingsController';
import { ImportController } from './controllers/ImportController';
import { DashboardController } from './controllers/DashboardController';
import { prisma } from './prisma';
import { requireRole, requireAuth } from './middlewares/roleMiddleware';
import { canAssignRole, isUserRole } from './auth/roles';

const routes = Router();

const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Muitas requisições. Tente novamente em alguns minutos.' },
});

const authenticatedLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => `${req.tenant!.id}:${String(req.user!.usuario).toUpperCase()}`,
  message: { error: 'Limite de requisições atingido. Tente novamente em alguns minutos.' },
});

const mutationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: (req) => `${req.tenant!.id}:${String(req.user!.usuario).toUpperCase()}`,
  message: { error: 'Limite de alterações atingido. Tente novamente em alguns minutos.' },
});

const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

const reportController = new ReportController();
const authController = new AuthController();
const materialController = new MaterialController();
const movementController = new MovementController();
const settingsController = new SettingsController();
const importController = new ImportController();
const dashboardController = new DashboardController();
routes.get('/factory-units', publicLimiter, async (_req, res) => {
  try {
    const units = await prisma.factoryUnit.findMany({
      where: { active: true },
      orderBy: { code: 'asc' },
      select: { code: true, name: true },
    });
    return res.json({ data: units });
  } catch (error) {
    console.error('Erro ao carregar unidades:', error);
    return res.status(500).json({ error: 'Erro ao carregar unidades.' });
  }
});
routes.use(requireAuth, authenticatedLimiter);
routes.post('/auth/check-user', mutationLimiter, authController.checkUser);

routes.get('/materials', materialController.index);
routes.post('/materials', mutationLimiter, requireRole(['lider']), materialController.create);
routes.put('/materials/:id', mutationLimiter, requireRole(['lider']), materialController.update);
routes.delete('/materials/:id', mutationLimiter, requireRole(['lider']), materialController.delete);
routes.post('/materials/bulk', mutationLimiter, requireRole(['admin']), materialController.importBatch);

routes.get('/dashboard/summary', dashboardController.getSummary);

routes.get('/movements', movementController.index);
routes.post('/movements', mutationLimiter, requireRole(['lider', 'movimentador']), movementController.create);

routes.get('/reports/inventory', requireRole(['lider']), reportController.inventory);
routes.get('/reports/movements', requireRole(['lider']), reportController.movements);
routes.get('/reports/inventory/export', requireRole(['lider']), reportController.exportInventory);
routes.get('/reports/movements/export', requireRole(['lider']), reportController.exportMovements);

routes.get('/users', requireRole(['admin']), async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      where: { factoryUnitId: req.tenant!.id },
      orderBy: { nome: 'asc' }
    });

    const safeUsers = users.map(user => ({
      ...user,
      matriculaDass: user.matriculaDass?.toString() ?? null
    }));

    res.json(safeUsers);
  } catch (error) {
    console.error("Erro ao buscar usuários:", error);
    res.status(500).json({ error: 'Erro interno ao buscar usuários' });
  }
});

routes.put('/users/:id', mutationLimiter, requireRole(['admin']), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { role } = req.body;

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Usuário inválido' });
    }
    if (!isUserRole(role)) {
      return res.status(400).json({ error: 'Nível de acesso inválido' });
    }
    if (!canAssignRole(role, Boolean(req.isGlobalAdmin))) {
      return res.status(403).json({ error: 'Apenas um administrador global pode promover administradores.' });
    }

    const result = await prisma.user.updateMany({
      where: { id, factoryUnitId: req.tenant!.id },
      data: { role }
    });
    if (result.count === 0) return res.status(404).json({ error: 'Usuário não encontrado' });
    const updatedUser = await prisma.user.findFirstOrThrow({ where: { id, factoryUnitId: req.tenant!.id } });

    const safeUser = {
      ...updatedUser,
      matriculaDass: updatedUser.matriculaDass?.toString() ?? null
    };

    res.json(safeUser);
  } catch (error) {
    console.error("Erro ao atualizar usuário:", error);
    res.status(500).json({ error: 'Erro interno ao atualizar usuário' });
  }
});

routes.get('/settings/categories', settingsController.getCategories);
routes.post('/settings/categories', mutationLimiter, requireRole(['admin']), settingsController.createCategory);
routes.put('/settings/categories/:id', mutationLimiter, requireRole(['admin']), settingsController.updateCategory);
routes.delete('/settings/categories/:id', mutationLimiter, requireRole(['admin']), settingsController.deleteCategory);

routes.get('/settings/units', settingsController.getUnits);
routes.post('/settings/units', mutationLimiter, requireRole(['admin']), settingsController.createUnit);
routes.delete('/settings/units/:id', mutationLimiter, requireRole(['admin']), settingsController.deleteUnit);

routes.get('/settings/locations', settingsController.getLocations);
routes.post('/settings/locations', mutationLimiter, requireRole(['admin']), settingsController.createLocation);
routes.delete('/settings/locations/:id', mutationLimiter, requireRole(['admin']), settingsController.deleteLocation);

routes.get('/settings/origins', settingsController.getOrigins);
routes.post('/settings/origins', mutationLimiter, requireRole(['admin']), settingsController.createOrigin);
routes.delete('/settings/origins/:id', mutationLimiter, requireRole(['admin']), settingsController.deleteOrigin);

routes.post('/import/csv', mutationLimiter, requireRole(['admin']), upload.single('arquivo'), importController.importCSV);

export { routes };
