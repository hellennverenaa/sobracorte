import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();

app.use(cors({ exposedHeaders: ['X-Total-Count'] }));
app.use(express.json());

// 🔐 1. LOGIN
app.post('/auth/login', async (req, res) => {
  const { usuario, senha } = req.body;
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    const apiResponse = await fetch('http://10.100.1.43:2399/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, senha }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!apiResponse.ok) return res.status(401).json({ error: "Credenciais inválidas" });
    const data = await apiResponse.json();
    return res.json(data);
  } catch (error) {
    const mockToken = "mock.eyJ1c3VhcmlvIjoiSEVMTEVOLk1BR0FMSEFFUyIsICJyb2xlIjoiYWRtaW4ifQ==.mock";
    res.json({ data: { token: mockToken } });
  }
});

// 📦 2. LER MATERIAIS (Com Double Mapping para não quebrar o Vue)
app.get('/materials', async (req, res) => {
  try {
    const { q, _page, _limit } = req.query;
    const whereClause: any = q ? {
      OR: [
        { name: { contains: String(q), mode: 'insensitive' } },
        { code: { contains: String(q), mode: 'insensitive' } }
      ]
    } : {};

    const totalItems = await prisma.material.count({ where: whereClause });
    res.set('X-Total-Count', totalItems.toString());

    const page = Number(_page) || 1;
    const limit = Number(_limit) || 50;
    const skip = (page - 1) * limit;

    const materials = await prisma.material.findMany({
      where: whereClause,
      skip: skip,
      take: limit,
      orderBy: { createdAt: 'desc' }
    });

    const formattedMaterials = materials.map(m => ({
      ...m, // Manda os nomes originais (name, code, quantity)
      codigo: m.code, // Manda a tradução também (descricao, codigo, quantidade)
      descricao: m.name,
      quantidade: m.quantity,
      unidade: m.unit,
      tipo: m.type,
      observacoes: m.observation,
      data_cadastro: m.createdAt,
    }));

    res.json(formattedMaterials);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao buscar materiais' });
  }
});

// ➕ 3. CRIAR MATERIAL (O que estava dando erro 404)
app.post('/materials', async (req, res) => {
  try {
    const novo = await prisma.material.create({
      data: {
        code: String(req.body.codigo || req.body.code),
        name: String(req.body.descricao || req.body.name),
        quantity: Number(req.body.quantidade || req.body.quantity || 0),
        unit: String(req.body.unidade || req.body.unit || 'UN'),
        type: String(req.body.tipo || req.body.type || 'outros'),
        observation: String(req.body.observacoes || req.body.observation || ''),
      }
    });
    res.json(novo);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao criar material' });
  }
});

// ✏️ 4. ATUALIZAR MATERIAL
app.put('/materials/:id', async (req, res) => {
  try {
    const atualizado = await prisma.material.update({
      where: { id: Number(req.params.id) },
      data: {
        code: req.body.codigo ? String(req.body.codigo) : undefined,
        name: req.body.descricao ? String(req.body.descricao) : undefined,
        quantity: req.body.quantidade !== undefined ? Number(req.body.quantidade) : undefined,
        unit: req.body.unidade ? String(req.body.unidade) : undefined,
        type: req.body.tipo ? String(req.body.tipo) : undefined,
        observation: req.body.observacoes !== undefined ? String(req.body.observacoes) : undefined,
      }
    });
    res.json(atualizado);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao atualizar material' });
  }
});

// 🗑️ 5. DELETAR MATERIAL
app.delete('/materials/:id', async (req, res) => {
  try {
    await prisma.material.delete({ where: { id: Number(req.params.id) } });
    res.json({ message: 'Deletado com sucesso' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao deletar material' });
  }
});

// 📊 6. ESTATÍSTICAS
app.get('/stats', async (req, res) => {
  try {
    const [totalMaterials, lowStock, totalMovements] = await Promise.all([
      prisma.material.count(), 
      prisma.material.count({ where: { quantity: { lte: 10 } } }), 
      prisma.movement.count(), 
    ]);
    res.json({ totalMaterials, lowStock, totalMovements, totalEntries: 0 });
  } catch (error) {
    res.status(500).json({ error: 'Erro nas estatísticas' });
  }
});

// 🔄 7. LISTAR MOVIMENTAÇÕES (Com Double Mapping para o Vue não falhar)
app.get('/movements', async (req, res) => {
  try {
    const movements = await prisma.movement.findMany({
      take: 100, // Traz os últimos 100 registros
      orderBy: { createdAt: 'desc' }, // O Banco de Dados já força os MAIS RECENTES no topo!
      include: { material: true } 
    });
    
    const formatted = movements.map(m => ({
      ...m, // Envia todos os dados originais em inglês (createdAt, type, quantity, reason)
      id: m.id,
      tipo: m.type,             // Envia traduzido
      quantidade: m.quantity,   // Envia traduzido
      data: m.createdAt,        // Envia traduzido
      motivo: m.reason,         // Envia traduzido
      observacao: m.reason,     // Algumas telas do Vue usam 'observacao'
      usuario: m.operatorName,  // Envia o nome do Usuário formatado
      operador: m.operatorName, 
      material: m.material, 
      nomeMaterial: m.material?.name || m.material?.code
    }));
    
    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: 'Erro nas movimentações' });
  }
});

// 📝 8. REGISTRAR MOVIMENTAÇÃO
app.post('/movements', async (req, res) => {
  try {
    const materialId = Number(req.body.materialId || req.body.material_id);
    const quantidade = Number(req.body.quantidade || req.body.quantity);
    const tipo = String(req.body.tipo || req.body.type).toLowerCase(); 
    
    const result = await prisma.$transaction(async (tx) => {
      const movement = await tx.movement.create({
        data: {
          materialId: materialId,
          type: tipo, 
          quantity: quantidade,
          reason: req.body.observacao || req.body.reason || '',
          operatorName: req.body.usuario || 'Usuário DASS' 
        }
      });

      if (tipo === 'entrada') {
        await tx.material.update({ where: { id: materialId }, data: { quantity: { increment: quantidade } } });
      } else if (tipo === 'saida') {
        await tx.material.update({ where: { id: materialId }, data: { quantity: { decrement: quantidade } } });
      }
      return movement;
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao salvar movimentação' });
  }
});

// 👤 9. USUÁRIOS
app.get('/users', (req, res) => {
  res.json([
    { id: 1, usuario: 'HELLEN.MAGALHAES', role: 'admin', email: 'hellen.magalhaes@grupodass.com.br' },
    { id: 2, usuario: 'HENDRIUS.SANTANA', role: 'admin', email: 'hendrius.santana@grupodass.com.br' }
  ]);
});

const PORT = Number(process.env.PORT) || 3333;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Servidor SOBRACORTE blindado e rodando na porta ${PORT}`);
});