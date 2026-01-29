import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ARQUIVO_BANCO = 'db.json';

async function corrigirBanco() {
  try {
    console.log('🔧 Iniciando correção do banco de dados...');

    const caminhoBanco = path.join(__dirname, ARQUIVO_BANCO);
    if (!fs.existsSync(caminhoBanco)) throw new Error('db.json não encontrado!');

    const dados = JSON.parse(fs.readFileSync(caminhoBanco, 'utf8'));

    // Garante que a estrutura existe
    if (!dados.materials) dados.materials = [];

    console.log(`📄 Analisando ${dados.materials.length} materiais...`);

    let corrigidos = 0;

    // Percorre cada material e arruma os nomes
    dados.materials = dados.materials.map((item, index) => {
      // Cria um novo objeto com a estrutura CERTA
      const novoItem = {
        id: item.id || String(Date.now() + index),
        
        // Se tiver 'codigo', usa. Se não, tenta pegar do item.codigo antigo
        codigo: String(item.codigo || 'SEM-COD'), 
        
        // AQUI É A CORREÇÃO PRINCIPAL:
        // Se 'descricao' estiver vazia, pega de 'material' ou 'name' ou 'nome'
        descricao: item.descricao || item.material || item.name || item.nome || 'Sem descrição',
        
        tipo: item.tipo || 'outro',
        
        // Garante que é número
        quantidade: Number(item.quantidade || item.qtd || 0),
        
        // Pega 'unidade' ou 'medida'
        unidade: item.unidade || item.medida || 'un',
        
        localizacao: item.localizacao || 'Estoque Geral',
        observacoes: item.observacoes || 'Corrigido via script'
      };
      
      corrigidos++;
      return novoItem;
    });

    // Salva o arquivo corrigido
    fs.writeFileSync(caminhoBanco, JSON.stringify(dados, null, 2));

    console.log('------------------------------------------------');
    console.log(`✅ SUCESSO! ${corrigidos} materiais foram corrigidos.`);
    console.log('------------------------------------------------');

  } catch (erro) {
    console.error('❌ Erro:', erro.message);
  }
}

corrigirBanco();