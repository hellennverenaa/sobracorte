import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ARQUIVO_BANCO = 'db.json';

// --- REGRAS DE CLASSIFICAÇÃO (Ampliado) ---
const REGRAS = [
  // TECIDOS E TÊXTEIS
  { termo: 'TECIDO', categoria: 'tecido' },
  { termo: 'LONA', categoria: 'tecido' },
  { termo: 'MALHA', categoria: 'tecido' },
  { termo: 'MESH', categoria: 'tecido' },
  { termo: 'NYLON', categoria: 'tecido' },
  { termo: 'TEXTIL', categoria: 'tecido' },
  { termo: 'POLIESTER', categoria: 'tecido' },
  
  // COUROS E PELES
  { termo: 'COURO', categoria: 'couro' },
  { termo: 'CAMURCA', categoria: 'couro' },
  { termo: 'NOBUCK', categoria: 'couro' },
  { termo: 'RASPA', categoria: 'couro' },
  { termo: 'VACUM', categoria: 'couro' },
  
  // SINTÉTICOS
  { termo: 'SINTETICO', categoria: 'sintetico' },
  { termo: 'SINTÉTICO', categoria: 'sintetico' }, // Com acento
  { termo: 'PU ', categoria: 'sintetico' },
  { termo: 'PVC', categoria: 'sintetico' },
  { termo: 'LAMINADO', categoria: 'sintetico' },
  { termo: 'NAPA', categoria: 'sintetico' },
  { termo: 'MICROFIBRA', categoria: 'sintetico' },
  
  // FORROS
  { termo: 'FORRO', categoria: 'forro' },
  { termo: 'LINING', categoria: 'forro' }, // Termo em inglês comum na planilha
  
  // PALMILHAS E ESPUMAS
  { termo: 'EVA', categoria: 'palmilha' },
  { termo: 'ESPUMA', categoria: 'palmilha' },
  { termo: 'PALMILHA', categoria: 'palmilha' },
  { termo: 'CALCANHEIRA', categoria: 'palmilha' },
  
  // SOLADOS
  { termo: 'SOLA', categoria: 'solado' },
  { termo: 'BORRACHA', categoria: 'solado' },
  { termo: 'TR ', categoria: 'solado' },
  { termo: 'TPU', categoria: 'solado' },
  { termo: 'SALTO', categoria: 'solado' },
  
  // QUÍMICOS
  { termo: 'COLA', categoria: 'quimico' },
  { termo: 'ADESIVO', categoria: 'quimico' },
  { termo: 'TINTA', categoria: 'quimico' },
  { termo: 'SOLVENTE', categoria: 'quimico' },
  { termo: 'PRIMER', categoria: 'quimico' },
  
  // METAIS E AVIAMENTOS
  { termo: 'ILHOS', categoria: 'metal' },
  { termo: 'FIVELA', categoria: 'metal' },
  { termo: 'REBITE', categoria: 'metal' },
  { termo: 'METAL', categoria: 'metal' },
  { termo: 'ZÍPER', categoria: 'metal' },
  { termo: 'ZIPER', categoria: 'metal' },
  
  // EMBALAGENS
  { termo: 'CAIXA', categoria: 'embalagem' },
  { termo: 'PAPEL', categoria: 'embalagem' },
  { termo: 'ETIQUETA', categoria: 'embalagem' },
  { termo: 'BUCHA', categoria: 'embalagem' }
];

async function classificar() {
  try {
    console.log('🤖 Robô Classificador Iniciado...');
    
    const caminho = path.join(__dirname, ARQUIVO_BANCO);
    if (!fs.existsSync(caminho)) throw new Error('db.json não encontrado!');

    const dados = JSON.parse(fs.readFileSync(caminho, 'utf8'));
    
    // Garante que existe a lista
    if (!dados.materials) dados.materials = [];

    let alterados = 0;
    let exemplos = [];

    console.log(`📋 Analisando ${dados.materials.length} materiais...`);

    dados.materials = dados.materials.map(item => {
      const desc = (item.descricao || '').toUpperCase();
      let novaCategoria = 'outro'; // Reset para outro se não achar

      // Tenta achar uma regra
      for (const regra of REGRAS) {
        if (desc.includes(regra.termo)) {
          novaCategoria = regra.categoria;
          break;
        }
      }

      // Se a categoria mudou (ou se estava como 'outro' e achamos uma melhor)
      if (item.tipo !== novaCategoria) {
        if (exemplos.length < 5) {
          exemplos.push(` -> "${item.descricao.substring(0, 30)}..." virou [${novaCategoria.toUpperCase()}]`);
        }
        item.tipo = novaCategoria;
        alterados++;
      }

      return item;
    });

    fs.writeFileSync(caminho, JSON.stringify(dados, null, 2));

    console.log('\n--- EXEMPLOS DE MUDANÇAS ---');
    exemplos.forEach(ex => console.log(ex));
    console.log('...');
    
    console.log('------------------------------------------------');
    console.log(`✅ SUCESSO! ${alterados} materiais foram atualizados.`);
    console.log('🚨 IMPORTANTE: PARE O TERMINAL "npm run db" E RODE DE NOVO!');
    console.log('------------------------------------------------');

  } catch (erro) {
    console.error('❌ Erro:', erro.message);
  }
}

classificar();