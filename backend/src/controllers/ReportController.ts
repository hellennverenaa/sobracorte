import { Request, Response } from 'express';
import { prisma } from '../prisma';

export class ReportController {
  
  // 📊 1. Relatório de Inventário (Estoque Atual)
  async inventory(req: Request, res: Response) {
    try {
      const materials = await prisma.material.findMany({
        orderBy: { quantity: 'desc' }
      });

      const formatted = materials.map(m => ({
        codigo: m.code,
        material: m.name,
        quantidade: m.quantity,
        unidade: m.unit,
        categoria: m.type.toUpperCase(),
        data_cadastro: m.createdAt
      }));

      res.json(formatted);
    } catch (error) {
      console.error('Erro no relatório de estoque:', error);
      res.status(500).json({ error: 'Erro ao gerar relatório de inventário' });
    }
  }

  // 📅 2. Relatório de Movimentações (Com Filtro de Data)
  async movements(req: Request, res: Response) {
    try {
      const { dataInicio, dataFim } = req.query;

      let dateFilter = {};
      
      if (dataInicio && dataFim) {
        const start = new Date(String(dataInicio));
        start.setHours(0, 0, 0, 0); 
        const end = new Date(String(dataFim));
        end.setHours(23, 59, 59, 999); 

        dateFilter = {
          createdAt: {
            gte: start,
            lte: end,
          }
        };
      }

      const movements = await prisma.movement.findMany({
        where: dateFilter,
        orderBy: { createdAt: 'desc' },
        take: dataInicio ? undefined : 500,
        include: { material: true }
      });

     // Formatando colunas perfeitas para a exportação E para a Tabela HTML do Vue
      const formatted = movements.map(m => ({
        id: m.id,
        data: m.createdAt,           // <-- Tabela HTML precisa disso para a data
        data_hora: m.createdAt,      // <-- Excel precisa disso
        tipo: m.type.toUpperCase(),
        quantidade: m.quantity,
        motivo: m.reason || '-',
        usuario: m.operatorName || 'Sistema',
        responsavel: m.operatorName || 'Sistema',
        
        // O Frontend espera que o Material seja um objeto com descrição e tipo!
        material: {
          codigo: m.material.code,
          descricao: m.material.name,
          tipo: m.material.type,
          unidade: m.material.unit
        },
        
        // Mantendo variáveis planas por segurança
        codigo: m.material.code,
        nomeMaterial: m.material.name,
        unidade: m.material.unit
      }));

      res.json(formatted);
    } catch (error) {
      console.error('Erro no relatório de movimentações:', error);
      res.status(500).json({ error: 'Erro ao gerar relatório de movimentações' });
    }
  }
}