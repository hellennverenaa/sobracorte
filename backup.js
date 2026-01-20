import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Configuração para ES Modules (já que seu projeto usa "type": "module")
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const source = path.join(__dirname, 'db.json');
const backupDir = path.join(__dirname, 'backups');

// 1. Cria a pasta de backups se não existir
if (!fs.existsSync(backupDir)){
    fs.mkdirSync(backupDir);
}

// 2. Gera o nome do arquivo com Data e Hora (ex: db-2023-10-27-1430.json)
const date = new Date();
const timestamp = date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
const dest = path.join(backupDir, `db-${timestamp}.json`);

// 3. Copia o arquivo
try {
    fs.copyFileSync(source, dest);
    console.log(`✅ Backup realizado com sucesso: ${dest}`);
    
    // Opcional: Limpeza (Mantém apenas os últimos 30 backups para não encher o HD)
    const files = fs.readdirSync(backupDir);
    if (files.length > 30) {
        const sortedFiles = files.sort((a, b) => {
            return fs.statSync(path.join(backupDir, a)).mtime.getTime() - 
                   fs.statSync(path.join(backupDir, b)).mtime.getTime();
        });
        // Deleta os mais antigos
        while (sortedFiles.length > 30) {
            const fileToDelete = sortedFiles.shift();
            fs.unlinkSync(path.join(backupDir, fileToDelete));
            console.log(`🗑️ Backup antigo removido: ${fileToDelete}`);
        }
    }

} catch (err) {
    console.error('❌ Erro ao fazer backup:', err);
}