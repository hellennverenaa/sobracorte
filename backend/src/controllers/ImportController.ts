import { UnitValidationError } from '../utils/unitHelper';
import { requestStockAccess, assignedStockSector, assertStockSectorAccess, StockAccessError } from '../auth/stockAccess';
import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { parseCsvRFC4180, CsvEncodingError } from '../import/csvParser';
import { DuplicateStockItemError } from '../services/stockIdentity';
import {
  validateImportBatch,
  planImport,
  executeImportTransaction,
  ImportValidationError,
  normalizeSector,
} from '../import/materialImport';
import { SectorValidationError } from '../utils/sectorHelper';

export class ImportController {
  async importCSV(req: Request, res: Response) {
    return this.processCSV(req, res, false);
  }

  async previewCSV(req: Request, res: Response) {
    return this.processCSV(req, res, true);
  }

  private async processCSV(req: Request, res: Response, preview: boolean) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo CSV foi enviado. Selecione um arquivo .csv.' });
      }

      if (!req.file.originalname.toLowerCase().endsWith('.csv')) {
        return res.status(400).json({ error: 'Formato de arquivo inválido. Apenas arquivos no formato .csv são aceitos.' });
      }

      const access = requestStockAccess(req);
      const rawSector = String(req.body.sector || req.query.sector || assignedStockSector(access) || 'CORTE');
      const defaultSector = normalizeSector(rawSector);
      assertStockSectorAccess(access, defaultSector);

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
            errors: validationErr.errors.slice(0, 100), totalErrors: validationErr.errors.length,
          });
        }
        throw validationErr;
      }

      for (const item of validatedItems) assertStockSectorAccess(access, item.sector);
      const plan = await planImport(prisma, validatedItems, factoryUnitId);
      if (plan.errors.length) {
        return res.status(422).json({
          error: 'Foram encontrados conflitos no arquivo. Nenhum item foi importado.',
          errors: plan.errors.slice(0, 100), totalErrors: plan.errors.length,
        });
      }

      if (preview) return res.status(200).json({
        processados: validatedItems.length,
        novos: plan.toInsert.length,
        ignorados: plan.ignored,
        saldosZero: validatedItems.filter(item => item.quantity === 0).length,
        localizacoesPadrao: validatedItems.filter(item => item.locationDefaulted).length,
        prateleiras: [...new Set(validatedItems.map(item => item.locationName))].sort(),
        codificacao: parsed.encoding,
      });

      // 4. Execução Transacional Atômica (Persistência + Amarração + Movimentações)
      const operatorId = req.user?.matricula ? String(req.user.matricula) : null;
      const operatorName = req.user?.nome || req.user?.usuario || 'Sistema / Importação';

      const result = plan.toInsert.length ? await executeImportTransaction(prisma, plan.toInsert, {
        ...requestStockAccess(req),
        factoryUnitId,
        operatorId,
        operatorName,
      }) : { inserted: 0, ignored: 0, movementsCreated: 0, locationsCreated: 0 };

      return res.status(201).json({
        message: 'Importação multi-setor concluída com sucesso.',
        inseridos: result.inserted,
        processados: validatedItems.length,
        ignorados: plan.ignored + result.ignored,
        prateleirasCriadas: result.locationsCreated,
        movimentacoesCriadas: result.movementsCreated,
      });

    } catch (error: unknown) {
      if (error instanceof CsvEncodingError) return res.status(422).json({ error: error.message });
      if (error instanceof UnitValidationError) return res.status(400).json({ error: error.message });
      if (error instanceof SectorValidationError) return res.status(400).json({ error: error.message });
      if (error instanceof StockAccessError) return res.status(403).json({ error: error.message });
      if (error instanceof DuplicateStockItemError) {
        return res.status(409).json({ error: error.message });
      }
      if (error instanceof ImportValidationError) {
        return res.status(422).json({
          error: error.message,
          errors: error.errors.slice(0, 100), totalErrors: error.errors.length,
        });
      }
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
        return res.status(409).json({ error: 'Um código do arquivo já foi cadastrado nesta unidade. Valide a planilha novamente para identificar o conflito.' });
      }
      if (error && typeof error === 'object' && 'code' in error && error.code === 'P2028') {
        return res.status(503).json({ error: 'A importação excedeu o tempo de processamento. Nenhum item foi importado; tente novamente após revisar o tamanho do lote.' });
      }
      console.error('Erro na importação do CSV:', error);
      return res.status(500).json({ error: 'Erro interno ao processar a planilha CSV.' });
    }
  }
}
