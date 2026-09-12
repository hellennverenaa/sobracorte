import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { parseCsvRFC4180 } from '../import/csvParser';
import {
  validateImportBatch,
  executeImportTransaction,
  ImportValidationError,
  normalizeSector,
} from '../import/materialImport';

export class ImportController {
  async importCSV(req: Request, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo CSV foi enviado. Selecione um arquivo .csv.' });
      }

      if (!req.file.originalname.toLowerCase().endsWith('.csv')) {
        return res.status(400).json({ error: 'Formato de arquivo inválido. Apenas arquivos no formato .csv são aceitos.' });
      }

      const rawSector = String(req.body.sector || req.query.sector || req.user?.assignedSector || 'CORTE');
      const defaultSector = normalizeSector(rawSector);

      // Trava RBAC para admin_setor: apenas permite importar para o seu setor designado
      if (req.user?.role === 'admin_setor' && req.user.assignedSector) {
        const userSec = normalizeSector(req.user.assignedSector);
        if (defaultSector !== userSec) {
          return res.status(403).json({
            error: `Acesso negado. Você só tem permissão para importar materiais no setor ${userSec}.`,
          });
        }
      }

      // 1. Parsing conforme RFC 4180
      const parsed = parseCsvRFC4180(req.file.buffer);

      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        return res.status(422).json({
          error: 'O arquivo CSV está vazio ou contém apenas o cabeçalho. Por favor, envie uma planilha com dados.',
          errors: [{ row: 1, column: 'arquivo', value: '', message: 'Nenhum registro encontrado para importação.' }],
        });
      }

      const factoryUnitId = req.tenant!.id;

      // 2. Buscar localizações cadastradas para a unidade fabril atual
      const availableLocations = await prisma.location.findMany({
        where: { factoryUnitId },
        select: { id: true, name: true, sector: true },
      });

      // 3. Validação de Lote em Memória (Pre-Flight) com validação de prateleiras existentes
      let validatedItems;
      try {
        validatedItems = validateImportBatch(parsed.headers, parsed.rows, defaultSector, availableLocations);
      } catch (validationErr) {
        if (validationErr instanceof ImportValidationError) {
          return res.status(422).json({
            error: validationErr.message,
            errors: validationErr.errors,
          });
        }
        throw validationErr;
      }

      // 4. Execução Transacional Atômica (Persistência + Amarração + Movimentações)
      const operatorId = req.user?.matricula ? String(req.user.matricula) : null;
      const operatorName = req.user?.nome || req.user?.usuario || 'Sistema / Importação';

      const result = await executeImportTransaction(prisma, validatedItems, {
        factoryUnitId,
        operatorId,
        operatorName,
      });

      return res.status(201).json({
        message: 'Importação multi-setor concluída com sucesso.',
        inseridos: result.inserted,
        processados: result.processed,
        ignorados: result.ignored,
        prateleirasCriadas: result.locationsCreated,
        movimentacoesCriadas: result.movementsCreated,
      });

    } catch (error: unknown) {
      if (error instanceof ImportValidationError) {
        return res.status(422).json({
          error: error.message,
          errors: error.errors,
        });
      }
      console.error('Erro na importação do CSV:', error);
      return res.status(500).json({ error: 'Erro interno ao processar a planilha CSV.' });
    }
  }
}
