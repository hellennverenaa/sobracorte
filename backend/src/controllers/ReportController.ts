import { Request, Response } from 'express';
import { prisma } from '../prisma';

export class ReportController {
  async inventory(req: Request, res: Response) {
    try {
      const materials = await prisma.material.findMany({
        where: { factoryUnitId: req.tenant!.id },
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

  async movements(req: Request, res: Response) {
    try {
      const { dataInicio, dataFim } = req.query;

      let dateFilter: Record<string, unknown> = { factoryUnitId: req.tenant!.id };
      
      if (dataInicio && dataFim) {
        const start = new Date(String(dataInicio));
        start.setHours(0, 0, 0, 0); 
        const end = new Date(String(dataFim));
        end.setHours(23, 59, 59, 999); 

        dateFilter = {
          factoryUnitId: req.tenant!.id,
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

      const formatted = movements.map(m => ({
        id: m.id,
        data: m.createdAt,
        data_hora: m.createdAt,
        tipo: m.type.toUpperCase(),
        quantidade: m.quantity,
        motivo: m.reason || '-',
        usuario: m.operatorName || 'Sistema',
        responsavel: m.operatorName || 'Sistema',
        
        material: {
          codigo: m.material.code,
          descricao: m.material.name,
          tipo: m.material.type,
          unidade: m.material.unit
        },
        
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
