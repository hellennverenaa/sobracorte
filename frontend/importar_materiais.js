import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Nomes dos arquivos
const ARQUIVO_NOVOS_DADOS = 'tableConvert.com_zlir85.json';
const ARQUIVO_BANCO = 'db.json';

async function importar() {
  try {
    console.log('📦 Iniciando importação...');

    // 1. Ler o arquivo grande (Seu JSON novo)
    const caminhoOrigem = path.join(__dirname, ARQUIVO_NOVOS_DADOS);
    if (!fs.existsSync(caminhoOrigem)) {
      throw new Error(`O arquivo ${ARQUIVO_NOVOS_DADOS} não foi encontrado na pasta!`);
    }
    const dadosBrutos = fs.readFileSync(caminhoOrigem, 'utf8');
    const novosItens = JSON.parse(dadosBrutos);

    // 2. Ler o banco de dados atual
    const caminhoDestino = path.join(__dirname, ARQUIVO_BANCO);
    const dadosBanco = JSON.parse(fs.readFileSync(caminhoDestino, 'utf8'));

    console.log(`📄 Lendo ${novosItens.length} itens do arquivo novo...`);

    // 3. Converter e Adicionar
    let contador = 0;
    
    novosItens.forEach(item => {
      // Cria o objeto no formato que o sistema SobraCorte aceita
      const novoMaterial = {
        id: String(Date.now() + Math.random()), // Gera ID único
        codigo: String(item.codigo),            // Garante que é texto
        descricao: item.material,               // Mapeia "material" -> "descricao"
        tipo: 'outro',                          // Define padrão (pode editar depois)
        quantidade: 0,                          // Começa zerado para dar entrada depois
        unidade: item.medida || 'un',           // Mapeia "medida" -> "unidade"
        localizacao: 'Estoque Geral',           // Local padrão
        observacoes: 'Importado automaticamente'
      };

      dadosBanco.materials.push(novoMaterial);
      contador++;
    });

    // 4. Salvar no db.json
    fs.writeFileSync(caminhoDestino, JSON.stringify(dadosBanco, null, 2));

    console.log('------------------------------------------------');
    console.log(`✅ SUCESSO! ${contador} materiais foram importados.`);
    console.log('🚀 Reinicie o comando "npm run db" para ver a lista no site.');
    console.log('------------------------------------------------');

  } catch (erro) {
    console.error('❌ Erro:', erro.message);
  }
}

importar();