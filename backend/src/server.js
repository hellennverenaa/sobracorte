require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');

const app = express();
const prisma = new PrismaClient();

app.use(express.json());
app.use(cors());

// --- ROTA DE MATERIAIS ---
app.get('/materials', async (req, res) => {
  try {
    const materials = await prisma.material.findMany({ orderBy: { name: 'asc' } });
    res.json(materials);
  } catch (error) {
    console.error("Erro Materials:", error);
    res.status(500).json({ error: "Erro ao buscar materiais" });
  }
});

app.post('/materials', async (req, res) => {
  try {
    const novo = await prisma.material.create({ data: req.body });
    res.json(novo);
  } catch (error) {
    res.status(400).json({ error: "Erro ao criar material. Código duplicado?" });
  }
});

app.put('/materials/:id', async (req, res) => {
  try {
    const { id } = req.params;
    // Remove o ID do corpo para não tentar atualizar a chave primária
    const { id: _, ...dados } = req.body;
    
    const atualizado = await prisma.material.update({
      where: { id: Number(id) },
      data: dados
    });
    res.json(atualizado);
  } catch (error) {
    res.status(400).json({ error: "Erro ao atualizar material" });
  }
});

app.delete('/materials/:id', async (req, res) => {
  try {
    await prisma.material.delete({ where: { id: Number(req.params.id) } });
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ error: "Erro ao excluir" });
  }
});

// --- ROTA DE MOVIMENTAÇÕES ---
app.post('/movements', async (req, res) => {
  const { materialId, type, quantity, reason, userId } = req.body;

  if (!materialId || !quantity || !type) {
    return res.status(400).json({ error: "Dados incompletos" });
  }

  try {
    const material = await prisma.material.findUnique({ where: { id: Number(materialId) } });
    if (!material) return res.status(404).json({ error: "Material não encontrado" });

    let novoSaldo = Number(material.quantity);
    if (type === 'ENTRADA') novoSaldo += Number(quantity);
    else if (type === 'SAIDA') novoSaldo -= Number(quantity);

    // Transação para garantir que salva o histórico E atualiza o saldo
    const [mov] = await prisma.$transaction([
      prisma.movement.create({
        data: {
          materialId: Number(materialId),
          type,
          quantity: Number(quantity),
          reason: reason || '',
          userId: userId ? Number(userId) : null
        }
      }),
      prisma.material.update({
        where: { id: Number(materialId) },
        data: { quantity: novoSaldo }
      })
    ]);

    res.json(mov);
  } catch (error) {
    console.error("Erro Movement:", error);
    res.status(500).json({ error: "Erro interno ao processar" });
  }
});

app.get('/movements', async (req, res) => {
  try {
    const movements = await prisma.movement.findMany({
      include: {
        material: true,
        user: true // Traz o nome do responsável
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    res.json(movements);
  } catch (error) {
    console.error("Erro Histórico:", error);
    res.status(500).json({ error: "Erro ao buscar histórico" });
  }
});

// --- ROTA DE LOGIN (MANTIDA) ---

app.post('/auth/login', async (req, res) => {
  const { usuario, senha } = req.body;
  try {
    const apiResponse = await fetch('http://10.100.1.43:2399/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, senha })
    });
    if (!apiResponse.ok) return res.status(401).json({ error: "Acesso negado" });
    const data = await apiResponse.json();
    res.json(data);
  } catch (error) {
    res.status(500).json({ error: "Erro conexão DASS" });
  }
});


const PORT = 3000;
app.listen(PORT, () => console.log(`🔥 Servidor RODANDO na porta ${PORT}`));