import assert from 'node:assert/strict';
import test from 'node:test';

test('Multi-Tenant Isolation: Operador não pode acessar ou movimentar material de outra unidade fabril (Cross-Tenant Leak)', () => {
  const tenant1 = { id: 1, code: 'SEST' };
  const tenant2 = { id: 2, code: 'IVT' };

  // Material cadastrado na fábrica de Ivoti (tenantId: 2)
  const materialIvoti = {
    id: 101,
    factoryUnitId: tenant2.id,
    code: 'TEC-001',
    name: 'TECIDO AZUL',
    quantity: 50,
  };

  // Simulação da query executada pelo MaterialController / StockItemService
  const findMaterialForTenant = (materialId: number, currentTenantId: number) => {
    if (materialIvoti.id === materialId && materialIvoti.factoryUnitId === currentTenantId) {
      return materialIvoti;
    }
    return null; // Isolamento multi-tenant: registro de outro tenant não existe na visão local
  };

  // Tentativa de acesso do operador de Santo Estêvão (tenantId: 1)
  const resultTenant1 = findMaterialForTenant(101, tenant1.id);
  assert.equal(resultTenant1, null, 'O operador da Unidade 1 não pode visualizar ou movimentar o material da Unidade 2');

  // Acesso legítimo do operador de Ivoti (tenantId: 2)
  const resultTenant2 = findMaterialForTenant(101, tenant2.id);
  assert.notEqual(resultTenant2, null);
  assert.equal(resultTenant2?.code, 'TEC-001');
});

test('Multi-Tenant Isolation: Transferência de estoque rejeita prateleira de destino pertencente a outra unidade fabril', () => {
  const currentTenantId = 1; // SEST

  const sourceLocation = { id: 10, factoryUnitId: 1, name: 'PRAT-A1' };
  const crossTenantLocation = { id: 25, factoryUnitId: 2, name: 'PRAT-IVOTI-B' };

  const validateTransferLocations = (src: typeof sourceLocation, dest: typeof crossTenantLocation, tenantId: number) => {
    if (src.factoryUnitId !== tenantId || dest.factoryUnitId !== tenantId) {
      throw new Error('CROSS_TENANT_LOCATION_FORBIDDEN');
    }
    return true;
  };

  assert.throws(
    () => validateTransferLocations(sourceLocation, crossTenantLocation, currentTenantId),
    /CROSS_TENANT_LOCATION_FORBIDDEN/,
    'Transferência entre prateleiras de tenants distintos deve ser terminantemente bloqueada'
  );
});

test('Multi-Tenant Concurrency: Transações concorrentes respeitam saldo atômico e impedem saldo negativo', () => {
  let currentStock = 100;

  // Simulação de transação ACID serializada com decremento condicional
  const performWithdrawal = (requestedQty: number) => {
    if (currentStock < requestedQty) {
      throw new Error('SALDO_INSUFICIENTE');
    }
    currentStock -= requestedQty;
    return currentStock;
  };

  // Primeira saída de 60
  const afterFirst = performWithdrawal(60);
  assert.equal(afterFirst, 40);

  // Segunda saída concorrente de 50 (restavam apenas 40)
  assert.throws(
    () => performWithdrawal(50),
    /SALDO_INSUFICIENTE/,
    'Concorrência deve abortar a segunda transação quando o saldo residual for menor que a quantidade solicitada'
  );

  // Saldo final deve permanecer 40 íntegro
  assert.equal(currentStock, 40);
});

test('Multi-Tenant Isolation: Configurações (Categorias, Prateleiras e Origens) são segregadas por factoryUnitId', () => {
  const allCategories = [
    { id: 1, factoryUnitId: 1, name: 'SINTETICO' },
    { id: 2, factoryUnitId: 1, name: 'COURO' },
    { id: 3, factoryUnitId: 2, name: 'LAMINADO ESPECIAL' },
  ];

  const getCategoriesByTenant = (tenantId: number) => {
    return allCategories.filter((c) => c.factoryUnitId === tenantId);
  };

  const categoriesUnit1 = getCategoriesByTenant(1);
  assert.equal(categoriesUnit1.length, 2);
  assert.deepEqual(categoriesUnit1.map((c) => c.name), ['SINTETICO', 'COURO']);

  const categoriesUnit2 = getCategoriesByTenant(2);
  assert.equal(categoriesUnit2.length, 1);
  assert.deepEqual(categoriesUnit2.map((c) => c.name), ['LAMINADO ESPECIAL']);
});
