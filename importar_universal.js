import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ARQUIVOS
const ARQUIVO_ORIGEM = 'tableConvert.com_zlir85.json'; 
const ARQUIVO_DESTINO = 'db.json';

async function importarUniversal() {
  try {
    console.log('🕵️  Iniciando Script Detetive...');
    
    const caminhoOrigem = path.join(__dirname, ARQUIVO_ORIGEM);
    if (!fs.existsSync(caminhoOrigem)) throw new Error('Arquivo não encontrado!');

    const conteudo = fs.readFileSync(caminhoOrigem, 'utf8');
    const dadosBrutos = JSON.parse(conteudo);
    
    let listaFinal = [];

    // --- FASE 1: INVESTIGAÇÃO ---
    if (Array.isArray(dadosBrutos)) {
      console.log('✅ Formato padrão detectado: Lista Direta [ ... ]');
      listaFinal = dadosBrutos;
    } else {
      console.log('⚠️ O arquivo é um Objeto. Procurando a lista escondida...');
      
      // Tenta achar qualquer chave que guarde uma lista (ex: "data", "Sheet1", "materials")
      const chaves = Object.keys(dadosBrutos);
      let achou = false;

      for (const chave of chaves) {
        if (Array.isArray(dadosBrutos[chave])) {
          console.log(`🎉 Lista encontrada dentro da pasta: "${chave}"`);
          listaFinal = dadosBrutos[chave];
          achou = true;
          break;
        }
      }

      // Se não achou em nenhuma chave, tenta ver se é um "Dicionário" (Object.values)
      if (!achou) {
        const valores = Object.values(dadosBrutos);
        // Verifica se os itens parecem materiais
        if (valores.some(v => v && (v.codigo || v.material || v.descricao))) {
           console.log('🎉 Formato detectado: Lista de Objetos indexados.');
           listaFinal = valores;
        } else {
           // Último recurso: é um item único mesmo
           console.log('⚠️ Nenhum padrão de lista encontrado. Importando como item único.');
           listaFinal = [dadosBrutos];
        }
      }
    }

    console.log(`📦 Preparando para importar ${listaFinal.length} itens...`);

    // --- FASE 2: IMPORTAÇÃO ---
    const bancoNovo = {
      "users": [
        { "id": "1", "nome": "Hellen Admin", "email": "admin@sobracorte.com", "password": "123", "role": "admin" }
      ],
      "materials": [],
      "movements": []
    };

    let sucesso = 0;

    listaFinal.forEach((item, index) => {
      if (!item) return; // Pula itens vazios

      // Tenta todas as variações de nomes possíveis
      const codigo = String(item.codigo || item.code || item.id || 'S/COD');
      const descricao = item.descricao || item.material || item.name || item.nome || item.product || 'Sem Descrição';
      const unidade = item.unidade || item.medida || item.unit || 'un';
      const quantidade = Number(item.quantidade || item.qtd || item.amount || 0);

      bancoNovo.materials.push({
        id: String(Date.now() + index),
        codigo,
        descricao,
        tipo: 'outro',
        quantidade,
        unidade,
        localizacao: 'Estoque Geral',
        observacoes: ''
      });
      sucesso++;
    });

    // Salva
    fs.writeFileSync(path.join(__dirname, ARQUIVO_DESTINO), JSON.stringify(bancoNovo, null, 2));
    
    console.log('---------------------------------------------------');
    console.log(`✅ MISSÃO CUMPRIDA! ${sucesso} materiais foram importados para o db.json.`);
    console.log('---------------------------------------------------');

  } catch (erro) {
    console.error('❌ OCORREU UM ERRO:', erro.message);
  }
}

importarUniversal();