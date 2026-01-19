import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Nomes exatos dos seus arquivos
const ARQUIVO_ORIGEM = 'tableConvert.com_zlir85.json'; 
const ARQUIVO_DESTINO = 'db.json';

async function recuperarEImportar() {
  try {
    console.log('🔧 Lendo arquivo de origem...');

    const caminhoOrigem = path.join(__dirname, ARQUIVO_ORIGEM);
    if (!fs.existsSync(caminhoOrigem)) throw new Error('Arquivo de origem não encontrado!');
    
    const dadosBrutos = fs.readFileSync(caminhoOrigem, 'utf8');
    const novosItens = JSON.parse(dadosBrutos);

    console.log(`📄 Encontrados ${novosItens.length} itens.`);

    // Estrutura limpa do banco
    const bancoNovo = {
      "users": [{
        "id": "1",
        "nome": "Hellen Admin",
        "email": "admin@sobracorte.com",
        "password": "123",
        "role": "admin"
      }],
      "materials": [],
      "movements": []
    };

    // AQUI É A CORREÇÃO: Mapeia "material" para "descricao"
    novosItens.forEach((item, index) => {
      bancoNovo.materials.push({
        id: String(Date.now() + index),
        // Pega 'codigo' do seu arquivo ou cria um
        codigo: String(item.codigo || 'SEM-COD'), 
        // Pega 'material' do seu arquivo e salva como 'descricao'
        descricao: item.material || 'Sem descrição', 
        tipo: 'outro',
        quantidade: 0,
        // Pega 'medida' do seu arquivo e salva como 'unidade'
        unidade: item.medida || 'un', 
        localizacao: 'Estoque Geral',
        observacoes: 'Importado via script'
      });
    });

    const caminhoDestino = path.join(__dirname, ARQUIVO_DESTINO);
    fs.writeFileSync(caminhoDestino, JSON.stringify(bancoNovo, null, 2));

    console.log(`✅ SUCESSO! ${novosItens.length} materiais importados com as descrições corretas.`);

  } catch (erro) {
    console.error('❌ Erro:', erro.message);
  }
}

recuperarEImportar();