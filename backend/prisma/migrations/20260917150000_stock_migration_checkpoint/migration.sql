-- Evidência de migração e fechamento automático após a primeira escrita canônica.
-- Nenhuma tabela legada é alterada ou removida.
BEGIN;
CREATE TABLE sobra_corte."StockMigrationCheckpoint" (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  "completedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "cutoverAt" TIMESTAMPTZ,
  "legacyEvidence" JSONB NOT NULL
);

CREATE FUNCTION sobra_corte.mark_stock_cutover() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE sobra_corte."StockMigrationCheckpoint"
    SET "cutoverAt" = CURRENT_TIMESTAMP
    WHERE id = 1 AND "cutoverAt" IS NULL;
  RETURN NULL;
END;
$$;

CREATE TRIGGER stock_item_cutover AFTER INSERT OR UPDATE OR DELETE ON sobra_corte."StockItem"
FOR EACH ROW EXECUTE FUNCTION sobra_corte.mark_stock_cutover();
CREATE TRIGGER stock_location_cutover AFTER INSERT OR UPDATE OR DELETE ON sobra_corte."StockItemLocation"
FOR EACH ROW EXECUTE FUNCTION sobra_corte.mark_stock_cutover();
CREATE TRIGGER stock_movement_cutover AFTER INSERT OR UPDATE OR DELETE ON sobra_corte."StockMovement"
FOR EACH ROW EXECUTE FUNCTION sobra_corte.mark_stock_cutover();
CREATE TRIGGER stock_requisition_cutover AFTER INSERT OR UPDATE OR DELETE ON sobra_corte."MaterialRequisition"
FOR EACH ROW EXECUTE FUNCTION sobra_corte.mark_stock_cutover();
COMMIT;
