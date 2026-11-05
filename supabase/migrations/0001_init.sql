-- EDEN back office: esquema inicial.
-- Reglas: plata en pesos enteros (bigint), precio y costo congelados en cada línea de pedido,
-- RLS en todas las tablas (solo admins), estados con enum y auditoría por trigger.

create extension if not exists pgcrypto;

-- ───────────────────────── Tipos ─────────────────────────
create type canal_venta    as enum ('web', 'whatsapp', 'instagram', 'feria', 'iglesia', 'otro');
create type estado_pedido  as enum ('pendiente_pago', 'pagado', 'en_preparacion', 'despachado', 'entregado', 'cancelado');
create type medio_pago     as enum ('mercadopago', 'transferencia', 'efectivo', 'otro');
create type estado_pago    as enum ('pendiente', 'comprobante_recibido', 'aprobado', 'rechazado', 'reembolsado');
create type categoria_gasto as enum ('desarrollo', 'produccion', 'publicidad', 'envios', 'operativo', 'otro');
create type socio          as enum ('fede', 'nari', 'mich', 'eden');
create type origen_cliente as enum ('anuncio', 'instagram', 'tiktok', 'recomendacion', 'iglesia', 'google', 'otro');
create type tipo_producto  as enum ('biblia', 'journal');

-- ───────────────────────── Admins ─────────────────────────
create table admins (
  email  text primary key check (email = lower(email)),
  nombre text not null,
  socio  socio not null
);

create function is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.admins
    where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

create function actor() returns text
language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'email', 'sistema');
$$;

-- ───────────────────────── Catálogo y stock ─────────────────────────
create table productos (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  nombre     text not null,
  tipo       tipo_producto not null,
  diseno     text not null,
  precio     bigint not null check (precio >= 0),
  activo     boolean not null default true,
  orden      int not null default 0,
  created_at timestamptz not null default now()
);

create table lotes (
  id             uuid primary key default gen_random_uuid(),
  producto_id    uuid not null references productos (id),
  numero         int not null check (numero > 0),
  unidades       int not null check (unidades > 0),
  merma          int not null default 0 check (merma >= 0),
  costo_unitario bigint not null check (costo_unitario >= 0), -- costo directo por unidad producida
  fecha          date not null default current_date,
  nota           text,
  created_at     timestamptz not null default now(),
  unique (producto_id, numero),
  check (merma < unidades)
);

-- ───────────────────────── Clientes y pedidos ─────────────────────────
create table clientes (
  id         uuid primary key default gen_random_uuid(),
  nombre     text not null check (length(trim(nombre)) > 0),
  email      text check (email is null or email = lower(email)),
  whatsapp   text,
  provincia  text,
  origen     origen_cliente,
  etiquetas  text[] not null default '{}',
  nota       text,
  created_at timestamptz not null default now()
);
create index clientes_email_idx on clientes (email);
create index clientes_whatsapp_idx on clientes (whatsapp);

create table pedidos (
  id              uuid primary key default gen_random_uuid(),
  numero          int generated always as identity unique,
  cliente_id      uuid not null references clientes (id),
  canal           canal_venta not null,
  estado          estado_pedido not null default 'pendiente_pago',
  medio_pago      medio_pago not null,
  subtotal        bigint not null default 0 check (subtotal >= 0),
  descuento       bigint not null default 0 check (descuento >= 0),
  descuento_set   bigint not null default 0 check (descuento_set >= 0), -- automático: Biblia + Journal al precio del Set
  envio_cobrado   bigint not null default 0 check (envio_cobrado >= 0),
  total           bigint generated always as (subtotal - descuento - descuento_set + envio_cobrado) stored,
  grabado         text,
  nota            text,
  direccion_envio text,
  vence_at        timestamptz,                 -- solo transferencias sin pagar
  token_publico   uuid not null default gen_random_uuid() unique, -- link de seguimiento sin login
  pagado_at       timestamptz,
  preparacion_at  timestamptz,
  despachado_at   timestamptz,
  entregado_at    timestamptz,
  cancelado_at    timestamptz,
  created_by      text not null default actor(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (descuento + descuento_set <= subtotal)
);
create index pedidos_estado_idx on pedidos (estado);
create index pedidos_cliente_idx on pedidos (cliente_id);
create index pedidos_created_idx on pedidos (created_at desc);

create table pedido_items (
  id              uuid primary key default gen_random_uuid(),
  pedido_id       uuid not null references pedidos (id) on delete cascade,
  producto_id     uuid not null references productos (id),
  cantidad        int not null check (cantidad > 0),
  precio_unitario bigint not null check (precio_unitario >= 0),
  costo_unitario  bigint not null check (costo_unitario >= 0)
);
create index pedido_items_pedido_idx on pedido_items (pedido_id);

create table pagos (
  id                    uuid primary key default gen_random_uuid(),
  pedido_id             uuid not null references pedidos (id) on delete cascade,
  medio                 medio_pago not null,
  estado                estado_pago not null default 'pendiente',
  bruto                 bigint not null check (bruto >= 0),
  comision              bigint not null default 0 check (comision >= 0),
  neto                  bigint generated always as (bruto - comision) stored,
  acreditacion_esperada date,
  id_externo            text unique,          -- id de Mercado Pago: evita procesar dos veces el mismo pago
  comprobante_path      text,                 -- archivo en el bucket privado "comprobantes"
  confirmado_por        text,
  created_at            timestamptz not null default now(),
  check (comision <= bruto)
);
create index pagos_pedido_idx on pagos (pedido_id);

create table envios (
  id            uuid primary key default gen_random_uuid(),
  pedido_id     uuid not null unique references pedidos (id) on delete cascade,
  empresa       text not null,
  seguimiento   text,
  costo_real    bigint not null check (costo_real >= 0),
  despachado_at timestamptz not null default now(),
  entregado_at  timestamptz
);

-- ───────────────────────── Gastos ─────────────────────────
create table gastos (
  id               uuid primary key default gen_random_uuid(),
  fecha            date not null default current_date,
  categoria        categoria_gasto not null,
  descripcion      text not null check (length(trim(descripcion)) > 0),
  monto            bigint not null check (monto > 0),   -- siempre en ARS
  moneda           text not null default 'ARS' check (moneda in ('ARS', 'USD')),
  monto_original   numeric(14, 2),
  tipo_cambio      numeric(12, 2),
  lote_id          uuid references lotes (id),
  pagado_por       socio not null default 'eden',
  reintegrado      boolean not null default false,       -- EDEN ya le devolvió la plata al socio
  comprobante_path text,
  created_by       text not null default actor(),
  created_at       timestamptz not null default now()
);
create index gastos_fecha_idx on gastos (fecha desc);

-- ───────────────────────── Ajustes (una sola fila) ─────────────────────────
create table ajustes (
  id                              int primary key default 1 check (id = 1),
  precio_set                      bigint not null default 120000,         -- 1 Biblia + 1 Journal (0 = sin promo)
  comision_mp                     numeric(7, 5) not null default 0.01803, -- MP a 35 días: 1,49% + IVA
  dias_acreditacion_mp            int not null default 35,
  alias_transferencia             text not null default '',
  horas_vencimiento_transferencia int not null default 48,
  envio_estimado                  bigint not null default 12000,
  objetivo_costo_por_venta        bigint not null default 1600,
  dias_fabricacion_lote           int not null default 30,
  objetivo_pct_set                numeric(4, 3) not null default 0.300,
  updated_at                      timestamptz not null default now()
);
insert into ajustes (id) values (1);

-- ───────────────────────── Auditoría ─────────────────────────
create table eventos (
  id         bigint generated always as identity primary key,
  pedido_id  uuid not null references pedidos (id) on delete cascade,
  tipo       text not null,
  detalle    jsonb not null default '{}',
  actor      text not null default actor(),
  created_at timestamptz not null default now()
);
create index eventos_pedido_idx on eventos (pedido_id, created_at);

create function trg_pedido_estado() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.estado is distinct from old.estado then
    case new.estado
      when 'pagado'         then new.pagado_at := coalesce(new.pagado_at, now()); new.vence_at := null;
      when 'en_preparacion' then new.preparacion_at := now();
      when 'despachado'     then new.despachado_at := now();
      when 'entregado'      then new.entregado_at := now();
      when 'cancelado'      then new.cancelado_at := now(); new.vence_at := null;
      else null;
    end case;
    insert into eventos (pedido_id, tipo, detalle)
    values (new.id, 'estado', jsonb_build_object('de', old.estado, 'a', new.estado));
  end if;
  return new;
end $$;

create trigger pedidos_estado before update on pedidos
for each row execute function trg_pedido_estado();

create function trg_pedido_creado() returns trigger
language plpgsql set search_path = public as $$
begin
  insert into eventos (pedido_id, tipo, detalle)
  values (new.id, 'creado', jsonb_build_object('estado', new.estado, 'canal', new.canal, 'medio_pago', new.medio_pago));
  return null;
end $$;

create trigger pedidos_creado after insert on pedidos
for each row execute function trg_pedido_creado();

-- ───────────────────────── Vistas ─────────────────────────
-- Stock por producto: fabricado (sin merma) menos comprometido en pedidos no cancelados.
create view v_stock with (security_invoker = true) as
with fabricado as (
  select producto_id, sum(unidades - merma)::int as unidades
  from lotes group by producto_id
), comprometido as (
  select i.producto_id, sum(i.cantidad)::int as unidades
  from pedido_items i
  join pedidos p on p.id = i.pedido_id and p.estado <> 'cancelado'
  group by 1
)
select pr.id as producto_id, pr.nombre, pr.tipo, pr.diseno, pr.orden,
       coalesce(f.unidades, 0) as fabricadas,
       coalesce(c.unidades, 0) as comprometidas,
       coalesce(f.unidades, 0) - coalesce(c.unidades, 0) as disponibles
from productos pr
left join fabricado f on f.producto_id = pr.id
left join comprometido c on c.producto_id = pr.id;

-- Costo por unidad vendible del último lote (reparte la merma, igual que la planilla).
create function costo_actual(p_producto uuid) returns bigint
language sql stable set search_path = public as $$
  select coalesce((
    select round(costo_unitario::numeric * unidades / (unidades - merma))::bigint
    from lotes where producto_id = p_producto
    order by fecha desc, numero desc limit 1), 0);
$$;

-- ───────────────────────── Operaciones (atómicas) ─────────────────────────
create function _exigir_admin() returns void
language plpgsql stable set search_path = public as $$
begin
  if not is_admin() then raise exception 'No autorizado' using errcode = '42501'; end if;
end $$;

-- Registra un pago aprobado con su comisión y fecha de acreditación, y marca el pedido como pagado.
create function _aprobar_pago(p_pedido uuid, p_medio medio_pago, p_id_externo text default null)
returns void language plpgsql set search_path = public as $$
declare
  v_total bigint;
  v_aj ajustes%rowtype;
  v_comision bigint := 0;
  v_acred date := current_date;
  v_pago uuid;
begin
  select total into v_total from pedidos where id = p_pedido for update;
  select * into v_aj from ajustes where id = 1;
  if p_medio = 'mercadopago' then
    v_comision := round(v_total * v_aj.comision_mp);
    v_acred := current_date + v_aj.dias_acreditacion_mp;
  end if;

  select id into v_pago from pagos
  where pedido_id = p_pedido and estado in ('pendiente', 'comprobante_recibido')
  order by created_at desc limit 1;

  if v_pago is null then
    insert into pagos (pedido_id, medio, estado, bruto, comision, acreditacion_esperada, id_externo, confirmado_por)
    values (p_pedido, p_medio, 'aprobado', v_total, v_comision, v_acred, p_id_externo, actor());
  else
    update pagos set medio = p_medio, estado = 'aprobado', bruto = v_total, comision = v_comision,
           acreditacion_esperada = v_acred, id_externo = coalesce(p_id_externo, id_externo), confirmado_por = actor()
    where id = v_pago;
  end if;

  update pedidos set estado = 'pagado', medio_pago = p_medio where id = p_pedido;
end $$;

-- Crea un pedido completo. Precio y costo salen de la base, nunca del navegador.
-- p: { cliente: {id?, nombre, email?, whatsapp?, provincia?, origen?}, canal, medio_pago,
--      items: [{producto_id, cantidad}], descuento?, envio_cobrado?, grabado?, nota?, direccion_envio?, ya_pagado? }
create function crear_pedido(p jsonb) returns uuid
language plpgsql set search_path = public as $$
declare
  v_cli jsonb := p -> 'cliente';
  v_cliente uuid := nullif(v_cli ->> 'id', '')::uuid;
  v_email text := nullif(lower(trim(v_cli ->> 'email')), '');
  v_wa text := nullif(regexp_replace(coalesce(v_cli ->> 'whatsapp', ''), '\D', '', 'g'), '');
  v_medio medio_pago := (p ->> 'medio_pago')::medio_pago;
  v_pedido uuid;
  v_item jsonb;
  v_prod productos%rowtype;
  v_cant int;
  v_subtotal bigint := 0;
  v_falta record;
  v_pares int := 0;
  v_min_biblia bigint;
  v_min_journal bigint;
  v_precio_set bigint;
  v_desc_set bigint := 0;
begin
  perform _exigir_admin();
  if jsonb_array_length(coalesce(p -> 'items', '[]')) = 0 then
    raise exception 'El pedido no tiene productos';
  end if;

  -- Cliente: el indicado, o uno existente con el mismo mail o WhatsApp, o uno nuevo.
  if v_cliente is null then
    select id into v_cliente from clientes
    where (v_email is not null and email = v_email) or (v_wa is not null and whatsapp = v_wa)
    order by created_at limit 1;
  end if;
  if v_cliente is null then
    insert into clientes (nombre, email, whatsapp, provincia, origen)
    values (trim(v_cli ->> 'nombre'), v_email, v_wa, nullif(v_cli ->> 'provincia', ''),
            nullif(v_cli ->> 'origen', '')::origen_cliente)
    returning id into v_cliente;
  else
    update clientes set
      email     = coalesce(email, v_email),
      whatsapp  = coalesce(whatsapp, v_wa),
      provincia = coalesce(nullif(v_cli ->> 'provincia', ''), provincia),
      origen    = coalesce(origen, nullif(v_cli ->> 'origen', '')::origen_cliente)
    where id = v_cliente;
  end if;

  -- Un pedido a la vez valida stock: no se vende lo que no existe.
  perform pg_advisory_xact_lock(hashtext('eden_stock'));

  insert into pedidos (cliente_id, canal, medio_pago, descuento, envio_cobrado, grabado, nota, direccion_envio, vence_at)
  values (v_cliente, (p ->> 'canal')::canal_venta, v_medio,
          coalesce((p ->> 'descuento')::bigint, 0), coalesce((p ->> 'envio_cobrado')::bigint, 0),
          nullif(trim(p ->> 'grabado'), ''), nullif(trim(p ->> 'nota'), ''), nullif(trim(p ->> 'direccion_envio'), ''),
          case when v_medio = 'transferencia' and not coalesce((p ->> 'ya_pagado')::boolean, false)
               then now() + make_interval(hours => (select horas_vencimiento_transferencia from ajustes where id = 1)) end)
  returning id into v_pedido;

  for v_item in select * from jsonb_array_elements(p -> 'items') loop
    v_cant := (v_item ->> 'cantidad')::int;
    if v_cant is null or v_cant <= 0 then raise exception 'Cantidad inválida'; end if;
    select * into v_prod from productos where id = (v_item ->> 'producto_id')::uuid and activo;
    if not found then raise exception 'Producto inexistente o inactivo'; end if;
    insert into pedido_items (pedido_id, producto_id, cantidad, precio_unitario, costo_unitario)
    values (v_pedido, v_prod.id, v_cant, v_prod.precio, costo_actual(v_prod.id));
    v_subtotal := v_subtotal + v_cant * v_prod.precio;
  end loop;

  select nombre, disponibles into v_falta from v_stock where disponibles < 0 limit 1;
  if found then raise exception 'No hay stock de %', v_falta.nombre; end if;

  -- Set: cada par Biblia + Journal (de cualquier diseño) se cobra al precio del Set.
  select coalesce(least(sum(i.cantidad) filter (where pr.tipo = 'biblia'), sum(i.cantidad) filter (where pr.tipo = 'journal')), 0),
         min(i.precio_unitario) filter (where pr.tipo = 'biblia'),
         min(i.precio_unitario) filter (where pr.tipo = 'journal')
    into v_pares, v_min_biblia, v_min_journal
  from pedido_items i join productos pr on pr.id = i.producto_id
  where i.pedido_id = v_pedido;
  select precio_set into v_precio_set from ajustes where id = 1;
  if v_pares > 0 and v_precio_set > 0 then
    v_desc_set := greatest(0, v_pares * (v_min_biblia + v_min_journal - v_precio_set));
  end if;

  update pedidos set subtotal = v_subtotal, descuento_set = v_desc_set where id = v_pedido;

  if coalesce((p ->> 'ya_pagado')::boolean, false) then
    perform _aprobar_pago(v_pedido, v_medio);
  elsif v_medio = 'transferencia' then
    insert into pagos (pedido_id, medio, estado, bruto)
    select v_pedido, 'transferencia', 'pendiente', total from pedidos where id = v_pedido;
  end if;

  return v_pedido;
end $$;

create function confirmar_pago(p_pedido uuid) returns void
language plpgsql set search_path = public as $$
declare v_estado estado_pedido; v_medio medio_pago;
begin
  perform _exigir_admin();
  select estado, medio_pago into v_estado, v_medio from pedidos where id = p_pedido for update;
  if v_estado is distinct from 'pendiente_pago' then raise exception 'El pedido no está pendiente de pago'; end if;
  perform _aprobar_pago(p_pedido, v_medio);
end $$;

create function rechazar_comprobante(p_pedido uuid) returns void
language plpgsql set search_path = public as $$
begin
  perform _exigir_admin();
  update pagos set estado = 'pendiente', comprobante_path = null
  where pedido_id = p_pedido and estado = 'comprobante_recibido';
  insert into eventos (pedido_id, tipo) values (p_pedido, 'comprobante_rechazado');
end $$;

create function pasar_a_preparacion(p_pedido uuid) returns void
language plpgsql set search_path = public as $$
begin
  perform _exigir_admin();
  update pedidos set estado = 'en_preparacion' where id = p_pedido and estado = 'pagado';
  if not found then raise exception 'El pedido tiene que estar pagado'; end if;
end $$;

create function despachar(p_pedido uuid, p_empresa text, p_seguimiento text, p_costo bigint) returns void
language plpgsql set search_path = public as $$
begin
  perform _exigir_admin();
  if p_costo is null or p_costo < 0 then raise exception 'Costo de envío inválido'; end if;
  update pedidos set estado = 'despachado' where id = p_pedido and estado in ('pagado', 'en_preparacion');
  if not found then raise exception 'El pedido tiene que estar pagado o en preparación'; end if;
  insert into envios (pedido_id, empresa, seguimiento, costo_real)
  values (p_pedido, trim(p_empresa), nullif(trim(p_seguimiento), ''), p_costo)
  on conflict (pedido_id) do update set empresa = excluded.empresa, seguimiento = excluded.seguimiento,
    costo_real = excluded.costo_real, despachado_at = now();
end $$;

create function marcar_entregado(p_pedido uuid) returns void
language plpgsql set search_path = public as $$
begin
  perform _exigir_admin();
  update pedidos set estado = 'entregado' where id = p_pedido and estado = 'despachado';
  if not found then raise exception 'El pedido tiene que estar despachado'; end if;
  update envios set entregado_at = now() where pedido_id = p_pedido;
end $$;

-- Cancelar libera el stock. Si ya estaba cobrado, el pago queda como reembolsado.
create function cancelar_pedido(p_pedido uuid) returns void
language plpgsql set search_path = public as $$
begin
  perform _exigir_admin();
  update pedidos set estado = 'cancelado'
  where id = p_pedido and estado in ('pendiente_pago', 'pagado', 'en_preparacion');
  if not found then raise exception 'Un pedido despachado no se puede cancelar'; end if;
  update pagos set estado = case when estado = 'aprobado' then 'reembolsado'::estado_pago else 'rechazado'::estado_pago end
  where pedido_id = p_pedido and estado <> 'rechazado';
end $$;

create function extender_vencimiento(p_pedido uuid, p_horas int default 24) returns void
language plpgsql set search_path = public as $$
begin
  perform _exigir_admin();
  update pedidos set vence_at = greatest(coalesce(vence_at, now()), now()) + make_interval(hours => p_horas)
  where id = p_pedido and estado = 'pendiente_pago';
  insert into eventos (pedido_id, tipo, detalle) values (p_pedido, 'vencimiento_extendido', jsonb_build_object('horas', p_horas));
end $$;

-- ───────────────────────── Métricas ─────────────────────────
create view v_pedidos_validos with (security_invoker = true) as
select * from pedidos where estado in ('pagado', 'en_preparacion', 'despachado', 'entregado');

-- Ganancia real de cada pedido cobrado: neto cobrado − costo de productos − envío (real o estimado).
create view v_ganancia_pedido with (security_invoker = true) as
select p.id as pedido_id, p.created_at, p.pagado_at, p.canal, c.origen, p.total,
       p.descuento + p.descuento_set - p.envio_cobrado as descuento_total,
       coalesce(pg.neto, p.total) as neto,
       coalesce(pg.comision, 0) as comision,
       (select coalesce(sum(i.cantidad * i.costo_unitario), 0) from pedido_items i where i.pedido_id = p.id) as costo_productos,
       coalesce(e.costo_real, (select envio_estimado from ajustes where id = 1)) as costo_envio,
       e.costo_real is not null as envio_real
from v_pedidos_validos p
join clientes c on c.id = p.cliente_id
left join (select pedido_id, sum(neto) as neto, sum(comision) as comision
           from pagos where estado = 'aprobado' group by pedido_id) pg on pg.pedido_id = p.id
left join envios e on e.pedido_id = p.id;

create function metricas_panel() returns jsonb
language plpgsql stable set search_path = public as $$
declare
  v_aj ajustes%rowtype;
  r jsonb := '{}';
  v_invertido bigint; v_recuperado bigint; v_pedidos int; v_prom numeric;
begin
  perform _exigir_admin();
  select * into v_aj from ajustes where id = 1;

  -- 1. Recupero de la inversión
  select coalesce(sum(monto), 0) into v_invertido from gastos;
  select coalesce(sum(neto - costo_envio), 0), count(*) into v_recuperado, v_pedidos from v_ganancia_pedido;
  v_prom := case when v_pedidos > 0 then v_recuperado::numeric / v_pedidos end;
  r := r || jsonb_build_object('recupero', jsonb_build_object(
    'invertido', v_invertido, 'recuperado', v_recuperado, 'pedidos', v_pedidos,
    'ventas_faltan', case when v_prom > 0 and v_invertido > v_recuperado
                          then ceil((v_invertido - v_recuperado) / v_prom) when v_invertido <= v_recuperado then 0 end));

  -- 2. Stock y días hasta agotar, por producto (ritmo de los últimos 14 días)
  r := r || jsonb_build_object('stock', coalesce((
    select jsonb_agg(jsonb_build_object(
      'producto', s.nombre, 'tipo', s.tipo, 'disponibles', s.disponibles, 'vendidas_14d', coalesce(v.u, 0),
      'dias_hasta_agotar', case when coalesce(v.u, 0) > 0 then floor(s.disponibles / (v.u / 14.0)) end,
      'pedir_lote', coalesce(v.u, 0) > 0 and s.disponibles / (v.u / 14.0) < v_aj.dias_fabricacion_lote)
      order by s.orden)
    from v_stock s
    left join (
      select i.producto_id, sum(i.cantidad) as u
      from pedido_items i join pedidos p on p.id = i.pedido_id
      where p.estado <> 'cancelado' and p.created_at > now() - interval '14 days'
      group by 1) v on v.producto_id = s.producto_id), '[]'),
    'dias_fabricacion_lote', v_aj.dias_fabricacion_lote);

  -- 3. Ganancia real por unidad, por línea (Biblia / Journal), contra la planificada sin Set
  r := r || jsonb_build_object('ganancia_producto', coalesce((
    select jsonb_agg(x order by x ->> 'producto') from (
      select jsonb_build_object(
        'producto', initcap(pr.tipo::text),
        'unidades', sum(i.cantidad),
        'real', round(sum(i.cantidad * i.precio_unitario * (g.neto - g.costo_envio)::numeric / nullif(g.total + g.descuento_total, 0)
                           - i.cantidad * i.costo_unitario) / sum(i.cantidad)),
        'planificada', round(avg(i.precio_unitario - i.costo_unitario - i.precio_unitario * v_aj.comision_mp) - v_aj.envio_estimado)) as x
      from pedido_items i
      join v_ganancia_pedido g on g.pedido_id = i.pedido_id
      join productos pr on pr.id = i.producto_id
      group by pr.tipo) t), '[]'));

  -- 4. Peso del Set en los pedidos (últimos 30 días)
  r := r || jsonb_build_object('set', (
    select jsonb_build_object('pedidos', count(*), 'con_set', count(*) filter (where descuento_set > 0),
                              'objetivo', v_aj.objetivo_pct_set)
    from v_pedidos_validos where created_at > now() - interval '30 days'));

  -- 5. Costo por venta de la publicidad (últimos 30 días)
  r := r || jsonb_build_object('publicidad', jsonb_build_object(
    'gasto', (select coalesce(sum(monto), 0) from gastos where categoria = 'publicidad' and fecha > current_date - 30),
    'ventas', (select count(*) from v_ganancia_pedido where origen = 'anuncio' and created_at > now() - interval '30 days'),
    'objetivo', v_aj.objetivo_costo_por_venta));

  -- 6. Ventas por canal y por cómo nos conocieron (últimos 30 días)
  r := r || jsonb_build_object(
    'canales', coalesce((select jsonb_agg(jsonb_build_object('nombre', canal, 'pedidos', n, 'total', t) order by n desc)
      from (select canal::text, count(*) n, sum(total) t from v_ganancia_pedido
            where created_at > now() - interval '30 days' group by canal) c), '[]'),
    'origenes', coalesce((select jsonb_agg(jsonb_build_object('nombre', o, 'pedidos', n, 'total', t) order by n desc)
      from (select coalesce(origen::text, 'sin_dato') o, count(*) n, sum(total) t from v_ganancia_pedido
            where created_at > now() - interval '30 days' group by 1) c), '[]'));

  -- 7. Envío real contra el estimado
  r := r || jsonb_build_object('envio', jsonb_build_object(
    'promedio_real', (select round(avg(costo_real)) from envios),
    'envios', (select count(*) from envios),
    'estimado', v_aj.envio_estimado));

  -- 8. Plata de Mercado Pago por acreditar, por semana
  r := r || jsonb_build_object('por_acreditar', coalesce((
    select jsonb_agg(jsonb_build_object('semana', semana, 'neto', neto) order by semana)
    from (select date_trunc('week', acreditacion_esperada)::date as semana, sum(neto) as neto
          from pagos where estado = 'aprobado' and acreditacion_esperada > current_date
          group by 1) s), '[]'));

  return r;
end $$;

-- ───────────────────────── Seguridad ─────────────────────────
do $$
declare t text;
begin
  foreach t in array array['admins','productos','lotes','clientes','pedidos',
                           'pedido_items','pagos','envios','gastos','ajustes','eventos'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for all to authenticated using (is_admin()) with check (is_admin())',
                   'admins_todo_' || t, t);
  end loop;
end $$;

-- Las funciones solo las ejecutan usuarios logueados (y igual validan que sean admins).
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;

-- Comprobantes: bucket privado, solo admins (en la fase 2 el cliente sube con un link firmado del servidor).
insert into storage.buckets (id, name, public) values ('comprobantes', 'comprobantes', false)
on conflict (id) do nothing;
create policy comprobantes_admins on storage.objects for all to authenticated
using (bucket_id = 'comprobantes' and public.is_admin())
with check (bucket_id = 'comprobantes' and public.is_admin());
