import { Request, Response } from 'express';
import { prisma } from '../prisma';

const UNIDADES_VALIDAS = new Set(['M2', 'M', 'UN', 'KG', 'PAR', 'CX', 'RL', 'G', 'UND', 'M²', 'CM', 'L', 'ROLO']);

interface ParsedItem {
  sector: 'CORTE' | 'APOIO' | 'PRE_FABRICADO' | 'EXPEDICAO' | 'MONTAGEM' | 'CONSUMO';
  code: string;
  name: string;
  unit: string;
  type: string;
  quantity: number;
  color?: string;
  sizeGrade?: string;
  footSide?: 'E' | 'D' | null;
  observation?: string;
}

function normalizeSector(rawSector: string | undefined, defaultSector: string = 'CORTE'): 'CORTE' | 'APOIO' | 'PRE_FABRICADO' | 'EXPEDICAO' | 'MONTAGEM' | 'CONSUMO' {
  if (!rawSector) rawSector = defaultSector;
  const sec = rawSector.toUpperCase().trim();
  if (sec === 'CABEDAIS' || sec === 'EXPEDICAO') return 'EXPEDICAO';
  if (sec === 'PRE_FABRICADO' || sec === 'PRE-FABRICADO' || sec === 'SOLAS' || sec === 'SOLA') return 'PRE_FABRICADO';
  if (sec === 'MONTAGEM' || sec === 'PES_ORFAOS') return 'MONTAGEM';
  if (sec === 'APOIO' || sec === 'MOLDES') return 'APOIO';
  if (sec === 'CONSUMO' || sec === 'INSUMOS') return 'CONSUMO';
  return 'CORTE';
}

function normalizeFootSide(rawSide: string | undefined): 'E' | 'D' | 'PAR' | null {
  if (!rawSide) return null;
  const side = rawSide.toUpperCase().trim();
  if (side === 'E' || side === 'ESQ' || side === 'ESQUERDO') return 'E';
  if (side === 'D' || side === 'DIR' || side === 'DIREITO') return 'D';
  if (side === 'PAR' || side === 'PARES' || side === 'AMBOS') return 'PAR';
  return null;
}

function parseCSV(buffer: Buffer, defaultSector: string = 'CORTE'): { items: ParsedItem[]; errorMsg?: string } {
  let text = buffer.toString('utf-8');
  if (text.charCodeAt(0) === 0xFEFF) {
    text = text.slice(1);
  }
  text = text.replace(/\r/g, '');

  const lines = text.split('\n').filter(l => l.trim() !== '');

  if (lines.length < 2) {
    return {
      items: [],
      errorMsg: 'O arquivo CSV está vazio ou contém apenas o cabeçalho. Por favor, envie uma planilha com dados.'
    };
  }

  const headerLine = lines[0];
  const delimiter = headerLine.includes(';') ? ';' : (headerLine.includes('\t') ? '\t' : ',');
  const headerCols = headerLine.split(delimiter).map(c => c.replace(/"/g, '').trim().toLowerCase());

  const sectorIdx = headerCols.findIndex(c => c === 'setor' || c === 'sector' || c === 'área' || c === 'area');
  const codeIdx = headerCols.findIndex(c => c === 'codigo' || c === 'código' || c === 'code' || c === 'sku' || c === 'id_produto' || c === 'produto' || c === 'cod_peca');
  const descIdx = headerCols.findIndex(c => c === 'descricao' || c === 'descrição' || c === 'name' || c === 'nome' || c === 'material' || c === 'modelo' || c === 'nomemodelo');
  const catIdx = headerCols.findIndex(c => c === 'categoria' || c === 'type' || c === 'tipo');
  const unitIdx = headerCols.findIndex(c => c === 'unidade' || c === 'unit' || c === 'um');
  const qtdIdx = headerCols.findIndex(c => c === 'quantidade' || c === 'quantity' || c === 'estoque' || c === 'saldo' || c === 'qtd');
  const colorIdx = headerCols.findIndex(c => c === 'cor' || c === 'color' || c === 'materialcor');
  const sizeIdx = headerCols.findIndex(c => c === 'grade' || c === 'tamanho' || c === 'sizegrade' || c === 'num' || c === 'numeracao');
  const sideIdx = headerCols.findIndex(c => c === 'lado' || c === 'footside' || c === 'lado_pe' || c === 'pe');
  const obsIdx = headerCols.findIndex(c => c === 'observacao' || c === 'obs' || c === 'observation');

  if (codeIdx !== -1 && descIdx !== -1) {
    const items: ParsedItem[] = [];

    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(delimiter).map(c => c.replace(/"/g, '').trim());
      
      const codigo = (row[codeIdx] ?? '').toUpperCase();
      const descricao = (row[descIdx] ?? '').toUpperCase();

      if (!codigo || !descricao) continue;

      const itemSector = normalizeSector(sectorIdx !== -1 ? row[sectorIdx] : undefined, defaultSector);

      let unit = unitIdx !== -1 && row[unitIdx] ? row[unitIdx].toUpperCase() : 'UN';
      if (unit === 'UND') unit = 'UN';

      const type = catIdx !== -1 && row[catIdx] ? row[catIdx].toUpperCase() : 'GERAL';
      
      let quantity = 0;
      if (qtdIdx !== -1 && row[qtdIdx]) {
        const rawQtd = row[qtdIdx].replace(/\./g, '').replace(',', '.');
        quantity = Number(rawQtd) || 0;
      }

      const color = colorIdx !== -1 && row[colorIdx] ? row[colorIdx].toUpperCase() : undefined;
      const sizeGrade = sizeIdx !== -1 && row[sizeIdx] ? row[sizeIdx].toUpperCase() : undefined;
      const parsedSide = sideIdx !== -1 ? normalizeFootSide(row[sideIdx]) : null;
      const observation = obsIdx !== -1 && row[obsIdx] ? row[obsIdx] : undefined;

      // Desmembramento inteligente de PAR para calçados
      if (parsedSide === 'PAR' && (itemSector === 'MONTAGEM' || itemSector === 'EXPEDICAO' || itemSector === 'PRE_FABRICADO')) {
        items.push({
          sector: itemSector,
          code: codigo,
          name: descricao,
          unit,
          type,
          quantity,
          color,
          sizeGrade,
          footSide: 'E',
          observation,
        });
        items.push({
          sector: itemSector,
          code: codigo,
          name: descricao,
          unit,
          type,
          quantity,
          color,
          sizeGrade,
          footSide: 'D',
          observation,
        });
      } else {
        items.push({
          sector: itemSector,
          code: codigo,
          name: descricao,
          unit,
          type,
          quantity,
          color,
          sizeGrade,
          footSide: parsedSide === 'E' || parsedSide === 'D' ? parsedSide : null,
          observation,
        });
      }
    }

    if (items.length > 0) {
      return { items };
    }
  }

  // Compatibilidade com o CSV legado de materiais de corte dublados.
  if (headerCols.length >= 35) {
    const nDescCols = headerCols.length >= 40 ? 4 : 3;
    const items: ParsedItem[] = [];

    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(',');
      const N = row.length;

      const codigo = row[5]?.trim().toUpperCase() ?? '';
      if (!codigo || !/^\d+$/.test(codigo)) continue;

      const frags = row.slice(6, 6 + nDescCols).map(s => s.trim());
      const descricao = frags.join(',').replace(/,$/, '').trim().toUpperCase();

      if (!descricao) continue;

      let unit = 'M2';
      for (let j = N - 1; j > 5; j--) {
        const val = row[j]?.trim().toUpperCase() ?? '';
        if (UNIDADES_VALIDAS.has(val)) {
          unit = val;
          break;
        }
      }

      const descUpper = descricao.toUpperCase();
      let type = 'SINTETICO';
      if (descUpper.startsWith('TECIDO')) type = 'TECIDO';
      else if (descUpper.startsWith('FORRO')) type = 'FORRO';
      else if (descUpper.startsWith('COURO')) type = 'COURO';
      else if (descUpper.startsWith('FILME')) type = 'FILME';
      else if (descUpper.startsWith('EVA')) type = 'EVA';
      else if (descUpper.startsWith('ESPUMA')) type = 'ESPUMA';

      items.push({
        sector: 'CORTE',
        code: codigo,
        name: descricao,
        unit,
        type,
        quantity: 0,
      });
    }

    if (items.length > 0) {
      return { items };
    }
  }

  return {
    items: [],
    errorMsg: "Formato de CSV não reconhecido. As colunas obrigatórias 'codigo' e 'descricao' não foram encontradas. Por favor, baixe e utilize o modelo de exemplo disponível no sistema."
  };
}

export class ImportController {
  async importCSV(req: Request, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo CSV foi enviado. Selecione um arquivo .csv.' });
      }

      if (!req.file.originalname.toLowerCase().endsWith('.csv')) {
        return res.status(400).json({ error: 'Formato de arquivo inválido. Apenas arquivos no formato .csv são aceitos.' });
      }

      const defaultSector = String(req.body.sector || req.query.sector || req.user?.assignedSector || 'CORTE').toUpperCase().trim();
      const { items, errorMsg } = parseCSV(req.file.buffer, defaultSector);

      if (errorMsg || items.length === 0) {
        return res.status(422).json({
          error: errorMsg || 'Nenhum item válido foi encontrado na planilha enviada. Verifique os dados e tente novamente.'
        });
      }

      const factoryUnitId = req.tenant!.id;
      const corteItems = items.filter(it => it.sector === 'CORTE');
      const stockItems = items.filter(it => it.sector !== 'CORTE');

      let insertedCount = 0;

      // 1. Inserção de Materiais do setor CORTE
      if (corteItems.length > 0) {
        const corteResult = await prisma.material.createMany({
          data: corteItems.map(m => ({
            factoryUnitId,
            code: m.code,
            name: m.name,
            quantity: m.quantity,
            unit: m.unit,
            type: m.type,
            observation: m.observation || 'Importado via planilha de materiais CSV',
          })),
          skipDuplicates: true,
        });
        insertedCount += corteResult.count;
      }

      // 2. Inserção de Itens Multi-Setor (APOIO, PRE_FABRICADO, EXPEDICAO, MONTAGEM, CONSUMO)
      if (stockItems.length > 0) {
        const stockData = stockItems.map(s => {
          let pieceCode: string | null = null;
          let description: string | null = null;
          let productName: string | null = null;
          let sku: string | null = null;
          let name: string | null = null;

          if (s.sector === 'APOIO') {
            pieceCode = s.code;
            description = s.name;
          } else if (s.sector === 'PRE_FABRICADO') {
            productName = s.name;
            sku = s.code;
          } else if (s.sector === 'EXPEDICAO' || s.sector === 'MONTAGEM') {
            sku = s.code;
            productName = s.name;
          } else {
            name = s.name;
            sku = s.code;
          }

          return {
            factoryUnitId,
            sector: s.sector,
            quantity: s.quantity,
            unit: s.unit,
            type: s.type,
            code: s.code,
            name: name || s.name,
            pieceCode,
            description: description || s.name,
            productName: productName || s.name,
            sku: sku || s.code,
            color: s.color || null,
            sizeGrade: s.sizeGrade || null,
            footSide: s.footSide || null,
            observation: s.observation || 'Importado via planilha de componentes CSV',
          };
        });

        const stockResult = await prisma.stockItem.createMany({
          data: stockData,
          skipDuplicates: true,
        });
        insertedCount += stockResult.count;
      }

      return res.status(201).json({
        message: 'Importação multi-setor concluída com sucesso.',
        inseridos: insertedCount,
        processados: items.length,
        ignorados: items.length - insertedCount,
      });

    } catch (error: unknown) {
      console.error('Erro na importação do CSV:', error);
      return res.status(500).json({ error: 'Erro interno ao processar a planilha CSV.' });
    }
  }
}
