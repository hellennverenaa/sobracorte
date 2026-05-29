import { Request, Response } from 'express';
import { prisma } from '../prisma';

// ============================================================
// UNIDADES VÁLIDAS para busca reversa no CSV
// ============================================================
const UNIDADES_VALIDAS = new Set(['M2', 'M', 'UN', 'KG', 'PAR', 'CX', 'RL', 'G', 'UND', 'M²']);

// ============================================================
// ALGORITMO DE EXTRAÇÃO DO CSV DE MATERIAIS DUBLADOS
//
// CONTEXTO: Os CSVs de FILA e NIKE não usam aspas nos campos.
// As descrições dos materiais contêm vírgulas decimais (ex: "1,4MM")
// que o parser CSV interpreta como separadores, fragmentando o nome
// em múltiplas colunas. A solução é detectar o layout pelo número
// de colunas do header e reconstruir a descrição manualmente.
//
// Layout FILA (40 colunas no header): descrição em col[6..9] → 4 fragmentos
// Layout NIKE (37 colunas no header): descrição em col[6..8] → 3 fragmentos
//
// Resultado validado:
//   FILA → 315 materiais únicos de 1190 linhas
//   NIKE → 583 materiais únicos de 8718 linhas
// ============================================================
function parseDubladoCSV(buffer: Buffer): Array<{ code: string; name: string; unit: string; type: string }> {
  const text = buffer.toString('utf-8').replace(/\r/g, '');
  const lines = text.split('\n').filter(l => l.trim() !== '');

  if (lines.length < 2) return [];

  // Detecta o layout pelo número de colunas do header
  const headerCols = lines[0].split(',').length;
  // FILA tem 40 colunas (inclui CORTE e SUBLIMACAO), NIKE tem 37.
  // A diferença define quantos fragmentos a descrição ocupa:
  const nDescCols = headerCols >= 40 ? 4 : 3;

  const vistos = new Map<string, { code: string; name: string; unit: string; type: string }>();

  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',');
    const N = row.length;

    // Coluna 5 = Produto (código numérico sempre)
    const codigo = row[5]?.trim() ?? '';
    if (!codigo || !/^\d+$/.test(codigo)) continue; // ignora cabeçalhos secundários e linhas inválidas
    if (vistos.has(codigo)) continue;                // deduplica: um código = um material

    // Reconstrói a descrição concatenando os N fragmentos com vírgula
    const frags = row.slice(6, 6 + nDescCols).map(s => s.trim());
    const descricao = frags.join(',').replace(/,$/, '').trim().toUpperCase();

    if (!descricao) continue;

    // Busca a unidade de trás para frente (primeiro valor que seja uma unidade válida)
    let unit = 'M2';
    for (let j = N - 1; j > 5; j--) {
      const val = row[j]?.trim().toUpperCase() ?? '';
      if (UNIDADES_VALIDAS.has(val)) {
        unit = val;
        break;
      }
    }

    // Infere o tipo baseado no início da descrição
    // Os materiais dublados são majoritariamente SINTETICO, PU, FORRO, TECIDO
    const descUpper = descricao.toUpperCase();
    let type = 'SINTETICO';
    if (descUpper.startsWith('TECIDO')) type = 'TECIDO';
    else if (descUpper.startsWith('FORRO')) type = 'FORRO';
    else if (descUpper.startsWith('COURO')) type = 'COURO';
    else if (descUpper.startsWith('FILME')) type = 'FILME';
    else if (descUpper.startsWith('EVA')) type = 'EVA';
    else if (descUpper.startsWith('ESPUMA')) type = 'ESPUMA';

    vistos.set(codigo, { code: codigo, name: descricao, unit, type });
  }

  return Array.from(vistos.values());
}

// ============================================================
// CONTROLLER DE IMPORTAÇÃO
// ============================================================
export class ImportController {

  // POST /import/csv  (multipart/form-data, campo: "arquivo")
  async importCSV(req: Request, res: Response) {
    try {
      // O multer injeta o arquivo em req.file (memoryStorage)
      if (!req.file) {
        return res.status(400).json({ error: 'Nenhum arquivo CSV foi enviado. Use o campo "arquivo".' });
      }

      if (!req.file.originalname.toLowerCase().endsWith('.csv')) {
        return res.status(400).json({ error: 'Apenas arquivos .csv são aceitos.' });
      }

      // Extrai os materiais únicos do CSV
      const materiais = parseDubladoCSV(req.file.buffer);

      if (materiais.length === 0) {
        return res.status(422).json({
          error: 'Nenhum material válido encontrado no CSV. Verifique o formato do arquivo.'
        });
      }

      // Insere em lote no banco, ignorando duplicatas pelo campo "code" (UNIQUE)
      const result = await prisma.material.createMany({
        data: materiais.map(m => ({
          code: m.code,
          name: m.name,
          quantity: 0,          // Saldo começa em zero — a entrada é feita via movimentação
          unit: m.unit,
          type: m.type,
          observation: 'Importado via planilha de materiais dublados',
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
      return res.status(500).json({ error: 'Erro interno ao processar o CSV.' });
    }
  }
}
