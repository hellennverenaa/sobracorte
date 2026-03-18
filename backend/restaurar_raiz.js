const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function cargaMassivaDefinitiva() {
  console.log("🚀 Iniciando Migração Definitiva para PostgreSQL...");

  // 1. Encontra o arquivo JSON antigo (ÚLTIMA VEZ)
  const caminhos = ['../db.json', 'db.json', '../db._backup.json', 'db._backup.json'];
  let dados = null;

  for (const caminho of caminhos) {
    if (fs.existsSync(caminho)) {
      console.log(`✅ Lendo dados de: ${caminho}`);
      dados = JSON.parse(fs.readFileSync(caminho, 'utf-8'));
      break;
    }
  }

  if (!dados) {
    console.error("❌ ERRO: Arquivo base não encontrado. Verifique o local do .json.");
    return;
  }

  try {
    // 2. Limpeza Transacional do Banco (ZERAR TUDO)
    console.log("🧹 Limpando banco de dados para a carga limpa...");
    await prisma.movement.deleteMany();
    await prisma.material.deleteMany();
    await prisma.user.deleteMany();

    // 3. Criar Admin
    console.log("👤 Criando usuário Admin...");
    const admin = await prisma.user.create({
      data: { email: 'admin@sobracorte.com', name: 'Admin Master', role: 'ADMIN' }
    });

    // 4. PREPARAR MATERIAIS PARA BULK INSERT
    console.log(`📦 Preparando ${dados.materials?.length || 0} materiais...`);
    
    // Mapeamento: Guardamos a relação ID Antigo -> Código, para usar nas movimentações
    const mapaIdAntigoParaCodigo = {}; 
    const materiaisParaInserir = dados.materials.map(m => {
      const codigoSeguro = String(m.code || m.codigo || Math.random().toString().slice(2,8));
      mapaIdAntigoParaCodigo[m.id] = codigoSeguro;

      return {
        code: codigoSeguro,
        name: m.name || m.descricao || "Sem Nome",
        type: m.type || "OUTROS",
        quantity: Number(m.quantity || 0),
        unit: m.unit || "und",
        location: m.location || "Geral",
        observation: m.observation || m.obs || m.observacao || ""
      };
    });

    // Inserção Massiva de Materiais (Altíssima Performance)
    if (materiaisParaInserir.length > 0) {
      await prisma.material.createMany({
        data: materiaisParaInserir,
        skipDuplicates: true // Ignora se houver códigos duplicados no JSON velho
      });
    }

    // 5. RECUPERAR NOVOS IDs GERADOS PELO POSTGRES
    // O banco gerou IDs novos (1, 2, 3...). Precisamos deles para linkar os Movements.
    const materiaisNoBanco = await prisma.material.findMany({
      select: { id: true, code: true }
    });

    const mapaCodigoParaNovoId = {};
    materiaisNoBanco.forEach(m => {
      mapaCodigoParaNovoId[m.code] = m.id;
    });

    // 6. PREPARAR MOVIMENTAÇÕES PARA BULK INSERT
    console.log(`🚚 Preparando ${dados.movements?.length || 0} movimentações...`);
    const movimentacoesParaInserir = [];

    if (dados.movements) {
      dados.movements.forEach(mov => {
        // Acha o código do material usando o ID velho, depois acha o ID Novo usando o código
        const codigoMaterial = mapaIdAntigoParaCodigo[mov.materialId];
        const novoIdReal = mapaCodigoParaNovoId[codigoMaterial];

        if (novoIdReal) {
          movimentacoesParaInserir.push({
            type: mov.type || 'SAIDA',
            quantity: Number(mov.quantity || 0),
            reason: mov.reason || mov.motivo || '',
            materialId: novoIdReal,
            userId: admin.id,
            createdAt: mov.date ? new Date(mov.date) : new Date()
          });
        }
      });
    }

    // Inserção Massiva de Movimentações
    if (movimentacoesParaInserir.length > 0) {
      await prisma.movement.createMany({
        data: movimentacoesParaInserir
      });
    }

    console.log("\n✨ SUCESSO ABSOLUTO! O Banco Postgres está populado.");
    console.log("🔥 Pode deletar seus arquivos .json agora. O banco é a única fonte da verdade.");

  } catch (error) {
    console.error("🚨 ERRO CRÍTICO NO POSTGRES:", error);
  } finally {
    await prisma.$disconnect();
  }
}

cargaMassivaDefinitiva();