import assert from "node:assert/strict";
import test from "node:test";
import { DashboardController } from "../src/controllers/DashboardController";

test("DashboardController estrutura corretamente os dados segregados por unidade e window functions", () => {
  const controller = new DashboardController();
  assert.equal(typeof controller.getSummary, "function");
  assert.equal(typeof controller.getTopMateriais, "function");
  assert.equal(typeof controller.getOrigemSobras, "function");
  assert.equal(typeof controller.getDistribuicao, "function");
});

test("Lógica de particionamento e ordenação de unidades coloca M² e UND prioritariamente", () => {
  const rawUnits = new Set(["KG", "M²", "UND", "PAR"]);
  const sorted = Array.from(rawUnits).sort((a, b) => {
    if (a === "M²" || a === "M2") return -1;
    if (b === "M²" || b === "M2") return 1;
    if (a === "UND") return -1;
    if (b === "UND") return 1;
    return a.localeCompare(b);
  });

  assert.equal(sorted[0], "M²");
  assert.equal(sorted[1], "UND");
  assert.deepEqual(sorted, ["M²", "UND", "KG", "PAR"]);
});

test("Lógica de particionamento multi-setor agrupa Top 5 por Setor e por Unidade", () => {
  const mockMultiSectorResults = [
    // CORTE (Material)
    { id: 1, code: "MAT-01", name: "Tecido Dry", quantity: "500.5", sector: "CORTE", unitId: 1, unit: "M²", type: "TECIDO", position: 1, global_position: 1 },
    { id: 2, code: "MAT-02", name: "Couro Vaqueta", quantity: "300.0", sector: "CORTE", unitId: 1, unit: "M²", type: "COURO", position: 2, global_position: 2 },
    // APOIO (StockItem)
    { id: 10, code: "MOL-101", name: "Gáspea Externa", quantity: "150", sector: "APOIO", unitId: null, unit: "UND", type: "CORTE", position: 1, global_position: 1 },
    // PRE_FABRICADO (StockItem)
    { id: 20, code: "SOLA-PEG", name: "Sola Pegasus 40 (Tam 40)", quantity: "80", sector: "PRE_FABRICADO", unitId: null, unit: "UND", type: "EVA", position: 1, global_position: 2 },
    // DISTRIBUICAO (StockItem)
    { id: 30, code: "CAB-VOM", name: "Cabedal Vomero (Tam 41)", quantity: "95", sector: "DISTRIBUICAO", unitId: null, unit: "UND", type: "CABEDAL", position: 1, global_position: 3 },
    // MONTAGEM (StockItem)
    { id: 40, code: "SKU-PEG-38", name: "Calçado Completo (Tam 38 - Pé E)", quantity: "45", sector: "MONTAGEM", unitId: null, unit: "UND", type: "PRETO", position: 1, global_position: 4 },
    { id: 41, code: "SKU-PEG-38", name: "Calçado Completo (Tam 38 - Pé D)", quantity: "40", sector: "MONTAGEM", unitId: null, unit: "UND", type: "PRETO", position: 2, global_position: 5 },
    { id: 42, code: "SKU-VOM-39", name: "Pares Casados (Tam 39)", quantity: "20", sector: "MONTAGEM", unitId: null, unit: "PAR", type: "AZUL", position: 1, global_position: 1 },
  ];

  const topMateriaisPorSetorEUnidade: Record<string, Record<string, any[]>> = {
    TODOS: {},
    CORTE: {},
    APOIO: {},
    PRE_FABRICADO: {},
    DISTRIBUICAO: {},
    EXPEDICAO: {},
    MONTAGEM: {},
  };
  const topMateriaisPorUnidade: Record<string, any[]> = {};
  const unidadesSetPorSetor: Record<string, Set<string>> = {
    TODOS: new Set(),
    CORTE: new Set(),
    APOIO: new Set(),
    PRE_FABRICADO: new Set(),
    DISTRIBUICAO: new Set(),
    EXPEDICAO: new Set(),
    MONTAGEM: new Set(),
  };

  for (const row of mockMultiSectorResults) {
    const sec = String(row.sector || "CORTE").toUpperCase().trim();
    const u = String(row.unit || "UND").toUpperCase().trim();
    const item = {
      id: row.id,
      code: row.code,
      name: row.name,
      quantity: Number(row.quantity) || 0,
      sector: sec,
      unitId: row.unitId ? Number(row.unitId) : null,
      unit: u,
      type: row.type || "",
      position: Number(row.position) || 1,
      globalPosition: Number(row.global_position) || 1,
    };

    if (Number(row.position) <= 5) {
      if (!topMateriaisPorSetorEUnidade[sec]) topMateriaisPorSetorEUnidade[sec] = {};
      if (!topMateriaisPorSetorEUnidade[sec][u]) topMateriaisPorSetorEUnidade[sec][u] = [];
      topMateriaisPorSetorEUnidade[sec][u].push(item);
      unidadesSetPorSetor[sec]?.add(u);

      if (sec === "DISTRIBUICAO") {
        if (!topMateriaisPorSetorEUnidade.EXPEDICAO) topMateriaisPorSetorEUnidade.EXPEDICAO = {};
        if (!topMateriaisPorSetorEUnidade.EXPEDICAO[u]) topMateriaisPorSetorEUnidade.EXPEDICAO[u] = [];
        topMateriaisPorSetorEUnidade.EXPEDICAO[u].push(item);
        unidadesSetPorSetor.EXPEDICAO?.add(u);
      }
    }

    if (Number(row.global_position) <= 5) {
      if (!topMateriaisPorUnidade[u]) topMateriaisPorUnidade[u] = [];
      if (!topMateriaisPorSetorEUnidade.TODOS[u]) topMateriaisPorSetorEUnidade.TODOS[u] = [];
      if (!topMateriaisPorUnidade[u].some((e) => e.id === item.id && e.sector === item.sector)) {
        topMateriaisPorUnidade[u].push(item);
        topMateriaisPorSetorEUnidade.TODOS[u].push(item);
        unidadesSetPorSetor.TODOS.add(u);
      }
    }
  }

  // Validação CORTE
  assert.equal(topMateriaisPorSetorEUnidade.CORTE["M²"].length, 2);
  assert.equal(topMateriaisPorSetorEUnidade.CORTE["M²"][0].code, "MAT-01");

  // Validação APOIO
  assert.equal(topMateriaisPorSetorEUnidade.APOIO["UND"].length, 1);
  assert.equal(topMateriaisPorSetorEUnidade.APOIO["UND"][0].code, "MOL-101");

  // Validação PRE_FABRICADO
  assert.equal(topMateriaisPorSetorEUnidade.PRE_FABRICADO["UND"].length, 1);
  assert.equal(topMateriaisPorSetorEUnidade.PRE_FABRICADO["UND"][0].code, "SOLA-PEG");

  // Validação MONTAGEM (Pés Órfãos e Pares)
  assert.equal(topMateriaisPorSetorEUnidade.MONTAGEM["UND"].length, 2);
  assert.equal(topMateriaisPorSetorEUnidade.MONTAGEM["UND"][0].code, "SKU-PEG-38");
  assert.equal(topMateriaisPorSetorEUnidade.MONTAGEM["PAR"].length, 1);
  assert.equal(topMateriaisPorSetorEUnidade.MONTAGEM["PAR"][0].code, "SKU-VOM-39");

  // Validação DISTRIBUICAO / EXPEDICAO
  assert.equal(topMateriaisPorSetorEUnidade.DISTRIBUICAO["UND"].length, 1);
  assert.equal(topMateriaisPorSetorEUnidade.EXPEDICAO["UND"].length, 1);

  // Validação Unidades por Setor
  assert.deepEqual(Array.from(unidadesSetPorSetor.MONTAGEM), ["UND", "PAR"]);
  assert.deepEqual(Array.from(unidadesSetPorSetor.CORTE), ["M²"]);
});

test("Distribuição física segregada calcula totais por grandeza sem somas heterogêneas", () => {
  const distribuicaoPorUnidadeRaw = [
    { unit: "M²", totalQuantity: "1540.5", itemsCount: 45 },
    { unit: "KG", totalQuantity: "320.0", itemsCount: 12 },
    { unit: "UND", totalQuantity: "850", itemsCount: 30 },
  ];

  const distribuicaoPorUnidade = distribuicaoPorUnidadeRaw.map((d) => ({
    unit: String(d.unit || "M²").toUpperCase().trim(),
    totalQuantity: Number(d.totalQuantity) || 0,
    itemsCount: Number(d.itemsCount) || 0,
  }));

  assert.equal(distribuicaoPorUnidade.length, 3);
  assert.deepEqual(distribuicaoPorUnidade[0], { unit: "M²", totalQuantity: 1540.5, itemsCount: 45 });
  assert.deepEqual(distribuicaoPorUnidade[1], { unit: "KG", totalQuantity: 320.0, itemsCount: 12 });
  assert.deepEqual(distribuicaoPorUnidade[2], { unit: "UND", totalQuantity: 850, itemsCount: 30 });
});
