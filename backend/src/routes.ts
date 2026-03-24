import { Router } from 'express';
import { AuthController } from './controllers/AuthController';
import { MaterialController } from './controllers/MaterialController';
import { MovementController } from './controllers/MovementController';
import { ReportController } from './controllers/ReportController';

const routes = Router();
const reportController = new ReportController(); // (No meio)

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

routes.get('/reports/inventory', reportController.inventory);
routes.get('/reports/movements', reportController.movements);

// 👤 Banco de Dados Temporário em Memória (MVP)
let tempUsers = [
  {
    id: 1,
    nome: 'Hellen Verena',
    usuario: 'HELLEN.MAGALHAES',
    role: 'admin',
    email: 'hellen.magalhaes@grupodass.com.br',
    setor: 'Consumo / Tecnologia',
    funcao: 'Arquiteta de Software'
  },
  {
    id: 2,
    nome: 'Hendrius Santana',
    usuario: 'HENDRIUS.SANTANA',
    role: 'admin',
    email: 'hendrius.santana@grupodass.com.br',
    setor: 'TI / Automação',
    funcao: 'Engenheiro de Software'
  },
  {
    id: 2,
    nome: 'Paulo Santana',
    usuario: 'PAULO.SANTANA',
    role: 'admin',
    email: 'paulo.santana@grupodass.com.br',
    setor: 'Tecnologia',
    funcao: 'Especialista Técnico de Corte\Corte Automático e Novas Tecnologias'
  }
];

// Listar Usuários
routes.get('/users', (req, res) => res.json(tempUsers));

// 🚀 Atualizar Nível de Acesso (A rota que faltava!)
routes.put('/users/:id', (req, res) => {
  const id = Number(req.params.id);
  const index = tempUsers.findIndex(u => u.id === id);

  if (index !== -1) {
    tempUsers[index].role = req.body.role; // Atualiza o nível
    res.json(tempUsers[index]); // Devolve o usuário atualizado
  } else {
    res.status(404).json({ error: 'Usuário não encontrado' });
  }
});

export { routes };