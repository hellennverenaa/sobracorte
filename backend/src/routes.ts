import { Router } from 'express';
import { AuthController } from './controllers/AuthController';
import { MaterialController } from './controllers/MaterialController';
import { MovementController } from './controllers/MovementController';
import { ReportController } from './controllers/ReportController';
import { prisma } from './prisma';
import { checkAuth, requireRole } from './middlewares/authMiddleware';

const routes = Router();
const reportController = new ReportController(); // (No meio)

// Instanciando os controllers
const authController = new AuthController();
const materialController = new MaterialController();
const movementController = new MovementController();

// Rotas de Login (Única rota que fica 100% aberta, sem middleware)
routes.post('/auth/login', authController.login);

// Rotas de Materiais
// GET é livre para quem está logado (Leitor vê a lista)
routes.get('/materials', checkAuth, materialController.index);
// POST, PUT, DELETE é só para Liderança/Admin
routes.post('/materials', checkAuth, requireRole(['lider']), materialController.create);
routes.put('/materials/:id', checkAuth, requireRole(['lider']), materialController.update);
routes.delete('/materials/:id', checkAuth, requireRole(['lider']), materialController.delete);

// Rotas de Movimentações
routes.get('/movements', checkAuth, movementController.index);
// Lider e Movimentador podem dar entrada/saída (Leitor toma bloqueio)
routes.post('/movements', checkAuth, requireRole(['lider', 'movimentador']), movementController.create);

// Rotas de Dashboard e Relatórios (Líderes)
routes.get('/stats', checkAuth, materialController.stats);
routes.get('/reports/inventory', checkAuth, requireRole(['lider']), reportController.inventory);
routes.get('/reports/movements', checkAuth, requireRole(['lider']), reportController.movements);

// Gestão de Usuários (Somente os deuses - Admins)
routes.get('/users', checkAuth, requireRole([]), async (req, res) => { /*...seu código...*/ });
routes.put('/users/:id', checkAuth, requireRole([]), async (req, res) => { /*...seu código...*/ });


// ==========================================================
// ROTAS DE GESTÃO DE USUÁRIOS (SobraCorte DB)
// ==========================================================

// 1. Listar Usuários (Agora buscando direto do PostgreSQL)
routes.get('/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { nome: 'asc' } // Já devolve em ordem alfabética para a tela
    });
    res.json(users);
  } catch (error) {
    console.error("Erro ao buscar usuários:", error);
    res.status(500).json({ error: 'Erro interno ao buscar usuários' });
  }
});

// 2. Atualizar Nível de Acesso (A rota de poder do Admin!)
routes.put('/users/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { role } = req.body; // Pega o novo nível (admin, lider, movimentador, leitor)

    // O Prisma faz o UPDATE cirúrgico no banco
    const updatedUser = await prisma.user.update({
      where: { id: id },
      data: { role: role }
    });

    res.json(updatedUser);
  } catch (error) {
    console.error("Erro ao atualizar usuário:", error);
    res.status(404).json({ error: 'Usuário não encontrado ou erro na atualização' });
  }
});

export { routes };