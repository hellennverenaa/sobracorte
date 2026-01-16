import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Configuração para ler arquivos em módulos ES
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- CONFIGURAÇÃO ---
const ARQUIVO_ORIGEM = 'novos_dados.json'; // Nome do seu arquivo grande
const ARQUIVO_DESTINO = 'db.json';         // O banco de dados do sistema

async function importarDados() {
  try {
    console.log('📦 Lendo arquivos...');
    
    // 1. Ler o banco atual
    const dbPath = path.join(__dirname, ARQUIVO_DESTINO);
    const dbData = JSON.parse(fs.readFileSync(dbPath, 'utf8'));

    // 2. Ler os dados novos
    const origemPath = path.join(__dirname, ARQUIVO_ORIGEM);
    if (!fs.existsSync(origemPath)) {
      throw new Error(`Arquivo ${ARQUIVO_ORIGEM} não encontrado!`);
    }
    const novosDados = JSON.parse(fs.readFileSync(origemPath, 'utf8'));

    // Verifica se os dados novos são uma lista (Array) ou um Objeto
    // Se for um objeto com uma propriedade (ex: { "produtos": [...] }), ajuste aqui
    const listaParaImportar = Array.isArray(novosDados) ? novosDados : (novosDados.data || []);

    console.log(`🔍 Encontrados ${listaParaImportar.length} itens para importar.`);

    // 3. Converter e Adicionar
    let importados = 0;
    
    listaParaImportar.forEach(item => {
      // AQUI É A MÁGICA: Mapeie os campos do seu arquivo para o sistema
      // Esquerda: Campos do Sistema | Direita: Campos do seu arquivo
      const novoMaterial = {
        id: String(Date.now() + Math.random()), // Gera ID único
        
        // Se o seu arquivo tiver nomes diferentes, mude o que está depois do ||
        codigo: item.codigo || item.code || item.id || 'SEM-COD',
        descricao: item.descricao || item.name || item.nome || 'Sem descrição',
        tipo: validarTipo(item.tipo || item.type),
        quantidade: Number(item.quantidade || item.qtd || item.amount || 0),
        unidade: item.unidade || item.unit || 'unidade',
        localizacao: item.localizacao || item.local || 'Estoque Geral',
        observacoes: item.observacoes || ''
      };

      dbData.materials.push(novoMaterial);
      importados++;
    });

    // 4. Salvar
    fs.writeFileSync(dbPath, JSON.stringify(dbData, null, 2));
    
    console.log(`✅ Sucesso! ${importados} materiais foram adicionados ao db.json.`);
    console.log('🚀 Reinicie o comando "npm run db" para ver as mudanças.');

  } catch (erro) {
    console.error('❌ Erro na importação:', erro.message);
  }
}

// Função auxiliar para garantir que o tipo seja válido
function validarTipo(tipo) {
  const tiposValidos = ['madeira', 'chapa_metalica', 'plastico', 'vidro', 'outro'];
  // Tenta achar o tipo, se não achar, define como 'outro'
  if (tiposValidos.includes(tipo)) return tipo;
  return 'outro';
}

importarDados();