-- Unique indexes already support lookups by these columns. Keeping a second
-- non-unique index increases write cost and storage without improving queries.
DROP INDEX IF EXISTS "sobra_corte"."Material_code_idx";
DROP INDEX IF EXISTS "sobra_corte"."User_usuario_idx";
DROP INDEX IF EXISTS "sobra_corte"."User_email_idx";
DROP INDEX IF EXISTS "sobra_corte"."UnitConfig_symbol_idx";
