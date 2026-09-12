import { Request, Response } from 'express';
import { readFile, unlink } from 'node:fs/promises';
import { ImportValidationError, csvRowsToImportInput, importMaterials } from '../import/materialImport';
import { parseCSV } from '../import/csvParser';

export class ImportController {
  async importCSV(req: Request, res: Response) {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo CSV foi enviado. Selecione um arquivo .csv.' });
    }
    try {
      if (!req.file.originalname.toLowerCase().endsWith('.csv')) {
        return res.status(400).json({ error: 'Formato de arquivo inválido. Apenas arquivos no formato .csv são aceitos.' });
      }
      const parsed = parseCSV(await readFile(req.file.path));
      if (parsed.errors.length || parsed.rows.length === 0) {
        return res.status(422).json({
          error: 'O arquivo CSV contém dados inválidos. Nenhuma alteração foi aplicada.',
          errors: parsed.errors,
        });
      }
      const result = await importMaterials(req.tenant!.id, csvRowsToImportInput(parsed.rows), req.user);
      return res.status(201).json({ message: 'Importação concluída com sucesso.', ...result, ignorados: 0 });
    } catch (error) {
      if (error instanceof ImportValidationError) {
        return res.status(422).json({ error: error.message, errors: error.errors });
      }
      console.error('Erro na importação do CSV:', error);
      return res.status(500).json({ error: 'Erro interno ao processar a planilha CSV.' });
    } finally {
      await unlink(req.file.path).catch(() => undefined);
    }
  }
}
