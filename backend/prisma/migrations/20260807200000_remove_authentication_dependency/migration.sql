-- The constraint belongs to sobra_corte, but points into a schema owned by the
-- authentication service. Keep matriculaDass as an unconstrained external ID.
ALTER TABLE "sobra_corte"."User"
    DROP CONSTRAINT IF EXISTS "User_matriculaDass_fkey";
