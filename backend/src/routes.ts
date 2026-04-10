import { Router } from 'express';
import { AuthController } from './controllers/AuthController';
import { MaterialController } from './controllers/MaterialController';
import { MovementController } from './controllers/MovementController';
import { ReportController } from './controllers/ReportController';
import { prisma } from './prisma'; // <-- Conexão com o banco!
import { requireRole, requireAuth } from './middlewares/roleMiddleware'; // <-- Nosso Cão de Guarda!

const routes = Router();

const reportController = new ReportController();
const authController = new AuthController();
const materialController = new MaterialController();
const movementController = new MovementController();

//  Rotas de Login (Aberta)
routes.post('/auth/login', authController.login);

// Rota callback para registrar usuaruo no banco sobracorte
routes.post("/auth/check-user", authController.checkUser)

// Rotas de Materiais
routes.get('/materials', requireAuth, materialController.index);
routes.post('/materials', requireAuth, requireRole(['lider']), materialController.create);
routes.put('/materials/:id', requireAuth, requireRole(['lider']), materialController.update);
routes.delete('/materials/:id', requireAuth, requireRole(['lider']), materialController.delete);
routes.post('/materials/bulk', requireAuth, requireRole(['admin']), materialController.importBatch);

// Rotas de Dashboard
routes.get('/stats', materialController.stats);

// Rotas de Movimentações
routes.get('/movements', movementController.index);
routes.post('/movements', requireAuth, requireRole(['lider', 'movimentador']), movementController.create);

// Relatórios
routes.get('/reports/inventory', requireAuth, requireRole(['lider']), reportController.inventory);
routes.get('/reports/movements', requireAuth, requireRole(['lider']), reportController.movements);

// ==========================================================
// 👥 ROTAS DE GESTÃO DE USUÁRIOS (SobraCorte DB)
// ==========================================================

// Listar Usuários do Banco Real (Com proteção contra o BigInt)
routes.get('/users', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: { nome: 'asc' }
    });
    
    //  A MÁGICA: Converte o BigInt para Number antes de virar JSON!
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

// Atualizar Nível de Acesso no Banco Real
//  A CORREÇÃO: Colocamos o Porteiro e dizemos que só ADMIN entra!
// Atualizar Nível de Acesso no Banco Real
routes.put('/users/:id', requireAuth, requireRole(['admin']), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { role } = req.body;

    const updatedUser = await prisma.user.update({
      where: { id: id },
      data: { role: role }
    });

    // A VACINA: Converte o BigInt para Number antes de devolver pro Vue.js!
    const safeUser = {
      ...updatedUser,
      matriculaDass: updatedUser.matriculaDass ? Number(updatedUser.matriculaDass) : null
    };

    res.json(safeUser);
  } catch (error) {
    console.error("Erro ao atualizar usuário:", error);
    // Mudei para 500 para fazer mais sentido, caso dê um erro real de banco
    res.status(500).json({ error: 'Erro interno ao atualizar usuário' }); 
  }
});

export { routes };