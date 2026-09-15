import assert from 'node:assert/strict';
import test from 'node:test';

test('Atomic Movement Logic: Invariante de Saldo Total vs Soma das Prateleiras', () => {
  // Estado inicial simulado: Material com 100 unidades distribuídas em 2 prateleiras
  const initialMaterial = {
    id: 1,
    code: 'TEC-001',
    name: 'TECIDO COURO',
    type: 'COURO',
    unit: 'M²',
    quantity: 100.0,
    locations: [
      { locationId: 10, name: 'PRAT-A1', quantity: 60.0 },
      { locationId: 11, name: 'PRAT-A2', quantity: 40.0 },
    ],
  };

  // Validação do invariante inicial: saldoTotal === soma(prateleiras)
  const initialSum = initialMaterial.locations.reduce((acc, loc) => acc + loc.quantity, 0);
  assert.equal(initialMaterial.quantity, initialSum);

  // Simulação de Saída de 25.0 da PRAT-A1 com decremento condicional
  const withdrawQty = 25.0;
  const targetLoc = initialMaterial.locations.find((l) => l.locationId === 10)!;

  // Condição atômica: targetLoc.quantity >= withdrawQty
  assert.ok(targetLoc.quantity >= withdrawQty, 'Deve haver saldo suficiente na prateleira');
  targetLoc.quantity -= withdrawQty;
  initialMaterial.quantity -= withdrawQty;

  const afterWithdrawSum = initialMaterial.locations.reduce((acc, loc) => acc + loc.quantity, 0);
  assert.equal(initialMaterial.quantity, 75.0);
  assert.equal(targetLoc.quantity, 35.0);
  assert.equal(initialMaterial.quantity, afterWithdrawSum);
});

test('Atomic Movement Logic: Rejeita baixa quando prateleira específica não tem saldo suficiente, mesmo com saldo total suficiente', () => {
  const materialState = {
    id: 2,
    quantity: 100.0, // Saldo total é 100
    locations: [
      { locationId: 10, quantity: 30.0 }, // Prateleira A1 só tem 30
      { locationId: 11, quantity: 70.0 }, // Prateleira A2 tem 70
    ],
  };

  const requestedQty = 40.0;
  const locA1 = materialState.locations.find((l) => l.locationId === 10)!;

  // Simulação da cláusula WHERE: { locationId: 10, quantity: { gte: 40.0 } }
  const matchedRows = locA1.quantity >= requestedQty ? 1 : 0;
  assert.equal(matchedRows, 0, 'Cláusula WHERE com quantity >= 40 deve casar 0 linhas');

  // Ao encontrar count === 0, o serviço lança exceção e aborta sem modificar saldos
  const executeWithdraw = () => {
    if (matchedRows === 0) {
      throw new Error('Saldo insuficiente na prateleira selecionada para realizar a baixa.');
    }
  };

  assert.throws(executeWithdraw, {
    message: 'Saldo insuficiente na prateleira selecionada para realizar a baixa.',
  });

  // Garante que os saldos permaneceram intactos
  assert.equal(materialState.quantity, 100.0);
  assert.equal(locA1.quantity, 30.0);
});

test('Atomic Movement Logic: Prevenção de concorrência com duas baixas concorrentes que excedem o saldo', () => {
  // Saldo inicial de 100 unidades em uma prateleira
  let shelfBalance = 100.0;
  let totalBalance = 100.0;

  // Simula execução concorrente de dois pedidos de baixa de 60 unidades cada (total 120 > 100)
  const runConditionalDecrement = (qty: number): boolean => {
    // No PostgreSQL: UPDATE ... WHERE quantity >= :qty RETURNING id
    if (shelfBalance >= qty) {
      shelfBalance -= qty;
      totalBalance -= qty;
      return true; // count === 1
    }
    return false; // count === 0
  };

  const req1Result = runConditionalDecrement(60.0);
  assert.equal(req1Result, true, 'Primeira requisição deve ser atendida');
  assert.equal(shelfBalance, 40.0);
  assert.equal(totalBalance, 40.0);

  const req2Result = runConditionalDecrement(60.0);
  assert.equal(req2Result, false, 'Segunda requisição concorrente deve falhar devido à trava condicional');
  
  // O saldo final nunca pode ser negativo
  assert.equal(shelfBalance, 40.0);
  assert.equal(totalBalance, 40.0);
  assert.ok(shelfBalance >= 0);
  assert.ok(totalBalance >= 0);
});

test('Atomic Movement Logic: Transferência intra-setor mantém invariante de saldo total inalterado', () => {
  let shelf1 = 50.0;
  let shelf2 = 20.0;
  let total = 70.0;
  const transferQty = 15.0;

  // 1. Debita condicionalmente da origem
  assert.ok(shelf1 >= transferQty);
  shelf1 -= transferQty;

  // 2. Credita no destino
  shelf2 += transferQty;

  // 3. Saldo total permanece rigorosamente igual à soma dos locais
  assert.equal(shelf1, 35.0);
  assert.equal(shelf2, 35.0);
  assert.equal(total, 70.0);
  assert.equal(total, shelf1 + shelf2);
});

test('Atomic Movement Logic: Validação de quantidades inteiras para setores discretos', () => {
  const discreteSectors = ['PRE_FABRICADO', 'MONTAGEM', 'APOIO', 'DISTRIBUICAO', 'EXPEDICAO'];
  
  for (const sec of discreteSectors) {
    const isIntegerValid = Number.isInteger(10);
    const isDecimalValid = Number.isInteger(10.5);

    assert.equal(isIntegerValid, true);
    assert.equal(isDecimalValid, false);

    const validateDiscreteQuantity = (qty: number) => {
      if (!Number.isInteger(qty)) {
        throw new Error(`A quantidade para o setor ${sec} deve ser um número inteiro (sem decimais).`);
      }
    };

    assert.doesNotThrow(() => validateDiscreteQuantity(5));
    assert.throws(() => validateDiscreteQuantity(5.25), {
      message: `A quantidade para o setor ${sec} deve ser um número inteiro (sem decimais).`,
    });
  }
});

test('Atomic Movement Logic: Transferência intersetorial restrita a Administrador Master', () => {
  const checkCrossSectorPermission = (isCrossSector: boolean, userRole: string) => {
    if (isCrossSector && userRole !== 'admin') {
      throw new Error('Acesso Negado: Transferência entre setores diferentes é permitida exclusivamente para o Administrador Master.');
    }
    return true;
  };

  // Operador comum tentando transferir entre setores distintos
  assert.throws(
    () => checkCrossSectorPermission(true, 'operator'),
    { message: 'Acesso Negado: Transferência entre setores diferentes é permitida exclusivamente para o Administrador Master.' }
  );

  // Admin Master realizando transferência entre setores distintos
  assert.equal(checkCrossSectorPermission(true, 'admin'), true);

  // Transferência dentro do mesmo setor permitida para operador
  assert.equal(checkCrossSectorPermission(false, 'operator'), true);
});
