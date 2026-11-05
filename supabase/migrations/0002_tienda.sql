-- Tienda web: pedidos desde el checkout, Nave como medio de pago, vencimiento automático y seguimiento público.

alter type medio_pago add value if not exists 'nave';

alter table ajustes
  add column comision_nave        numeric(7, 5) not null default 0.02178, -- Nave crédito a 8 días hábiles: 1,8% + IVA
  add column dias_acreditacion_nave int not null default 11,
  add column horas_vencimiento_nave int not null default 2,                 -- intento de pago con Nave sin completar
  add column email_contacto       text not null default '',
  add column whatsapp_contacto    text not null default '';

-- Llamadas desde el servidor de la web con la clave secreta (rol service_role).
create function es_servidor() returns boolean
language sql stable set search_path = '' as $$
  select current_user = 'service_role' or coalesce(auth.jwt() ->> 'role', '') = 'service_role';
$$;

create or replace function _exigir_admin() returns void
language plpgsql stable set search_path = public as $$
begin
  if not (is_admin() or es_servidor()) then raise exception 'No autorizado' using errcode = '42501'; end if;
end $$;

-- Comisión y acreditación según el medio de pago.
create or replace function _aprobar_pago(p_pedido uuid, p_medio medio_pago, p_id_externo text default null)
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
  elsif p_medio::text = 'nave' then
    v_comision := round(v_total * v_aj.comision_nave);
    v_acred := current_date + v_aj.dias_acreditacion_nave;
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

-- Pedido desde la web: solo productos, datos del cliente y medio de pago. Nada de descuentos ni "ya pagado".
create function crear_pedido_web(p jsonb) returns jsonb
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
    'canal', 'web',
    'medio_pago', v_medio,
    'ya_pagado', false,
    'items', p -> 'items',
    'direccion_envio', p ->> 'direccion_envio',
    'nota', p ->> 'nota'));

  -- Nave: si no completa el pago, el stock se libera antes que en una transferencia.
  if v_medio = 'nave' then
    update pedidos set vence_at = now() + make_interval(hours => (select horas_vencimiento_nave from ajustes where id = 1))
    where id = v_id;
    insert into pagos (pedido_id, medio, estado, bruto) select v_id, 'nave', 'pendiente', total from pedidos where id = v_id;
  end if;

  select * into v_ped from pedidos where id = v_id;
  return jsonb_build_object('id', v_ped.id, 'token', v_ped.token_publico, 'numero', v_ped.numero, 'total', v_ped.total);
end $$;

-- Lo que ve el cliente en su link de seguimiento (sin costos ni datos internos).
create function pedido_publico(p_token uuid) returns jsonb
language sql stable set search_path = public as $$
  select case when es_servidor() then (
    select jsonb_build_object(
      'numero', p.numero, 'estado', p.estado, 'medio_pago', p.medio_pago,
      'subtotal', p.subtotal, 'descuento_set', p.descuento_set, 'envio_cobrado', p.envio_cobrado, 'total', p.total,
      'created_at', p.created_at, 'pagado_at', p.pagado_at, 'preparacion_at', p.preparacion_at,
      'despachado_at', p.despachado_at, 'entregado_at', p.entregado_at, 'vence_at', p.vence_at,
      'nombre', split_part(c.nombre, ' ', 1),
      'items', (select jsonb_agg(jsonb_build_object('nombre', pr.nombre, 'cantidad', i.cantidad, 'precio', i.precio_unitario))
                from pedido_items i join productos pr on pr.id = i.producto_id where i.pedido_id = p.id),
      'envio', (select jsonb_build_object('empresa', e.empresa, 'seguimiento', e.seguimiento) from envios e where e.pedido_id = p.id),
      'alias', a.alias_transferencia, 'email_contacto', a.email_contacto, 'whatsapp_contacto', a.whatsapp_contacto)
    from pedidos p join clientes c on c.id = p.cliente_id cross join ajustes a
    where p.token_publico = p_token and a.id = 1) end;
$$;

-- Cancela lo que venció sin pago y libera el stock. Corre solo cada 15 minutos.
create function cancelar_vencidos() returns int
language plpgsql set search_path = public as $$
declare v_n int;
begin
  with c as (
    update pedidos set estado = 'cancelado'
    where estado = 'pendiente_pago' and vence_at is not null and vence_at < now()
    returning id)
  select count(*) into v_n from c;
  update pagos set estado = 'rechazado'
  where estado in ('pendiente', 'comprobante_recibido')
    and pedido_id in (select id from pedidos where estado = 'cancelado');
  return v_n;
end $$;

revoke execute on function crear_pedido_web(jsonb), pedido_publico(uuid), cancelar_vencidos() from public, anon, authenticated;
grant execute on function crear_pedido_web(jsonb), pedido_publico(uuid) to service_role;
revoke execute on function es_servidor() from public, anon;
grant execute on function es_servidor() to authenticated, service_role;

create extension if not exists pg_cron;
select cron.schedule('eden-cancelar-vencidos', '*/15 * * * *', $$select public.cancelar_vencidos()$$);
