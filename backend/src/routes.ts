import { Router } from 'express';
import { AuthController } from './controllers/AuthController';
import { MaterialController } from './controllers/MaterialController';
import { MovementController } from './controllers/MovementController';

const routes = Router();

// Instanciando os controllers
const authController = new AuthController();
const materialController = new MaterialController();
const movementController = new MovementController();

// 🔐 Rotas de Login
routes.post('/auth/login', authController.login);

// 📦 Rotas de Materiais
routes.get('/materials', materialController.index);
routes.post('/materials', materialController.create);
routes.put('/materials/:id', materialController.update);
routes.delete('/materials/:id', materialController.delete);

// 📊 Rotas de Dashboard
routes.get('/stats', materialController.stats);

// 🔄 Rotas de Movimentações
routes.get('/movements', movementController.index);
routes.post('/movements', movementController.create);

// 👤 Rota Temporária de Usuários
routes.get('/users', (req, res) => {
  res.json([
    { id: 1, usuario: 'HELLEN.MAGALHAES', role: 'admin', email: 'hellen.magalhaes@grupodass.com.br' },
    { id: 2, usuario: 'HENDRIUS.SANTANA', role: 'admin', email: 'hendrius.santana@grupodass.com.br' }
  ]);
});

export { routes };