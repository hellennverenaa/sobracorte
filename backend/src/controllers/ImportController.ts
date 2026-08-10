import { Request, Response } from 'express';
import { prisma } from '../prisma';

const UNIDADES_VALIDAS = new Set(['M2', 'M', 'UN', 'KG', 'PAR', 'CX', 'RL', 'G', 'UND', 'M²', 'CM', 'L', 'ROLO']);

interface ParsedMaterial {
  code: string;
  name: string;
  unit: string;
  type: string;
  quantity: number;
}

function parseCSV(buffer: Buffer): { items: ParsedMaterial[]; errorMsg?: string } {
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
  const delimiter = headerLine.includes(';') ? ';' : ',';
  const headerCols = headerLine.split(delimiter).map(c => c.replace(/"/g, '').trim().toLowerCase());

  const codeIdx = headerCols.findIndex(c => c === 'codigo' || c === 'código' || c === 'code' || c === 'id_produto' || c === 'produto');
  const descIdx = headerCols.findIndex(c => c === 'descricao' || c === 'descrição' || c === 'name' || c === 'nome' || c === 'material');
  const catIdx = headerCols.findIndex(c => c === 'categoria' || c === 'type' || c === 'tipo');
  const unitIdx = headerCols.findIndex(c => c === 'unidade' || c === 'unit' || c === 'um');
  const qtdIdx = headerCols.findIndex(c => c === 'quantidade' || c === 'quantity' || c === 'estoque' || c === 'saldo');

  if (codeIdx !== -1 && descIdx !== -1) {
    const vistos = new Map<string, ParsedMaterial>();

    for (let i = 1; i < lines.length; i++) {
      const row = lines[i].split(delimiter).map(c => c.replace(/"/g, '').trim());
      
      const codigo = row[codeIdx] ?? '';
      const descricao = (row[descIdx] ?? '').toUpperCase();

      if (!codigo || !descricao) continue;
      if (vistos.has(codigo)) continue;

      let unit = unitIdx !== -1 && row[unitIdx] ? row[unitIdx].toUpperCase() : 'UN';
      if (unit === 'UND') unit = 'UN';

      const type = catIdx !== -1 && row[catIdx] ? row[catIdx].toUpperCase() : 'GERAL';
      
      let quantity = 0;
      if (qtdIdx !== -1 && row[qtdIdx]) {
        const rawQtd = row[qtdIdx].replace(/\./g, '').replace(',', '.');
        quantity = Number(rawQtd) || 0;
      }

      vistos.set(codigo, {
        code: codigo,
        name: descricao,
        unit,
        type,
        quantity
      });
    }

    const result = Array.from(vistos.values());
    if (result.length > 0) {
      return { items: result };
    }
  }

  // Compatibilidade com o CSV legado de materiais dublados.
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

      const { items: materiais, errorMsg } = parseCSV(req.file.buffer);

      if (errorMsg || materiais.length === 0) {
        return res.status(422).json({
          error: errorMsg || 'Nenhum material válido foi encontrado na planilha enviada. Verifique os dados e tente novamente.'
        });
      }

      let inseridos = 0;
      let ignorados = 0;

      for (const item of materiais) {
        try {
          await prisma.$transaction(async (tx) => {
            let loc = await tx.location.findUnique({
              where: { factoryUnitId_name: { factoryUnitId: req.tenant!.id, name: 'GERAL' } },
            });
            if (!loc) {
              loc = await tx.location.create({ data: { name: 'GERAL', factoryUnitId: req.tenant!.id } });
            }

            const material = await tx.material.create({
              data: {
                factoryUnitId: req.tenant!.id,
                code: item.code,
                name: item.name,
                quantity: item.quantity,
                unit: item.unit,
                type: item.type,
                observation: 'Importado via planilha de materiais CSV',
                locations: { create: { locationId: loc.id, quantity: item.quantity } },
              },
            });

            if (item.quantity > 0) {
              await tx.movement.create({
                data: {
                  materialId: material.id,
                  factoryUnitId: req.tenant!.id,
                  type: 'entrada',
                  quantity: item.quantity,
                  reason: 'Saldo Inicial de Implantação',
                  operatorId: req.user?.matricula ? String(req.user.matricula) : null,
                  operatorName: req.user?.nome || req.user?.usuario || 'Sistema / Implantação',
                },
              });
            }
          });
          inseridos++;
        } catch (err: any) {
          if (err?.code === 'P2002') {
            ignorados++;
          } else {
            throw err;
          }
        }
      }

      return res.status(201).json({
        message: 'Importação concluída com sucesso.',
        inseridos,
        processados: materiais.length,
        ignorados,
      });

    } catch (error: unknown) {
      console.error('Erro na importação do CSV:', error);
      return res.status(500).json({ error: 'Erro interno ao processar a planilha CSV.' });
    }
  }
}
