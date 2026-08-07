import { Request, Response } from 'express';
import { prisma } from '../prisma';

// ============================================================
// UNIDADES VÁLIDAS para validação no CSV
// ============================================================
const UNIDADES_VALIDAS = new Set(['M2', 'M', 'UN', 'KG', 'PAR', 'CX', 'RL', 'G', 'UND', 'M²', 'CM', 'L', 'ROLO']);

interface ParsedMaterial {
  code: string;
  name: string;
  unit: string;
  type: string;
  quantity: number;
}

// ============================================================
// PARSER INTELIGENTE DE CSV (PADRÃO SOBRACORTE + LEGADO DUBLADO)
// ============================================================
function parseCSV(buffer: Buffer): { items: ParsedMaterial[]; errorMsg?: string } {
  // Remove BOM UTF-8 se presente e normaliza quebras de linha
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

  // Detecta delimitador (, ou ;)
  const headerLine = lines[0];
  const delimiter = headerLine.includes(';') ? ';' : ',';
  const headerCols = headerLine.split(delimiter).map(c => c.replace(/"/g, '').trim().toLowerCase());

  // 1. VERIFICA SE É O PADRÃO MODELO SOBRACORTE
  const codeIdx = headerCols.findIndex(c => c === 'codigo' || c === 'código' || c === 'code' || c === 'id_produto' || c === 'produto');
  const descIdx = headerCols.findIndex(c => c === 'descricao' || c === 'descrição' || c === 'name' || c === 'nome' || c === 'material');
  const catIdx = headerCols.findIndex(c => c === 'categoria' || c === 'type' || c === 'tipo');
  const unitIdx = headerCols.findIndex(c => c === 'unidade' || c === 'unit' || c === 'um');
  const qtdIdx = headerCols.findIndex(c => c === 'quantidade' || c === 'quantity' || c === 'estoque' || c === 'saldo');

  // Se encontrou as colunas essenciais do padrão modelo
  if (codeIdx !== -1 && descIdx !== -1) {
    const vistos = new Map<string, ParsedMaterial>();

    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(delimiter).map(c => c.replace(/"/g, '').trim());
      
      const codigo = row[codeIdx] ?? '';
      const descricao = (row[descIdx] ?? '').toUpperCase();

      if (!codigo || !descricao) continue;
      if (vistos.has(codigo)) continue; // deduplica pelo código

      let unit = unitIdx !== -1 && row[unitIdx] ? row[unitIdx].toUpperCase() : 'UN';
      if (unit === 'UND') unit = 'UN';

      let type = catIdx !== -1 && row[catIdx] ? row[catIdx].toUpperCase() : 'GERAL';
      
      let quantity = 0;
      if (qtdIdx !== -1 && row[qtdIdx]) {
        let rawQtd = row[qtdIdx].replace(/\./g, '').replace(',', '.');
        quantity = Number(rawQtd) || 0;
      }

      vistos.set(codigo, {
        code: codigo,
        name: descricao,
        unit: unit,
        type: type,
        quantity: quantity
      });
    }

    const result = Array.from(vistos.values());
    if (result.length > 0) {
      return { items: result };
    }
  }

  // 2. MODO LEGADO (CSV DE MATERIAIS DUBLADOS DASS - FILA / NIKE)
  if (headerCols.length >= 35) {
    const nDescCols = headerCols.length >= 40 ? 4 : 3;
    const vistos = new Map<string, ParsedMaterial>();

    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(',');
      const N = row.length;

      const codigo = row[5]?.trim() ?? '';
      if (!codigo || !/^\d+$/.test(codigo)) continue;
      if (vistos.has(codigo)) continue;

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

      vistos.set(codigo, { code: codigo, name: descricao, unit, type, quantity: 0 });
    }

    const result = Array.from(vistos.values());
    if (result.length > 0) {
      return { items: result };
    }
  }

  // 3. FALHA DE FORMATO EXPLICITADA
  return {
    items: [],
    errorMsg: "Formato de CSV não reconhecido. As colunas obrigatórias 'codigo' e 'descricao' não foram encontradas. Por favor, baixe e utilize o modelo de exemplo disponível no sistema."
  };
}

// ============================================================
// CONTROLLER DE IMPORTAÇÃO
// ============================================================
export class ImportController {

  // POST /import/csv  (multipart/form-data, campo: "arquivo")
  async importCSV(req: Request, res: Response) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo CSV foi enviado. Selecione um arquivo .csv.' });
      }

      if (!req.file.originalname.toLowerCase().endsWith('.csv')) {
        return res.status(400).json({ error: 'Formato de arquivo inválido. Apenas arquivos no formato .csv são aceitos.' });
      }

      // Extrai os materiais únicos do CSV
      const { items: materiais, errorMsg } = parseCSV(req.file.buffer);

      if (errorMsg || materiais.length === 0) {
        return res.status(422).json({
          error: errorMsg || 'Nenhum material válido foi encontrado na planilha enviada. Verifique os dados e tente novamente.'
        });
      }

      // Insere em lote no banco, ignorando duplicatas pelo campo "code" (UNIQUE)
      const result = await prisma.material.createMany({
        data: materiais.map(m => ({
          code: m.code,
          name: m.name,
          quantity: m.quantity,
          unit: m.unit,
          type: m.type,
          observation: 'Importado via planilha de materiais CSV',
        })),
        skipDuplicates: true,   // ON CONFLICT DO NOTHING — não quebra se já existir
      });

      return res.status(201).json({
        message: 'Importação concluída com sucesso.',
        inseridos: result.count,
        processados: materiais.length,
        ignorados: materiais.length - result.count,
      });

    } catch (error: any) {
      console.error('Erro na importação do CSV:', error);
      return res.status(500).json({ error: 'Erro interno ao processar a planilha CSV.' });
    }
  }
}
