import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ARQUIVO_ORIGEM = 'tableConvert.com_zlir85.json';
const ARQUIVO_DESTINO = 'db.json';

async function recuperarEImportar() {
  try {
    console.log('🔧 Iniciando recuperação do banco de dados...');

    // 1. Tenta ler o arquivo de materiais novos
    const caminhoOrigem = path.join(__dirname, ARQUIVO_ORIGEM);
    if (!fs.existsSync(caminhoOrigem)) {
      throw new Error(`O arquivo ${ARQUIVO_ORIGEM} não existe! Verifique o nome.`);
    }
    
    const conteudoOrigem = fs.readFileSync(caminhoOrigem, 'utf8');
    if (!conteudoOrigem.trim()) {
      throw new Error(`O arquivo ${ARQUIVO_ORIGEM} está vazio!`);
    }
    
    const novosItens = JSON.parse(conteudoOrigem);
    console.log(`📄 Arquivo de origem lido com sucesso: ${novosItens.length} materiais encontrados.`);

    // 2. Recria a estrutura padrão do banco (Salva se o db.json estiver corrompido)
    const bancoNovo = {
      "users": [
        {
          "id": "1",
          "nome": "Hellen Admin",
          "email": "admin@sobracorte.com",
          "password": "123",
          "role": "admin"
        }
      ],
      "materials": [],
      "movements": []
    };

    // 3. Importa os materiais para a estrutura nova
    console.log('🔄 Processando materiais...');
    
    novosItens.forEach((item, index) => {
      bancoNovo.materials.push({
        id: String(Date.now() + index), // Garante ID único
        codigo: String(item.codigo || 'SEM-COD'),
        descricao: item.material || 'Sem descrição',
        tipo: 'outro',
        quantidade: 0,
        unidade: item.medida || 'un',
        localizacao: 'Estoque Geral',
        observacoes: 'Importado recuperado'
      });
    });

    // 4. Salva o arquivo db.json novo (Sobrescreve o corrompido)
    const caminhoDestino = path.join(__dirname, ARQUIVO_DESTINO);
    fs.writeFileSync(caminhoDestino, JSON.stringify(bancoNovo, null, 2));

    console.log('------------------------------------------------');
    console.log(`✅ SUCESSO! Banco de dados recriado e ${novosItens.length} materiais importados.`);
    console.log('------------------------------------------------');

  } catch (erro) {
    console.error('❌ CRÍTICO:', erro.message);
  }
}

recuperarEImportar();