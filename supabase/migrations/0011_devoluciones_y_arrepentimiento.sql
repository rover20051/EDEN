-- Devoluciones de plata, pedidos de arrepentimiento (Disposición 954/2025) y foto de cada persona del equipo.
alter table admins add column foto_path text;

create table arrepentimientos (
  id            uuid primary key default gen_random_uuid(),
  codigo        text not null unique,          -- se le informa a quien lo pide, dentro de las 24 h
  nombre        text not null,
  email         text not null check (email = lower(email)),
  numero_pedido text,                          -- lo que escribió, tal cual
  motivo        text,
  pedido_id     uuid references pedidos (id) on delete set null,
  estado        text not null default 'pendiente' check (estado in ('pendiente', 'resuelto')),
  resuelto_por  text,
  resuelto_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index arrepentimientos_estado_idx on arrepentimientos (estado, created_at desc);

create table devoluciones (
  id         uuid primary key default gen_random_uuid(),
  pedido_id  uuid not null references pedidos (id) on delete cascade,
  monto      bigint not null check (monto > 0),
  motivo     text not null check (length(trim(motivo)) > 0),
  referencia text,                             -- número de operación o comprobante
  created_by text not null default actor(),
  created_at timestamptz not null default now()
);
create index devoluciones_pedido_idx on devoluciones (pedido_id);
create index devoluciones_created_idx on devoluciones (created_at desc);

do $$
declare t text;
begin
  foreach t in array array['arrepentimientos', 'devoluciones'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for all to authenticated using (is_admin()) with check (is_admin())', t || '_admins', t);
    execute format('grant select, insert, update, delete on %I to authenticated, service_role', t);
  end loop;
end $$;

-- Lo devuelto ya no cuenta como cobrado. Una devolución total cancela el pedido, así que acá solo pesan las parciales.
create or replace view v_ganancia_pedido with (security_invoker = true) as
select p.id as pedido_id, p.created_at, p.pagado_at, p.canal, c.origen, p.total,
       p.descuento + p.descuento_set - p.envio_cobrado as descuento_total,
       coalesce(pg.neto, p.total) - coalesce((select sum(d.monto) from devoluciones d where d.pedido_id = p.id), 0) as neto,
       coalesce(pg.comision, 0) as comision,
       (select coalesce(sum(i.cantidad * i.costo_unitario), 0) from pedido_items i where i.pedido_id = p.id) as costo_productos,
       coalesce(e.costo_real, (select envio_estimado from ajustes where id = 1)) as costo_envio,
       e.costo_real is not null as envio_real
from v_pedidos_validos p
join clientes c on c.id = p.cliente_id
left join (select pedido_id, sum(neto) as neto, sum(comision) as comision
           from pagos where estado = 'aprobado' group by pedido_id) pg on pg.pedido_id = p.id
left join envios e on e.pedido_id = p.id;

-- Registra plata ya devuelta. Si llega al total, cancela el pedido: las piezas vuelven al stock, o se dan por perdidas en su tanda.
create function registrar_devolucion(p_pedido uuid, p_monto bigint, p_motivo text, p_referencia text default null, p_vuelve_al_stock boolean default true)
returns jsonb
language plpgsql set search_path = public as $$
declare
  v_ped pedidos%rowtype;
  v_antes bigint;
  v_completa boolean;
begin
  perform _exigir_admin();
  select * into v_ped from pedidos where id = p_pedido for update;
  if not found then raise exception 'Pedido inexistente'; end if;
  if v_ped.tipo <> 'venta' then raise exception 'Una salida sin cobro no tiene plata para devolver'; end if;
  if v_ped.estado not in ('pagado', 'en_preparacion', 'despachado', 'entregado') then raise exception 'Este pedido no tiene un pago para devolver'; end if;
  if coalesce(p_monto, 0) <= 0 then raise exception 'Falta el monto a devolver'; end if;
  if length(trim(coalesce(p_motivo, ''))) = 0 then raise exception 'Falta el motivo'; end if;
  select coalesce(sum(monto), 0) into v_antes from devoluciones where pedido_id = p_pedido;
  if v_antes + p_monto > v_ped.total then
    raise exception 'No se puede devolver más de lo cobrado: quedan % por devolver', v_ped.total - v_antes;
  end if;

  insert into devoluciones (pedido_id, monto, motivo, referencia) values (p_pedido, p_monto, trim(p_motivo), nullif(trim(coalesce(p_referencia, '')), ''));
  v_completa := v_antes + p_monto = v_ped.total;
  if v_completa then
    if not p_vuelve_al_stock then
      begin
        update lotes l set merma = l.merma + x.cantidad
        from (select a.lote_id, sum(a.cantidad)::int as cantidad
              from asignaciones a join pedido_items i on i.id = a.pedido_item_id
              where i.pedido_id = p_pedido group by a.lote_id) x
        where l.id = x.lote_id;
      exception when check_violation then
        raise exception 'No se puede dar la pieza por perdida: la tanda se quedaría sin unidades. Dejala volver al stock y corregí la tanda.';
      end;
    end if;
    update pedidos set estado = 'cancelado' where id = p_pedido;
    update pagos set estado = 'reembolsado' where pedido_id = p_pedido and estado = 'aprobado';
  end if;
  insert into eventos (pedido_id, tipo, detalle)
  values (p_pedido, 'devolucion', jsonb_build_object('monto', p_monto, 'completa', v_completa, 'vuelve_al_stock', p_vuelve_al_stock));
  return jsonb_build_object('completa', v_completa, 'devuelto', v_antes + p_monto);
end $$;
revoke execute on function registrar_devolucion(uuid, bigint, text, text, boolean) from public, anon;
grant execute on function registrar_devolucion(uuid, bigint, text, text, boolean) to authenticated, service_role;

-- El link de seguimiento también muestra lo devuelto.
create or replace function pedido_publico(p_token uuid) returns jsonb
language sql stable set search_path = public as $$
  select case when es_servidor() then (
    select jsonb_build_object(
      'numero', p.numero, 'estado', p.estado, 'medio_pago', p.medio_pago,
      'subtotal', p.subtotal, 'descuento_set', p.descuento_set, 'descuento', p.descuento, 'cupon', p.cupon,
      'envio_cobrado', p.envio_cobrado, 'total', p.total,
      'devuelto', (select coalesce(sum(d.monto), 0) from devoluciones d where d.pedido_id = p.id),
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
