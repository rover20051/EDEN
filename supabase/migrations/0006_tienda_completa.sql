-- Tienda completa: costo real por tanda (la venta sale de la tanda más vieja), salidas sin cobro (regalos de Edén),
-- cupones, packs, productos con foto, lista de espera, tarifas de envío, registro de mails/avisos y pago con tarjeta
-- desde el servidor (Nave o el modo prueba).

-- ───────────────────────── Productos con datos para la web ─────────────────────────
alter table productos
  add column descripcion text check (descripcion is null or length(descripcion) <= 300),
  add column verbo text check (verbo is null or length(verbo) <= 30),
  add column foto_path text; -- archivo en el bucket público "productos" (si falta, la web usa sus fotos)

-- ───────────────────────── Packs (ej. Set Origen: Biblia + Journal) ─────────────────────────
-- Precio propio, sin stock propio: descuenta el de sus productos. Su descuento se suma a descuento_set.
create table packs (
  id              uuid primary key default gen_random_uuid(),
  slug            text not null unique,
  nombre          text not null check (length(trim(nombre)) > 0),
  descripcion     text check (descripcion is null or length(descripcion) <= 300),
  precio          bigint not null check (precio > 0),
  precio_anterior bigint check (precio_anterior is null or precio_anterior > 0),
  etiqueta        text check (etiqueta is null or length(etiqueta) between 1 and 30),
  foto_path       text,
  activo          boolean not null default true,
  orden           int not null default 0,
  created_at      timestamptz not null default now()
);
create table pack_items (
  pack_id     uuid not null references packs (id) on delete cascade,
  producto_id uuid not null references productos (id),
  cantidad    int not null default 1 check (cantidad > 0),
  primary key (pack_id, producto_id)
);
alter table pedido_items add column pack_id uuid references packs (id);

-- ───────────────────────── Cupones ─────────────────────────
create table cupones (
  codigo     text primary key check (codigo = upper(codigo) and codigo ~ '^[A-Z0-9_-]{3,30}$'),
  tipo       text not null check (tipo in ('porcentaje', 'monto')),
  valor      bigint not null check (valor > 0),
  minimo     bigint not null default 0 check (minimo >= 0), -- compra mínima (después del Set)
  usos_max   int check (usos_max is null or usos_max > 0),
  vence      date,
  activo     boolean not null default true,
  nota       text,
  created_at timestamptz not null default now(),
  check (tipo <> 'porcentaje' or valor <= 100)
);
alter table pedidos
  add column cupon text references cupones (codigo) on update cascade,
  add column descuento_cupon bigint not null default 0 check (descuento_cupon >= 0); -- ya incluido en "descuento"

-- ───────────────────────── Salidas sin cobro ─────────────────────────
-- Una "salida" es un pedido que sale sin cobrarse (regalo de Edén, influencer, reposición): tiene costo y no ingresa plata.
alter table pedidos
  add column tipo text not null default 'venta' check (tipo in ('venta', 'salida')),
  add column salida_motivo text check (salida_motivo in ('regalo', 'influencer', 'reposicion', 'muestra', 'otro')),
  add column salida_por text check (salida_por in ('fede', 'nari', 'mich', 'eden')),
  add check (tipo = 'venta' or salida_motivo is not null);

-- Las métricas de ventas solo miran ventas cobradas; las salidas se miran aparte.
create or replace view v_pedidos_validos with (security_invoker = true) as
select * from pedidos where estado in ('pagado', 'en_preparacion', 'despachado', 'entregado') and tipo = 'venta';

-- ───────────────────────── Envío por provincia ─────────────────────────
alter table ajustes
  add column envio_tarifas jsonb not null default '{}', -- {"Córdoba": 9500, ...}; provincia sin precio = "a coordinar"
  add column envio_gratis_desde bigint check (envio_gratis_desde is null or envio_gratis_desde > 0);

-- Precio del envío para una provincia y un monto de compra. null = a coordinar.
create function tarifa_envio(p_provincia text, p_monto bigint) returns bigint
language sql stable set search_path = public as $$
  select case
    when a.envio_gratis_desde is not null and p_monto >= a.envio_gratis_desde then 0
    else nullif(a.envio_tarifas ->> p_provincia, '')::bigint end
  from ajustes a where a.id = 1;
$$;

-- ───────────────────────── Costo real por tanda (FIFO) ─────────────────────────
-- Cada unidad vendida o regalada sale de una tanda concreta, la más vieja con lugar.
create table asignaciones (
  pedido_item_id uuid not null references pedido_items (id) on delete cascade,
  lote_id        uuid not null references lotes (id),
  cantidad       int not null check (cantidad > 0),
  costo_unitario bigint not null check (costo_unitario >= 0), -- costo por unidad vendible de esa tanda (reparte la merma)
  primary key (pedido_item_id, lote_id)
);
create index asignaciones_lote_idx on asignaciones (lote_id);

create function _costo_vendible(l lotes) returns bigint
language sql immutable as $$
  select round(l.costo_unitario::numeric * l.unidades / (l.unidades - l.merma))::bigint;
$$;

-- Reparte una línea entre tandas (más vieja primero) y devuelve el costo promedio por unidad.
create function _asignar_tandas(p_item uuid, p_producto uuid, p_cantidad int) returns bigint
language plpgsql set search_path = public as $$
declare
  v_falta int := p_cantidad;
  v_costo numeric := 0;
  v_lote record;
  v_toma int;
begin
  for v_lote in
    select l.*, (l.unidades - l.merma) - coalesce((
             select sum(a.cantidad) from asignaciones a
             join pedido_items i on i.id = a.pedido_item_id
             join pedidos p on p.id = i.pedido_id and p.estado <> 'cancelado'
             where a.lote_id = l.id), 0) as libres
    from lotes l where l.producto_id = p_producto
    order by l.fecha, l.numero
  loop
    exit when v_falta = 0;
    continue when v_lote.libres <= 0;
    v_toma := least(v_falta, v_lote.libres);
    insert into asignaciones (pedido_item_id, lote_id, cantidad, costo_unitario)
    values (p_item, v_lote.id, v_toma, round(v_lote.costo_unitario::numeric * v_lote.unidades / (v_lote.unidades - v_lote.merma)));
    v_costo := v_costo + v_toma * round(v_lote.costo_unitario::numeric * v_lote.unidades / (v_lote.unidades - v_lote.merma));
    v_falta := v_falta - v_toma;
  end loop;
  -- Si falta, el control de stock de crear_pedido corta con "No hay stock de …".
  return case when p_cantidad > v_falta then round(v_costo / (p_cantidad - v_falta)) else 0 end;
end $$;

-- ───────────────────────── Crear pedido (reemplaza al anterior) ─────────────────────────
-- p: { cliente: {id?, nombre, email?, whatsapp?, provincia?, origen?}, canal, medio_pago,
--      items: [{producto_id, cantidad} | {pack_id, cantidad}],
--      tipo?: 'venta'|'salida', salida_motivo?, salida_por?, cupon?, descuento?, envio_cobrado?, envio_auto?,
--      es_regalo?, regalo_para?, regalo_mensaje?, grabado?, nota?, direccion_envio?, ya_pagado? }
create or replace function crear_pedido(p jsonb) returns uuid
language plpgsql set search_path = public as $$
declare
  v_cli jsonb := p -> 'cliente';
  v_cliente uuid := nullif(v_cli ->> 'id', '')::uuid;
  v_email text := nullif(lower(trim(v_cli ->> 'email')), '');
  v_wa text := nullif(regexp_replace(coalesce(v_cli ->> 'whatsapp', ''), '\D', '', 'g'), '');
  v_tipo text := coalesce(nullif(p ->> 'tipo', ''), 'venta');
  v_salida boolean;
  v_medio medio_pago;
  v_pedido uuid;
  v_item jsonb;
  v_prod productos%rowtype;
  v_pack packs%rowtype;
  v_pi record;
  v_item_id uuid;
  v_cant int;
  v_subtotal bigint := 0;
  v_lista_pack bigint;
  v_desc_pack bigint := 0;
  v_falta record;
  v_pares int := 0;
  v_min_biblia bigint;
  v_min_journal bigint;
  v_aj ajustes%rowtype;
  v_desc_set bigint := 0;
  v_desc_manual bigint := greatest(coalesce((p ->> 'descuento')::bigint, 0), 0);
  v_cup cupones%rowtype;
  v_desc_cupon bigint := 0;
  v_base bigint;
  v_envio bigint := greatest(coalesce((p ->> 'envio_cobrado')::bigint, 0), 0);
begin
  perform _exigir_admin();
  if v_tipo not in ('venta', 'salida') then raise exception 'Tipo de pedido inválido'; end if;
  v_salida := v_tipo = 'salida';
  v_medio := case when v_salida then 'otro' else (p ->> 'medio_pago')::medio_pago end;
  if jsonb_array_length(coalesce(p -> 'items', '[]')) = 0 then
    raise exception 'El pedido no tiene productos';
  end if;
  select * into v_aj from ajustes where id = 1;

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

  insert into pedidos (cliente_id, canal, medio_pago, grabado, nota, direccion_envio, vence_at,
                       tipo, salida_motivo, salida_por, es_regalo, regalo_para, regalo_mensaje)
  values (v_cliente, case when v_salida then 'otro' else (p ->> 'canal')::canal_venta end, v_medio,
          nullif(trim(p ->> 'grabado'), ''), nullif(trim(p ->> 'nota'), ''), nullif(trim(p ->> 'direccion_envio'), ''),
          case when not v_salida and v_medio = 'transferencia' and not coalesce((p ->> 'ya_pagado')::boolean, false)
               then now() + make_interval(hours => v_aj.horas_vencimiento_transferencia) end,
          v_tipo,
          case when v_salida then coalesce(nullif(p ->> 'salida_motivo', ''), 'regalo') end,
          case when v_salida then nullif(p ->> 'salida_por', '') end,
          coalesce((p ->> 'es_regalo')::boolean, false),
          nullif(left(trim(p ->> 'regalo_para'), 80), ''),
          nullif(left(trim(p ->> 'regalo_mensaje'), 300), ''))
  returning id into v_pedido;

  for v_item in select * from jsonb_array_elements(p -> 'items') loop
    v_cant := (v_item ->> 'cantidad')::int;
    if v_cant is null or v_cant <= 0 then raise exception 'Cantidad inválida'; end if;

    if nullif(v_item ->> 'pack_id', '') is not null then
      select * into v_pack from packs where id = (v_item ->> 'pack_id')::uuid and activo;
      if not found then raise exception 'Pack inexistente o inactivo'; end if;
      v_lista_pack := 0;
      for v_pi in select pi.cantidad, pr.* from pack_items pi join productos pr on pr.id = pi.producto_id
                  where pi.pack_id = v_pack.id loop
        insert into pedido_items (pedido_id, producto_id, cantidad, precio_unitario, costo_unitario, pack_id)
        values (v_pedido, v_pi.id, v_cant * v_pi.cantidad, case when v_salida then 0 else v_pi.precio end, 0, v_pack.id)
        returning id into v_item_id;
        update pedido_items set costo_unitario = _asignar_tandas(v_item_id, v_pi.id, v_cant * v_pi.cantidad) where id = v_item_id;
        v_lista_pack := v_lista_pack + v_pi.cantidad * v_pi.precio;
      end loop;
      if v_lista_pack = 0 then raise exception 'El pack % no tiene productos', v_pack.nombre; end if;
      if not v_salida then
        v_subtotal := v_subtotal + v_cant * v_lista_pack;
        v_desc_pack := v_desc_pack + v_cant * greatest(0, v_lista_pack - v_pack.precio);
      end if;
    else
      select * into v_prod from productos where id = (v_item ->> 'producto_id')::uuid and (activo or v_salida);
      if not found then raise exception 'Producto inexistente o inactivo'; end if;
      insert into pedido_items (pedido_id, producto_id, cantidad, precio_unitario, costo_unitario)
      values (v_pedido, v_prod.id, v_cant, case when v_salida then 0 else v_prod.precio end, 0)
      returning id into v_item_id;
      update pedido_items set costo_unitario = _asignar_tandas(v_item_id, v_prod.id, v_cant) where id = v_item_id;
      if not v_salida then v_subtotal := v_subtotal + v_cant * v_prod.precio; end if;
    end if;
  end loop;

  select nombre, disponibles into v_falta from v_stock where disponibles < 0 limit 1;
  if found then raise exception 'No hay stock de %', v_falta.nombre; end if;

  if not v_salida then
    -- Set: cada par Biblia + Journal sueltos (fuera de packs) se cobra al precio del Set.
    select coalesce(least(sum(i.cantidad) filter (where pr.tipo = 'biblia'), sum(i.cantidad) filter (where pr.tipo = 'journal')), 0),
           min(i.precio_unitario) filter (where pr.tipo = 'biblia'),
           min(i.precio_unitario) filter (where pr.tipo = 'journal')
      into v_pares, v_min_biblia, v_min_journal
    from pedido_items i join productos pr on pr.id = i.producto_id
    where i.pedido_id = v_pedido and i.pack_id is null;
    if v_pares > 0 and v_aj.precio_set > 0 then
      v_desc_set := greatest(0, v_pares * (v_min_biblia + v_min_journal - v_aj.precio_set));
    end if;
    v_desc_set := v_desc_set + v_desc_pack;

    -- Cupón: sobre lo que queda después del Set y los packs.
    if nullif(trim(p ->> 'cupon'), '') is not null then
      select * into v_cup from cupones where codigo = upper(trim(p ->> 'cupon')) for update;
      if not found or not v_cup.activo or (v_cup.vence is not null and v_cup.vence < current_date) then
        raise exception 'El cupón % no es válido', upper(trim(p ->> 'cupon'));
      end if;
      if v_cup.usos_max is not null
         and (select count(*) from pedidos where cupon = v_cup.codigo and estado <> 'cancelado') >= v_cup.usos_max then
        raise exception 'El cupón % ya se usó todas las veces', v_cup.codigo;
      end if;
      v_base := v_subtotal - v_desc_set;
      if v_base < v_cup.minimo then raise exception 'El cupón % es para compras desde $%', v_cup.codigo, v_cup.minimo; end if;
      v_desc_cupon := case when v_cup.tipo = 'porcentaje' then round(v_base * v_cup.valor / 100.0) else least(v_cup.valor, v_base) end;
    end if;
    v_desc_manual := least(v_desc_manual + v_desc_cupon, v_subtotal - v_desc_set);

    -- Envío automático (web): tarifa por provincia; sin tarifa queda "a coordinar" (0).
    if coalesce((p ->> 'envio_auto')::boolean, false) then
      v_envio := coalesce(tarifa_envio(nullif(v_cli ->> 'provincia', ''), v_subtotal - v_desc_set - v_desc_manual), 0);
    end if;

    update pedidos set subtotal = v_subtotal, descuento_set = v_desc_set, descuento = v_desc_manual,
                       descuento_cupon = v_desc_cupon, cupon = v_cup.codigo, envio_cobrado = v_envio
    where id = v_pedido;

    if coalesce((p ->> 'ya_pagado')::boolean, false) then
      perform _aprobar_pago(v_pedido, v_medio);
    elsif v_medio = 'transferencia' then
      insert into pagos (pedido_id, medio, estado, bruto)
      select v_pedido, 'transferencia', 'pendiente', total from pedidos where id = v_pedido;
    end if;
  else
    -- Salida: no se cobra; queda lista para preparar y despachar.
    update pedidos set envio_cobrado = 0, estado = 'pagado' where id = v_pedido;
  end if;

  return v_pedido;
end $$;

-- Pedido desde la web: productos o packs, datos del cliente, medio de pago, cupón y regalo. Envío por provincia.
create or replace function crear_pedido_web(p jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare
  v_medio text := p ->> 'medio_pago';
  v_id uuid;
  v_ped pedidos%rowtype;
begin
  if not es_servidor() then raise exception 'No autorizado' using errcode = '42501'; end if;
  if v_medio not in ('transferencia', 'nave') then raise exception 'Medio de pago inválido'; end if;
  if length(trim(coalesce(p -> 'cliente' ->> 'nombre', ''))) < 2 then raise exception 'Falta el nombre'; end if;
  if coalesce(p -> 'cliente' ->> 'email', '') !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'Mail inválido'; end if;

  v_id := crear_pedido(jsonb_build_object(
    'cliente', jsonb_build_object(
      'nombre', p -> 'cliente' ->> 'nombre', 'email', p -> 'cliente' ->> 'email',
      'whatsapp', p -> 'cliente' ->> 'whatsapp', 'provincia', p -> 'cliente' ->> 'provincia',
      'origen', nullif(p -> 'cliente' ->> 'origen', '')),
    'tipo', 'venta',
    'canal', 'web',
    'medio_pago', v_medio,
    'ya_pagado', false,
    'items', p -> 'items',
    'cupon', p ->> 'cupon',
    'envio_auto', true,
    'es_regalo', coalesce((p ->> 'es_regalo')::boolean, false),
    'regalo_para', p ->> 'regalo_para',
    'regalo_mensaje', p ->> 'regalo_mensaje',
    'direccion_envio', p ->> 'direccion_envio',
    'nota', p ->> 'nota'));

  -- Tarjeta: si no completa el pago, el stock se libera antes que en una transferencia.
  if v_medio = 'nave' then
    update pedidos set vence_at = now() + make_interval(hours => (select horas_vencimiento_nave from ajustes where id = 1))
    where id = v_id;
    insert into pagos (pedido_id, medio, estado, bruto) select v_id, 'nave', 'pendiente', total from pedidos where id = v_id;
  end if;

  select * into v_ped from pedidos where id = v_id;
  return jsonb_build_object('id', v_ped.id, 'token', v_ped.token_publico, 'numero', v_ped.numero, 'total', v_ped.total);
end $$;

-- Pago con tarjeta aprobado (webhook de Nave o modo prueba). Idempotente por id externo.
create function aprobar_pago_externo(p_token uuid, p_id_externo text) returns jsonb
language plpgsql set search_path = public as $$
declare v_ped pedidos%rowtype;
begin
  if not es_servidor() then raise exception 'No autorizado' using errcode = '42501'; end if;
  select * into v_ped from pedidos where token_publico = p_token for update;
  if not found then raise exception 'Pedido inexistente'; end if;
  if exists (select 1 from pagos where id_externo = p_id_externo and estado = 'aprobado') then
    return jsonb_build_object('id', v_ped.id, 'numero', v_ped.numero, 'nuevo', false);
  end if;
  if v_ped.estado <> 'pendiente_pago' then raise exception 'El pedido ya no espera pago (%)', v_ped.estado; end if;
  perform _aprobar_pago(v_ped.id, 'nave', p_id_externo);
  return jsonb_build_object('id', v_ped.id, 'numero', v_ped.numero, 'nuevo', true);
end $$;

-- Cupón para mostrar en el checkout antes de confirmar (el descuento final lo calcula crear_pedido).
create function cupon_publico(p_codigo text) returns jsonb
language sql stable set search_path = public as $$
  select case when es_servidor() then (
    select jsonb_build_object('codigo', c.codigo, 'tipo', c.tipo, 'valor', c.valor, 'minimo', c.minimo)
    from cupones c
    where c.codigo = upper(trim(p_codigo)) and c.activo and (c.vence is null or c.vence >= current_date)
      and (c.usos_max is null or (select count(*) from pedidos where cupon = c.codigo and estado <> 'cancelado') < c.usos_max)) end;
$$;

-- Lo que ve el cliente en su link de seguimiento (sin costos ni datos internos).
create or replace function pedido_publico(p_token uuid) returns jsonb
language sql stable set search_path = public as $$
  select case when es_servidor() then (
    select jsonb_build_object(
      'numero', p.numero, 'estado', p.estado, 'medio_pago', p.medio_pago,
      'subtotal', p.subtotal, 'descuento_set', p.descuento_set, 'descuento', p.descuento, 'cupon', p.cupon,
      'envio_cobrado', p.envio_cobrado, 'total', p.total,
      'created_at', p.created_at, 'pagado_at', p.pagado_at, 'preparacion_at', p.preparacion_at,
      'despachado_at', p.despachado_at, 'entregado_at', p.entregado_at, 'vence_at', p.vence_at,
      'nombre', split_part(c.nombre, ' ', 1),
      'es_regalo', p.es_regalo, 'regalo_para', p.regalo_para,
      'items', (select jsonb_agg(jsonb_build_object('nombre', pr.nombre, 'cantidad', i.cantidad, 'precio', i.precio_unitario,
                                                    'pack', pk.nombre))
                from pedido_items i join productos pr on pr.id = i.producto_id left join packs pk on pk.id = i.pack_id
                where i.pedido_id = p.id),
      'envio', (select jsonb_build_object('empresa', e.empresa, 'seguimiento', e.seguimiento) from envios e where e.pedido_id = p.id),
      'alias', a.alias_transferencia, 'email_contacto', a.email_contacto, 'whatsapp_contacto', a.whatsapp_contacto)
    from pedidos p join clientes c on c.id = p.cliente_id cross join ajustes a
    where p.token_publico = p_token and a.id = 1) end;
$$;

-- ───────────────────────── Tandas y salidas: la ganancia real ─────────────────────────
-- Por tanda: qué pasó con cada unidad y cuánta plata volvió. "ingreso_neto" = lo cobrado neto de comisión y envío,
-- repartido entre las piezas del pedido según su precio de lista.
create view v_tandas with (security_invoker = true) as
with lineas as (
  select a.lote_id, a.cantidad, a.costo_unitario, i.precio_unitario, p.tipo, p.estado, p.id as pedido_id,
         case when p.tipo = 'venta' and p.estado in ('pagado', 'en_preparacion', 'despachado', 'entregado') and p.subtotal > 0
              then a.cantidad * i.precio_unitario * (g.neto - g.costo_envio)::numeric / p.subtotal end as ingreso
  from asignaciones a
  join pedido_items i on i.id = a.pedido_item_id
  join pedidos p on p.id = i.pedido_id and p.estado <> 'cancelado'
  left join v_ganancia_pedido g on g.pedido_id = p.id
)
select l.id as lote_id, l.producto_id, pr.nombre as producto, pr.tipo, l.numero, l.fecha, l.unidades, l.merma,
       l.costo_unitario, _costo_vendible(l) as costo_vendible, l.unidades * l.costo_unitario as costo_tanda,
       coalesce(sum(x.cantidad) filter (where x.tipo = 'venta' and x.estado <> 'pendiente_pago'), 0)::int as vendidas,
       coalesce(sum(x.cantidad) filter (where x.tipo = 'venta' and x.estado = 'pendiente_pago'), 0)::int as reservadas,
       coalesce(sum(x.cantidad) filter (where x.tipo = 'salida'), 0)::int as regaladas,
       (l.unidades - l.merma - coalesce(sum(x.cantidad), 0))::int as disponibles,
       coalesce(round(sum(x.ingreso)), 0)::bigint as ingreso_neto,
       coalesce(sum(x.cantidad * x.costo_unitario) filter (where x.tipo = 'salida'), 0)::bigint as costo_regalado
from lotes l
join productos pr on pr.id = l.producto_id
left join lineas x on x.lote_id = l.id
group by l.id, pr.nombre, pr.tipo;

-- Salidas sin cobro con su costo (piezas + envío real).
create view v_salidas with (security_invoker = true) as
select p.id as pedido_id, p.numero, p.created_at, p.estado, p.salida_motivo, p.salida_por, c.nombre as destinatario,
       (select coalesce(sum(i.cantidad), 0) from pedido_items i where i.pedido_id = p.id)::int as piezas,
       (select coalesce(sum(i.cantidad * i.costo_unitario), 0) from pedido_items i where i.pedido_id = p.id) as costo_productos,
       coalesce(e.costo_real, 0) as costo_envio
from pedidos p join clientes c on c.id = p.cliente_id left join envios e on e.pedido_id = p.id
where p.tipo = 'salida' and p.estado <> 'cancelado';

-- ───────────────────────── Lista de espera ─────────────────────────
create table lista_espera (
  id          uuid primary key default gen_random_uuid(),
  producto_id uuid not null references productos (id) on delete cascade,
  email       text not null check (email = lower(email) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  nombre      text check (nombre is null or length(nombre) <= 80),
  avisado_at  timestamptz,
  created_at  timestamptz not null default now(),
  unique (producto_id, email)
);

-- ───────────────────────── Mails y avisos ─────────────────────────
-- Todo lo que el sistema manda (o mandaría, en modo prueba) queda registrado acá.
create table mensajes (
  id         uuid primary key default gen_random_uuid(),
  pedido_id  uuid references pedidos (id) on delete set null,
  canal      text not null check (canal in ('mail', 'telegram')),
  tipo       text not null,     -- pedido_recibido, pago_confirmado, en_camino, lista_espera, aviso_venta…
  para       text not null,
  asunto     text,
  cuerpo     text not null,     -- HTML del mail o texto del aviso
  estado     text not null check (estado in ('simulado', 'enviado', 'error')),
  error      text,
  created_at timestamptz not null default now()
);
create index mensajes_created_idx on mensajes (created_at desc);

-- ───────────────────────── Seguridad ─────────────────────────
do $$
declare t text;
begin
  foreach t in array array['packs', 'pack_items', 'cupones', 'asignaciones', 'lista_espera', 'mensajes'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for all to authenticated using (is_admin()) with check (is_admin())',
                   'admins_todo_' || t, t);
  end loop;
end $$;

revoke execute on function aprobar_pago_externo(uuid, text), cupon_publico(text) from public, anon, authenticated;
grant execute on function aprobar_pago_externo(uuid, text), cupon_publico(text) to service_role;

-- Fotos de productos y packs: bucket público para leer, solo admins suben.
insert into storage.buckets (id, name, public) values ('productos', 'productos', true)
on conflict (id) do nothing;
create policy productos_fotos_admins on storage.objects for all to authenticated
using (bucket_id = 'productos' and public.is_admin())
with check (bucket_id = 'productos' and public.is_admin());

-- Pedidos que ya existían: asignarles tanda (más vieja primero), en orden de creación.
do $$
declare v record;
begin
  for v in select i.id, i.producto_id, i.cantidad from pedido_items i join pedidos p on p.id = i.pedido_id
           where p.estado <> 'cancelado' and not exists (select 1 from asignaciones a where a.pedido_item_id = i.id)
           order by p.created_at loop
    perform _asignar_tandas(v.id, v.producto_id, v.cantidad);
  end loop;
end $$;
