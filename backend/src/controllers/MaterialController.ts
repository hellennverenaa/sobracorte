import { Request, Response } from 'express';
import { prisma } from '../prisma';

export class MaterialController {
  async index(req: Request, res: Response) {
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

      // 🚀 1. AUMENTADO PARA 10.000 (Traz todo o estoque do ERP para a pesquisa do Vue funcionar)
      const page = Number(_page) || 1;
      const limit = Number(_limit) || 10000; 
      const skip = (page - 1) * limit;

      const materials = await prisma.material.findMany({
        where: whereClause,
        skip: skip,
        take: limit,
        // 🚀 2. A TRAVA DO DBA: Desempata a data usando o ID. O item nunca mais muda de lugar!
        orderBy: [
          { createdAt: 'desc' },
          { id: 'desc' } 
        ],
        include: { 
          locations: { 
            include: { location: true } 
          } 
        }
      });

     const formatted = materials.map(m => {
        // 🚀 A MÁGICA: Filtra apenas as prateleiras que realmente têm saldo (> 0)
        // Ignorando os "Não definido" vazios do passado.
        const prateleirasComSaldo = m.locations.filter((ml: any) => ml.quantity > 0);
        
        let localExibicao = 'Não definido';
        
        if (prateleirasComSaldo.length > 0) {
          // Se tiver em apenas uma, mostra o nome dela. 
          // Se o material estiver dividido, ele junta os nomes (Ex: "Prat A | Prat B")
          localExibicao = prateleirasComSaldo.map((ml: any) => ml.location.name).join(' | ');
        }
        
        return {
          ...m,
          codigo: m.code,
          descricao: m.name,
          quantidade: m.quantity,
          unidade: m.unit,
          tipo: m.type,
          observacoes: m.observation,
          data_cadastro: m.createdAt,
          location: localExibicao // 🚀 Envia o nome real da prateleira para o Frontend
        };
      });

      res.json(formatted);
    } catch (error) {
      console.error("Erro ao buscar materiais: ", error)
      res.status(500).json({ error: 'Erro ao buscar materiais' });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const locationName = String(req.body.location || 'Não definido').trim();
      const qtdInicial = Number(req.body.quantidade || req.body.quantity || 0);

      //  1. Busca se a Prateleira já existe no banco. Se não, cria na hora!
      let loc = await prisma.location.findUnique({ where: { name: locationName } });
      if (!loc) {
        loc = await prisma.location.create({ data: { name: locationName } });
      }

      //  2. A MÁGICA: Prepara a auditoria. Se tiver saldo, gera uma ENTRADA automática.
      const movimentos = qtdInicial > 0 ? {
        create: {
          type: 'entrada',
          quantity: qtdInicial,
          reason: 'Saldo Inicial de Implantação',
          operatorName: 'Sistema / Implantação' // Nome fixo para auditoria de cadastro
        }
      } : undefined;

      //  3. Cria o Material, a Prateleira e o Histórico em uma única transação atômica!
      const novo = await prisma.material.create({
        data: {
          code: String(req.body.codigo || req.body.code),
          name: String(req.body.descricao || req.body.name),
          quantity: qtdInicial,
          unit: String(req.body.unidade || req.body.unit || 'UN'),
          type: String(req.body.tipo || req.body.type || 'outros'),
          observation: String(req.body.observacoes || req.body.observation || ''),
          
          locations: {
            create: {
              locationId: loc.id,
              quantity: qtdInicial
            }
          },
          
          movements: movimentos // 🚀 Injeção do Histórico Automático
        }
      });
      
      res.json(novo);
    } catch (error) {
      console.error("Erro na criação:", error); // Bom deixar isso aqui para debugar se precisar
      res.status(500).json({ error: 'Erro ao criar material. Verifique duplicidade.' });
    }
  }

  async update(req: Request, res: Response) {
    try {
      const materialId = Number(req.params.id);
      const locationName = req.body.location ? String(req.body.location).trim() : null;

      // 🚀 1. Se o usuário alterou a prateleira no Frontend, nós garantimos que ela existe
      if (locationName) {
        let loc = await prisma.location.findUnique({ where: { name: locationName } });
        if (!loc) {
          loc = await prisma.location.create({ data: { name: locationName } });
        }

        // 🚀 2. Conecta essa nova prateleira ao Material usando Upsert (Atualiza ou Cria o vínculo)
        await prisma.materialLocation.upsert({
          where: { materialId_locationId: { materialId: materialId, locationId: loc.id } },
          update: {}, // Se já existe, não mexe na quantidade
          create: { materialId: materialId, locationId: loc.id, quantity: 0 } // Se não existe, cria o vínculo com saldo 0
        });
      }

      // 3. Atualiza os dados básicos do Material
      const atualizado = await prisma.material.update({
        where: { id: materialId },
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
  }

  async delete(req: Request, res: Response) {
    try {
      await prisma.material.delete({ where: { id: Number(req.params.id) } });
      res.json({ message: 'Deletado com sucesso' });
    } catch (error) {
      res.status(500).json({ error: 'Erro ao deletar material' });
    }
  }

  async stats(req: Request, res: Response) {
    try {
      const [totalMaterials, lowStock, totalMovements, totalEntries] = await Promise.all([
        prisma.material.count(), 
        prisma.material.count({ where: { quantity: { lte: 10 } } }), 
        prisma.movement.count(), 
        prisma.movement.count({ where: { type: 'entrada' } }) 
      ]);
      res.json({ totalMaterials, lowStock, totalMovements, totalEntries });
    } catch (error) {
      res.status(500).json({ error: 'Erro nas estatísticas' });
    }
  }
}