import * as path from 'path';
import * as fs from 'fs';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando a carga de dados (Seed)... 🚀');

  // 1. Criando os Locais Padrões
  console.log('Criando locais físicos no cofre...');
  await prisma.location.createMany({
    data: [
      { name: 'Almoxarifado Central' },
      { name: 'Área de Triagem' },
      { name: 'Produção' }
    ],
    skipDuplicates: true,
  });

  // 2. Lendo o arquivo db.json
  console.log('Lendo o arquivo db.json com 4000+ itens...');
  const filePath = path.join(__dirname, 'db.json');
  const rawData = fs.readFileSync(filePath, 'utf-8');
  const jsonData = JSON.parse(rawData);
  const itemsArray = jsonData.materials;

  // 3. O Mapeamento Cirúrgico (Batendo o JSON com o Prisma)
  const materialsToInsert = itemsArray.map((item: any) => {
    return {
      code: String(item.codigo),
      name: item.descricao,
      // O Prisma exige Float, então garantimos que seja número (se vier vazio, vira 0)
      quantity: Number(item.quantidade) || 0, 
      unit: item.unidade || 'UN', // Se não vier unidade no JSON, salva 'UN' por segurança
      type: item.tipo || 'GERAL', // Se não vier tipo, salva 'GERAL'
      observation: item.observacoes || '',
    };
  });

  // 4. Inserção Massiva de Alta Performance
  console.log(`Injetando ${materialsToInsert.length} materiais no PostgreSQL...`);
  const result = await prisma.material.createMany({
    data: materialsToInsert,
    skipDuplicates: true, 
  });

  console.log(`✅ Sucesso Absoluto! ${result.count} novos materiais foram cadastrados no Dicionário do SCALE.`);
}

main()
  .catch((e) => {
    console.error('❌ Erro no Seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });