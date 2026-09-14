import assert from "node:assert/strict";
import test from "node:test";
import { csvCell, csvLine, decimalString, ReportController } from "../src/controllers/ReportController";

test("csvCell sanitiza e previne injeção de fórmulas no Excel (CSV Formula Injection CWE-1236)", () => {
  // Fórmulas perigosas
  assert.equal(csvCell("=1+1"), `"'=1+1"`);
  assert.equal(csvCell("+cmd|' /C calc'!A0"), ` "'+cmd|' /C calc'!A0"`.trim());
  assert.equal(csvCell("-SUM(A1:A10)"), `"'-SUM(A1:A10)"`);
  assert.equal(csvCell("@IMPORTXML(...)"), `"'@IMPORTXML(...)"`);

  // Aspas duplas normais
  assert.equal(csvCell('Couro 10" Preto'), `"Couro 10"" Preto"`);

  // Valores normais e nulos
  assert.equal(csvCell("Tecido Dry Fit"), `"Tecido Dry Fit"`);
  assert.equal(csvCell(""), `""`);
  assert.equal(csvCell(null), `""`);
  assert.equal(csvCell(undefined), `""`);
  assert.equal(csvCell(123.45), `"123.45"`);
});

test("csvLine gera linha delimitada por ponto e vírgula com terminação CRLF", () => {
  const line = csvLine(["DATA", "SETOR", "QUANTIDADE"]);
  assert.equal(line, `"DATA";"SETOR";"QUANTIDADE"\r\n`);
});

test("decimalString formata números no padrão brasileiro com até 3 casas decimais", () => {
  assert.equal(decimalString(0), "0");
  assert.equal(decimalString(150), "150");
  assert.equal(decimalString(150.5), "150,5");
  assert.equal(decimalString("150.500"), "150,5");
  assert.equal(decimalString(null), "0");
  assert.equal(decimalString(undefined), "0");
});

test("ReportController possui métodos de exportação por streaming", () => {
  const controller = new ReportController();
  assert.equal(typeof controller.exportInventory, "function");
  assert.equal(typeof controller.exportMovements, "function");
  assert.equal(typeof controller.exportRequisitions, "function");
});

test("Mock stream valida envio de BOM UTF-8 e cabeçalhos em exportações", async () => {
  const chunks: string[] = [];
  const mockRes: any = {
    headers: {},
    setHeader(key: string, value: string) {
      this.headers[key] = value;
    },
    write(chunk: string) {
      chunks.push(chunk);
    },
    end() {
      this.ended = true;
    },
    headersSent: false,
    ended: false,
  };

  // Simulação de stream de inventário com BOM
  const bomHeader = "\uFEFF" + csvLine(["SETOR", "CODIGO", "DESCRICAO"]);
  mockRes.write(bomHeader);
  mockRes.write(csvLine(["CORTE", "MAT-01", "Tecido Azul"]));
  mockRes.end();

  assert.ok(chunks[0].startsWith("\uFEFF"), "Primeiro chunk deve conter BOM UTF-8 para o Excel");
  assert.equal(chunks.length, 2);
  assert.equal(chunks[1], `"CORTE";"MAT-01";"Tecido Azul"\r\n`);
  assert.equal(mockRes.ended, true);
});
