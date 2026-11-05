-- Números: todo lo que vivía en el Excel Finanzas_FEDE pasa al back office.
-- 1) Gastos con proveedor, rubro y notas (como la hoja Gastos). 2) Supuestos de planificación (hoja Supuestos).

-- Quién pagó: pasa de enum a texto con check, para sumar "Nari y Mich" (así figura en la planilla)
-- sin el problema de usar un valor de enum recién creado en la misma transacción.
alter table gastos alter column pagado_por drop default;
alter table gastos alter column pagado_por type text using pagado_por::text;
alter table gastos alter column pagado_por set default 'eden';
alter table gastos add constraint gastos_pagado_por_check check (pagado_por in ('eden', 'fede', 'nari', 'mich', 'nari_mich'));

alter table gastos
  add column proveedor text,
  add column rubro text,
  add column nota text,
  alter column fecha drop not null; -- en la planilla hay gastos sin fecha

-- Supuestos editables desde Números (antes: hoja Supuestos). Arrancan en cero: el repo es público, los valores reales se cargan en Números.
alter table ajustes add column plan jsonb not null default '{
  "tipo_cambio": 0,
  "fecha_tc": "2026-01-01",
  "lote": {"biblia": 1, "journal": 1},
  "merma": {"biblia": 0, "journal": 0},
  "desarrollo_pct_biblia": 1,
  "margen_objetivo": 0.5,
  "pasarela": "nave-8",
  "transferencia": "manual",
  "pct_pasarela": 0.6,
  "descuento_transferencia": 0,
  "comision_plataforma": 0,
  "costos": {
    "biblia": {"interior": 0, "trabajo": 0, "packaging": 0, "cuero": 0, "otro": 0},
    "journal": {"interior": 0, "trabajo": 0, "packaging": 0, "cuero": 0, "otro": 0}
  },
  "envio": {"biblia": 0, "journal": 0},
  "material_envio": {"biblia": 0, "journal": 0},
  "publicidad_lote": {"biblia": 0, "journal": 0},
  "fijos": {"web": 0, "impuestos": 0, "otros": 0},
  "meta_mensual": 0,
  "precios_tabla": {
    "biblia": [40000, 50000, 60000, 70000, 80000],
    "journal": [40000, 50000, 60000, 70000, 80000]
  },
  "escenarios": {
    "lotes": [30, 50, 100, 150, 200],
    "costos": [10000, 20000, 30000, 40000, 50000],
    "precios": [40000, 50000, 60000, 70000, 80000]
  }
}'::jsonb;
