import { createHash } from 'node:crypto';
import { UnitValidationError } from '../utils/unitHelper';
import { requestStockAccess, assignedStockSector, assertStockSectorAccess, isStockMaster, StockAccessError } from '../auth/stockAccess';
import { assertStockSubsectorAccess, locationScopeWhere } from '../auth/subsectorAccess';
import { Request, Response } from 'express';
import { prisma } from '../prisma';
import { parseCsvRFC4180, CsvEncodingError } from '../import/csvParser';
import { DuplicateStockItemError } from '../services/stockIdentity';
import type { AvailableImportCategory, AvailableImportSubsector } from '../import/materialImport';
import {
  validateImportBatch,
  planImport,
  executeImportTransaction,
  ImportValidationError,
  normalizeSector,
} from '../import/materialImport';
import { SectorValidationError } from '../utils/sectorHelper';

export class ImportController {
  importCSV = async (req: Request, res: Response) => {
    return this.processCSV(req, res, false);
  };

  previewCSV = async (req: Request, res: Response) => {
    return this.processCSV(req, res, true);
  };

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
        where: { factoryUnitId, ...locationScopeWhere(access) },
        select: { id: true, name: true, sector: true, subsectorId: true, categoryMode: true, categoryId: true, categoryLinks: { select: { categoryId: true } } },
      });
      const availableCategories: AvailableImportCategory[] = await prisma.categoryConfig.findMany({
        where: { factoryUnitId },
        select: { id: true, name: true, sector: true, sectors: true, entryMode: true, defaultUnitCode: true },
      });
      const availableSubsectors: AvailableImportSubsector[] = await prisma.subsectorConfig.findMany({
        where: {
          factoryUnitId,
          active: true,
          ...(!isStockMaster(access)
            ? access.role === 'admin_setor'
              ? (assignedStockSector(access) ? { sector: assignedStockSector(access)! } : { id: { in: [] } })
              : { id: { in: access.subsectorIds || [] } }
            : {}),
        },
        select: { id: true, name: true, sector: true, active: true, categoryMode: true, categoryLinks: { select: { categoryConfigId: true } } },
      });

      // 3. Validação de Lote em Memória (Pre-Flight) com validação de prateleiras existentes
      if (req.body?.localizationMappings) {
        let mappings: unknown;
        try { mappings = JSON.parse(req.body.localizationMappings); }
        catch { return res.status(400).json({ error: 'Mapeamento de localizações inválido.' }); }
        if (!Array.isArray(mappings) || mappings.length > parsed.rows.length) return res.status(400).json({ error: 'Mapeamento de localizações inválido.' });
        const locationColumn = parsed.headers.findIndex(header => ['prateleira', 'localizacao', 'localização', 'location', 'box', 'estante', 'endereco'].includes(header.trim().toLowerCase()));
        if (locationColumn < 0) return res.status(400).json({ error: 'A planilha não contém uma coluna de localização para mapear.' });
        const mappedRows = new Set<number>();
        for (const mapping of mappings) {
          const row = parsed.rows.find(row => row.rowNumber === mapping?.row);
          const location = availableLocations.find(location => location.id === mapping?.locationId);
          if (!row || !location || mappedRows.has(row.rowNumber)) return res.status(400).json({ error: 'Linha ou localização indisponível no mapeamento.' });
          mappedRows.add(row.rowNumber);
          row.cells[locationColumn] = location.name;
          const mappedItems = validateImportBatch(parsed.headers, [row], defaultSector, availableLocations, availableCategories, availableSubsectors);
          if (mappedItems.some(item => item.locationId !== location.id)) {
            return res.status(422).json({ error: 'A localização escolhida não corresponde ao setor e subsetor desta linha.', errors: [{ row: row.rowNumber, column: 'prateleira', value: location.name, message: 'Escolha uma localização do mesmo setor e subsetor do item.' }], totalErrors: 1 });
          }
        }
      }
      let validatedItems;
      try {
        validatedItems = validateImportBatch(parsed.headers, parsed.rows, defaultSector, availableLocations, availableCategories, availableSubsectors);
      } catch (validationErr) {
        if (validationErr instanceof ImportValidationError) {
          return res.status(422).json({
            error: validationErr.message,
            errors: validationErr.errors, totalErrors: validationErr.errors.length,
          });
        }
        throw validationErr;
      }

      for (const item of validatedItems) {
        assertStockSectorAccess(access, item.sector);
        if (item.subsectorId) {
          const subsector = availableSubsectors.find(candidate => candidate.id === item.subsectorId);
          if (!subsector) throw new StockAccessError('Acesso negado: subsetor indisponível para este usuário.');
          assertStockSubsectorAccess(access, subsector, item.sector);
        }
      }
      const plan = await planImport(prisma, validatedItems, factoryUnitId);
      if (plan.errors.length) {
        return res.status(422).json({
          error: 'Foram encontrados conflitos no arquivo. Nenhum item foi importado.',
          errors: plan.errors, totalErrors: plan.errors.length,
        });
      }

      const planHash = createHash('sha256').update(req.file.buffer).update(JSON.stringify({
        factoryUnitId, defaultSector, items: validatedItems, ignored: plan.ignoredItems,
        locations: [...availableLocations].sort((a, b) => a.id - b.id),
        categories: [...availableCategories].sort((a, b) => (a.id || 0) - (b.id || 0)),
        subsectors: [...availableSubsectors].sort((a, b) => a.id - b.id),
      })).digest('hex');
      if (!preview && req.body?.planoHash && req.body.planoHash !== planHash) {
        return res.status(409).json({ error: 'O estoque ou as configurações mudaram desde a prévia. Valide novamente o arquivo antes de confirmar.' });
      }
      if (preview) {
        const previewLimit = 100;
        const previewItems = validatedItems.slice(0, previewLimit).map(item => ({
          linha: item.rowNumber,
          setor: item.sector,
          subsetor: item.subsectorId ? availableSubsectors.find(subsector => subsector.id === item.subsectorId)?.name || null : null,
          sku: item.code,
          modelo: item.productName || item.name,
          peca: item.name,
          tipo: item.type,
          combinacao: item.color || (item.sector === 'APOIO' ? 'PADRAO' : null),
          grade: item.sizeGrade || null,
          lado: item.footSide || null,
          quantidade: item.quantity,
          unidade: item.unit,
          localizacoes: item.locations?.length
            ? item.locations.map(location => ({ nome: location.locationName, quantidade: location.quantity }))
            : [{ nome: item.locationName, quantidade: item.quantity }],
        }));

        return res.status(200).json({
          planoHash: planHash,
          processados: validatedItems.length,
          novos: plan.toInsert.length,
          ignorados: plan.ignored,
          itensIgnorados: plan.ignoredItems,
          linhasArquivo: parsed.rows.length,
          saldosZero: validatedItems.filter(item => item.quantity === 0).length,
          localizacoesPadrao: validatedItems.filter(item => item.locationDefaulted).length,
          prateleiras: [...new Set(validatedItems.flatMap(item => (item.locations && item.locations.length > 0 ? item.locations.map(l => l.locationName) : [item.locationName])))].filter(Boolean).sort(),
          codificacao: parsed.encoding,
          itens: previewItems,
          totalItens: validatedItems.length,
          itensLimitados: validatedItems.length > previewLimit,
        });
      }

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
      if (error instanceof ImportValidationError) {
        return res.status(422).json({ error: error.message, errors: error.errors, totalErrors: error.errors.length });
      }
      console.error('Erro na importação do CSV:', error);
      return res.status(500).json({ error: 'Erro interno ao processar a planilha CSV.' });
    }
  }
}
