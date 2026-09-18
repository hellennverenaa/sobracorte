-- Dados sintéticos locais. Reexecuções preservam itens e saldos já existentes.
DO $$
DECLARE
  unit_id integer;
  sector_name text;
  sector_value sobra_corte."SectorType";
  category_id integer;
  location_a integer;
  location_b integer;
  item_id integer;
  j integer;
  product_group integer;
  item_code text;
  item_sku text;
  item_name text;
  model_name text;
  category_name text;
  color_name text;
  grade_name text;
  unit_symbol text;
  side_value sobra_corte."FootSide";
  component_value sobra_corte."ComponentType";
  initial_quantity numeric;
  output_quantity numeric;
  scrap_quantity numeric;
  fulfilled_quantity numeric;
  final_quantity numeric;
  transferred_quantity numeric;
  requisition_code text;
  requisition_status sobra_corte."RequisitionStatus";
BEGIN
  CREATE TEMP TABLE sest_functional_added_items (id integer PRIMARY KEY) ON COMMIT DROP;
  SELECT id INTO STRICT unit_id FROM sobra_corte."FactoryUnit" WHERE code = 'SEST' AND active FOR NO KEY UPDATE;

  FOREACH sector_name IN ARRAY ARRAY['CORTE', 'APOIO', 'PRE_FABRICADO', 'DISTRIBUICAO', 'MONTAGEM', 'CONSUMO'] LOOP
    sector_value := sector_name::sobra_corte."SectorType";
    INSERT INTO sobra_corte."CategoryConfig" (name, sector, "factoryUnitId")
    VALUES ('TESTE-SEST-' || sector_name, sector_value, unit_id)
    ON CONFLICT ("factoryUnitId", name) DO NOTHING;
    SELECT id INTO category_id FROM sobra_corte."CategoryConfig"
      WHERE "factoryUnitId" = unit_id AND name = 'TESTE-SEST-' || sector_name;

    INSERT INTO sobra_corte."OriginConfig" (name, sector, "factoryUnitId")
    VALUES ('TESTE-SEST-IMPLANTACAO-' || sector_name, sector_value, unit_id)
    ON CONFLICT ("factoryUnitId", name) DO NOTHING;

    INSERT INTO sobra_corte."Location" (name, sector, "categoryId", "factoryUnitId")
    VALUES ('TESTE-SEST-' || sector_name || '-A', sector_value, category_id, unit_id),
           ('TESTE-SEST-' || sector_name || '-B', sector_value, category_id, unit_id)
    ON CONFLICT ("factoryUnitId", name) DO NOTHING;
    SELECT id INTO location_a FROM sobra_corte."Location" WHERE "factoryUnitId" = unit_id AND name = 'TESTE-SEST-' || sector_name || '-A';
    SELECT id INTO location_b FROM sobra_corte."Location" WHERE "factoryUnitId" = unit_id AND name = 'TESTE-SEST-' || sector_name || '-B';
    INSERT INTO sobra_corte."LocationCategory" ("locationId", "categoryId", "factoryUnitId")
    VALUES (location_a, category_id, unit_id), (location_b, category_id, unit_id)
    ON CONFLICT ("locationId", "categoryId") DO NOTHING;

    FOR j IN 1..24 LOOP
      item_code := 'TESTE-SEST-' || sector_name || '-' || lpad(j::text, 3, '0');
      -- Código técnico reservado ao fixture; SKU comercial permite variantes E/D.
      IF EXISTS (SELECT 1 FROM sobra_corte."StockItem" WHERE "factoryUnitId" = unit_id AND code = item_code) THEN
        CONTINUE;
      END IF;
      product_group := CASE WHEN sector_name IN ('PRE_FABRICADO', 'DISTRIBUICAO', 'MONTAGEM') THEN (j + 1) / 2
                            WHEN sector_name = 'APOIO' THEN (j + 2) / 3 ELSE j END;
      item_sku := 'TESTE-SEST-' || sector_name || '-SKU-' || lpad(product_group::text, 3, '0');
      model_name := 'TESTE ' || (ARRAY['URBANO', 'CORRIDA', 'TRILHA', 'CASUAL', 'ESPORTE', 'INFANTIL'])[1 + (product_group - 1) % 6];
      color_name := (ARRAY['PRETO', 'BRANCO', 'AZUL/BRANCO', 'VERMELHO', 'VERDE/PRETO', 'BEGE'])[1 + (product_group - 1) % 6];
      grade_name := (36 + (product_group - 1) % 9)::text;
      side_value := CASE WHEN sector_name IN ('PRE_FABRICADO', 'DISTRIBUICAO', 'MONTAGEM')
                        THEN CASE WHEN j % 2 = 1 THEN 'E' ELSE 'D' END::sobra_corte."FootSide" ELSE NULL END;
      component_value := CASE sector_name WHEN 'CORTE' THEN 'MATERIA_PRIMA' WHEN 'APOIO' THEN 'PECA_CORTADA'
        WHEN 'PRE_FABRICADO' THEN 'SOLADO' WHEN 'DISTRIBUICAO' THEN 'CABEDAL' WHEN 'MONTAGEM' THEN 'PE_PRONTO' ELSE NULL END::sobra_corte."ComponentType";
      category_name := CASE sector_name
        WHEN 'CORTE' THEN 'TESTE-SEST-' || (ARRAY['TECIDO', 'COURO', 'SINTETICO', 'LINHA'])[1 + (j - 1) % 4]
        WHEN 'PRE_FABRICADO' THEN CASE WHEN product_group % 2 = 1 THEN 'EVA' ELSE 'BORRACHA' END
        WHEN 'DISTRIBUICAO' THEN CASE WHEN product_group % 2 = 1 THEN 'CABEDAL' ELSE 'SOLA_PROCESSADA' END
        ELSE 'TESTE-SEST-' || sector_name END;
      unit_symbol := CASE WHEN sector_name = 'CORTE' THEN (ARRAY['M²', 'M²', 'KG', 'M'])[1 + (j - 1) % 4]
                          WHEN sector_name = 'CONSUMO' THEN 'UN' ELSE 'UN' END;
      item_name := 'TESTE ' || CASE sector_name
        WHEN 'CORTE' THEN (ARRAY['TECIDO RESPIRAVEL', 'COURO NATURAL', 'LAMINADO SINTETICO', 'LINHA DE COSTURA'])[1 + (j - 1) % 4]
        WHEN 'APOIO' THEN (ARRAY['LINGUETA', 'GASPEA', 'LATERAL'])[1 + (j - 1) % 3]
        WHEN 'PRE_FABRICADO' THEN 'SOLADO ' || model_name
        WHEN 'DISTRIBUICAO' THEN category_name || ' ' || model_name
        WHEN 'MONTAGEM' THEN 'PE PRONTO ' || model_name
        ELSE (ARRAY['COLA', 'FITA', 'ETIQUETA', 'EMBALAGEM'])[1 + (j - 1) % 4] END;

      IF sector_name = 'CORTE' THEN
        INSERT INTO sobra_corte."CategoryConfig" (name, sector, "factoryUnitId")
        VALUES (category_name, sector_value, unit_id) ON CONFLICT ("factoryUnitId", name) DO NOTHING;
        INSERT INTO sobra_corte."LocationCategory" ("locationId", "categoryId", "factoryUnitId")
        SELECT loc_id, c.id, unit_id FROM sobra_corte."CategoryConfig" c CROSS JOIN (VALUES (location_a), (location_b)) AS locations(loc_id)
        WHERE c."factoryUnitId" = unit_id AND c.name = category_name
        ON CONFLICT ("locationId", "categoryId") DO NOTHING;
      END IF;

      initial_quantity := 100 + j * 5 + CASE WHEN sector_name = 'CORTE' THEN j::numeric / 100 ELSE 0 END;
      scrap_quantity := 2 + j % 3;
      fulfilled_quantity := CASE WHEN sector_name <> 'CONSUMO' THEN CASE j WHEN 2 THEN 4 WHEN 3 THEN 10 ELSE 0 END ELSE 0 END;
      output_quantity := CASE WHEN j % 8 = 0 THEN initial_quantity
                              WHEN j % 6 = 0 THEN initial_quantity - scrap_quantity - fulfilled_quantity - 5
                              ELSE 10 + j % 7 END;
      IF j % 8 = 0 THEN scrap_quantity := 0; END IF;
      final_quantity := initial_quantity - output_quantity - scrap_quantity - fulfilled_quantity;
      transferred_quantity := CASE WHEN j % 3 = 0 THEN CASE WHEN sector_name = 'CORTE' THEN round(final_quantity / 3, 3) ELSE floor(final_quantity / 3) END ELSE 0 END;

      INSERT INTO sobra_corte."StockItem" (
        "factoryUnitId", sector, "componentType", code, name, sku, "pieceCode", "productName", description,
        "materialColor", color, "sizeGrade", "footSide", type, unit, quantity, "minStock", observation, "createdAt", "updatedAt"
      ) VALUES (
        unit_id, sector_value, component_value, item_code, item_name,
        CASE WHEN sector_name NOT IN ('CORTE', 'APOIO') THEN item_sku ELSE NULL END,
        CASE WHEN sector_name = 'APOIO' THEN item_sku ELSE NULL END,
        CASE WHEN sector_name = 'CONSUMO' THEN item_name WHEN sector_name <> 'CORTE' THEN model_name ELSE NULL END,
        CASE WHEN sector_name = 'APOIO' THEN item_name ELSE NULL END,
        CASE WHEN sector_name = 'APOIO' THEN 'SINTETICO / ' || color_name ELSE NULL END,
        CASE WHEN sector_name NOT IN ('CORTE', 'APOIO', 'CONSUMO') THEN color_name ELSE NULL END,
        CASE WHEN sector_name NOT IN ('CORTE', 'CONSUMO') THEN grade_name ELSE NULL END,
        side_value, category_name, unit_symbol, final_quantity, CASE WHEN sector_name = 'CORTE' THEN 15 ELSE 0 END,
        'TESTE-SEST-FUNCIONAL: dado sintetico para testes; nao representa producao.', now() - (40 - j) * interval '1 day', now()
      ) RETURNING id INTO item_id;
      INSERT INTO pg_temp.sest_functional_added_items VALUES (item_id);

      INSERT INTO sobra_corte."StockItemLocation" ("stockItemId", "locationId", "factoryUnitId", quantity)
      VALUES (item_id, location_a, unit_id, final_quantity - transferred_quantity);
      IF transferred_quantity > 0 THEN
        INSERT INTO sobra_corte."StockItemLocation" ("stockItemId", "locationId", "factoryUnitId", quantity)
        VALUES (item_id, location_b, unit_id, transferred_quantity);
      END IF;

      INSERT INTO sobra_corte."StockMovement" (
        "factoryUnitId", "stockItemId", sector, type, quantity, "destinationLocationId", "destinationLocationName",
        "itemCode", "itemName", "itemCategory", "itemUnit", origem, reason, "operatorName", "createdAt"
      ) VALUES (
        unit_id, item_id, sector_value, 'ENTRADA', initial_quantity, location_a, 'TESTE-SEST-' || sector_name || '-A',
        CASE WHEN sector_name = 'CORTE' THEN item_code ELSE item_sku END, item_name, category_name, unit_symbol,
        'TESTE-SEST-IMPLANTACAO-' || sector_name, 'TESTE-SEST-FUNCIONAL: saldo inicial sintetico', 'OPERADOR DE TESTE', now() - (40 - j) * interval '1 day'
      );
      INSERT INTO sobra_corte."StockMovement" (
        "factoryUnitId", "stockItemId", sector, type, quantity, "sourceLocationId", "sourceLocationName",
        "itemCode", "itemName", "itemCategory", "itemUnit", origem, reason, "operatorName", "createdAt"
      )
      SELECT unit_id, item_id, sector_value, kind::sobra_corte."MovementType", volume, location_a, 'TESTE-SEST-' || sector_name || '-A',
        CASE WHEN sector_name = 'CORTE' THEN item_code ELSE item_sku END, item_name, category_name, unit_symbol,
        'TESTE-SEST: ' || kind, 'TESTE-SEST-FUNCIONAL: movimentacao sintetica', 'OPERADOR DE TESTE', occurred_at
      FROM (VALUES ('SAIDA', output_quantity, now() - (10 + j % 4) * interval '1 day'),
                   ('REFUGO', scrap_quantity, now() - interval '7 days')) AS movements(kind, volume, occurred_at)
      WHERE volume > 0;
      IF transferred_quantity > 0 THEN
        INSERT INTO sobra_corte."StockMovement" (
          "factoryUnitId", "stockItemId", sector, type, quantity, "sourceLocationId", "destinationLocationId",
          "sourceLocationName", "destinationLocationName", "itemCode", "itemName", "itemCategory", "itemUnit", origem, reason, "operatorName", "createdAt"
        ) VALUES (unit_id, item_id, sector_value, 'TRANSFERENCIA', transferred_quantity, location_a, location_b,
          'TESTE-SEST-' || sector_name || '-A', 'TESTE-SEST-' || sector_name || '-B',
          CASE WHEN sector_name = 'CORTE' THEN item_code ELSE item_sku END, item_name, category_name, unit_symbol,
          'TESTE-SEST: TRANSFERENCIA', 'TESTE-SEST-FUNCIONAL: transferencia entre prateleiras', 'OPERADOR DE TESTE', now() - interval '4 days');
      END IF;

      IF sector_name <> 'CONSUMO' AND j <= 4 THEN
        requisition_code := 'TESTE-SEST-REQ-' || sector_name || '-' || j;
        requisition_status := (ARRAY['PENDENTE', 'ATENDIDA_PARCIAL', 'ATENDIDA_TOTAL', 'CANCELADA'])[j]::sobra_corte."RequisitionStatus";
        INSERT INTO sobra_corte."MaterialRequisition" (
          id, code, "factoryUnitId", "requestSector", sku, "modelName", description, color, "sizeGrade", "footSide",
          "quantityRequested", "quantityFulfilled", reason, status, "requesterName", "createdAt", "updatedAt"
        ) VALUES (requisition_code, requisition_code, unit_id, sector_value,
          CASE WHEN sector_name = 'CORTE' THEN item_code ELSE item_sku END,
          CASE WHEN sector_name <> 'CORTE' THEN model_name ELSE NULL END, item_name,
          CASE WHEN sector_name = 'APOIO' THEN 'SINTETICO / ' || color_name WHEN sector_name <> 'CORTE' THEN color_name ELSE NULL END,
          CASE WHEN sector_name <> 'CORTE' THEN grade_name ELSE NULL END, side_value,
          10, fulfilled_quantity, 'TESTE-SEST-FUNCIONAL: reposicao por avaria simulada', requisition_status,
          'SOLICITANTE DE TESTE', now() - interval '3 days', now() - interval '1 day');
        IF fulfilled_quantity > 0 THEN
          INSERT INTO sobra_corte."StockMovement" (
            "factoryUnitId", "stockItemId", sector, type, quantity, "sourceLocationId", "sourceLocationName",
            "itemCode", "itemName", "itemCategory", "itemUnit", origem, reason, "operatorName", "createdAt"
          ) VALUES (unit_id, item_id, sector_value, 'SAIDA_REQUISICAO', fulfilled_quantity, location_a, 'TESTE-SEST-' || sector_name || '-A',
            CASE WHEN sector_name = 'CORTE' THEN item_code ELSE item_sku END, item_name, category_name, unit_symbol,
            'Atendimento de Requisição', 'TESTE-SEST-FUNCIONAL: atendimento digital da requisicao ' || requisition_code,
            'APROVADOR DE TESTE', now() - interval '1 day');
        END IF;
      END IF;
    END LOOP;
  END LOOP;
END $$;
