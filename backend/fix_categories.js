const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function corrigirCategorias() {
  console.log("🚀 Iniciando Correção Inteligente de Categorias...");

  const materials = await prisma.material.findMany();
  console.log(`🔍 Analisando ${materials.length} materiais...`);

  let count = 0;

  for (const item of materials) {
    const nome = item.name.toUpperCase();
    let novaCategoria = item.type; // Mantém a atual por padrão

    // Lógica Inteligente de Classificação
    if (nome.includes('ELASTICO') || nome.includes('ELÁSTICO')) {
      novaCategoria = 'ELASTICO';
    } else if (nome.includes('LINHA') || nome.includes('FIO')) {
      novaCategoria = 'LINHA';
    } else if (nome.includes('TECIDO') || nome.includes('MALHA') || nome.includes('MEIA')) {
      novaCategoria = 'TECIDO';
    } else if (nome.includes('ZÍPER') || nome.includes('BOTÃO') || nome.includes('ETIQUETA') || nome.includes('VIES') || nome.includes('VIÉS')) {
      novaCategoria = 'AVIAMENTO';
    }

    // Só atualiza se mudou
    if (novaCategoria !== item.type) {
      await prisma.material.update({
        where: { id: item.id },
        data: { type: novaCategoria }
      });
      process.stdout.write('.'); // Mostra progresso
      count++;
    }
  }

  console.log(`\n\n✅ Sucesso! ${count} materiais foram reclassificados corretamente.`);
}

corrigirCategorias()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());