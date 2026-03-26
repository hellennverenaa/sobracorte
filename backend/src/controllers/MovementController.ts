import { Request, Response } from 'express';
import { prisma } from '../prisma';

export class MovementController {
  async index(req: Request, res: Response) {
    try {
      const movements = await prisma.movement.findMany({
        take: 100,
        orderBy: { createdAt: 'desc' },
        include: { material: true } 
      });
      
      const formatted = movements.map(m => ({
        ...m,
        id: m.id,
        tipo: m.type,
        quantidade: m.quantity,
        data: m.createdAt,
        motivo: m.reason,
        observacao: m.reason,
        usuario: m.operatorName,
        operador: m.operatorName, 
        material: m.material, 
        nomeMaterial: m.material?.name || m.material?.code
      }));
      
      res.json(formatted);
    } catch (error) {
      res.status(500).json({ error: 'Erro nas movimentações' });
    }
  }

  async create(req: Request, res: Response) {
    try {
      const materialId = Number(req.body.materialId || req.body.material_id);
      const quantidade = Number(req.body.quantidade || req.body.quantity);
      const tipo = String(req.body.tipo || req.body.type).toLowerCase(); 
      const locationName = String(req.body.location || 'Não definido').trim(); // 🚀 Recebe a prateleira
      
      const result = await prisma.$transaction(async (tx) => {
        
        // 🚀 1. Acha ou Cria a Localização (Prateleira) dentro da transação
        let loc = await tx.location.findUnique({ where: { name: locationName } });
        if (!loc) {
          loc = await tx.location.create({ data: { name: locationName } });
        }

        // 2. Cria o Registro de Movimentação Histórica
        const movement = await tx.movement.create({
          data: {
            materialId: materialId,
            type: tipo, 
            quantity: quantidade,
            reason: req.body.observacao || req.body.reason || '',
            operatorName: req.body.usuario || 'Usuário DASS' 
          }
        });

        // 🚀 3. Regra de Negócio: Atualiza o Total e a Prateleira Específica
        if (tipo === 'entrada') {
          // Incrementa no Total Geral
          await tx.material.update({ 
            where: { id: materialId }, 
            data: { quantity: { increment: quantidade } } 
          });
          
          // Incrementa na Prateleira Específica (Upsert)
          await tx.materialLocation.upsert({
            where: { materialId_locationId: { materialId: materialId, locationId: loc.id } },
            update: { quantity: { increment: quantidade } },
            create: { materialId: materialId, locationId: loc.id, quantity: quantidade }
          });

        } else if (tipo === 'saida') {
          // 🛑 TRAVA DE SEGURANÇA DBA: Verifica saldo na Prateleira antes de dar saída
          const matLoc = await tx.materialLocation.findUnique({
            where: { materialId_locationId: { materialId: materialId, locationId: loc.id } }
          });

          if (!matLoc || Number(matLoc.quantity || 0) < quantidade) {
            // Se não tiver saldo, aborta a transação e joga o erro
            throw new Error(`Estoque insuficiente na localização: ${loc.name}`);
          }

          // Decrementa no Total Geral
          await tx.material.update({ 
            where: { id: materialId }, 
            data: { quantity: { decrement: quantidade } } 
          });
          
          // Decrementa na Prateleira Específica
          await tx.materialLocation.update({
            where: { materialId_locationId: { materialId: materialId, locationId: loc.id } },
            data: { quantity: { decrement: quantidade } }
          });
        }
        
        return movement;
      });

      res.json(result);
    } catch (error: any) {
      // Captura o erro da nossa trava de segurança ou do banco
      res.status(400).json({ error: error.message || 'Erro ao salvar movimentação' });
    }
  }
}