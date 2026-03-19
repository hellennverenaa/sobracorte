import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient({
  log: ['query', 'info', 'warn', 'error'], // O DBA exige ver as queries no terminal!
});

// Middlewares (Segurança e Formato)
app.use(cors()); // Libera o Vue.js para acessar a API
app.use(express.json());

// 🚀 NOSSA PRIMEIRA ROTA: Buscar Materiais
app.get('/api/materials', async (req, res) => {
  try {
    // Pegando apenas os 50 primeiros em ordem alfabética para não explodir a memória
    const materials = await prisma.material.findMany({
      take: 50,
      orderBy: {
        name: 'asc'
      }
    });
    
    res.json(materials);
  } catch (error) {
    console.error('Erro na rota /api/materials:', error);
    res.status(500).json({ error: 'Erro interno do servidor ao buscar materiais' });
  }
});

// Ligando o Motor
const PORT = process.env.PORT || 3333;
app.listen(PORT, () => {
  console.log(`✅ Servidor SOBRA DASS rodando na porta ${PORT}`);
  console.log(`📍 Acesse para testar: http://localhost:${PORT}/api/materials`);
});