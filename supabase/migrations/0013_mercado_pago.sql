-- Cobro con Mercado Pago (Checkout Pro): el pedido con tarjeta se paga en la página de Mercado Pago
-- y su aviso (webhook) lo confirma. Reemplaza a Nave como medio de cobro con tarjeta de la tienda.
--   · crear_pedido_web acepta 'mercadopago' (la reserva dura ajustes.horas_vencimiento_nave, igual que antes con Nave)
--   · aprobar_pago_externo recibe el medio y lo que de verdad cobró Mercado Pago (comisión y fecha en que se libera la plata)
--   · ajustes.pasarela: con qué se cobra con tarjeta (Mercado Pago o Nave); las credenciales de cada una van en Vercel
-- Correrla dos veces no rompe nada.

alter table ajustes add column if not exists pasarela text not null default 'mercadopago';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ajustes_pasarela_valida') then
    alter table ajustes add constraint ajustes_pasarela_valida check (pasarela in ('mercadopago', 'nave'));
  end if;
end $$;
comment on column ajustes.pasarela is 'Pasarela para cobrar con tarjeta en la web: mercadopago o nave.';

create or replace function crear_pedido_web(p jsonb) returns jsonb
language plpgsql set search_path = public as $$
declare
  v_medio text := p ->> 'medio_pago';
  v_id uuid;
  v_ped pedidos%rowtype;
begin
  if not es_servidor() then raise exception 'No autorizado' using errcode = '42501'; end if;
  if v_medio not in ('transferencia', 'nave', 'mercadopago') then raise exception 'Medio de pago inválido'; end if;
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
  if v_medio in ('nave', 'mercadopago') then
    update pedidos set vence_at = now() + make_interval(hours => (select horas_vencimiento_nave from ajustes where id = 1))
    where id = v_id;
    insert into pagos (pedido_id, medio, estado, bruto) select v_id, v_medio::medio_pago, 'pendiente', total from pedidos where id = v_id;
  end if;

  select * into v_ped from pedidos where id = v_id;
  return jsonb_build_object('id', v_ped.id, 'token', v_ped.token_publico, 'numero', v_ped.numero, 'total', v_ped.total);
end $$;

-- Pago con tarjeta aprobado (aviso de Mercado Pago, o modo prueba). Idempotente por id externo.
-- p_comision y p_acreditacion: lo que informa Mercado Pago del pago; sin ellos queda la estimación de Ajustes.
drop function if exists aprobar_pago_externo(uuid, text);
create or replace function aprobar_pago_externo(p_token uuid, p_id_externo text, p_medio text default 'mercadopago',
                                                p_comision bigint default null, p_acreditacion date default null) returns jsonb
language plpgsql set search_path = public as $$
declare v_ped pedidos%rowtype;
begin
  if not es_servidor() then raise exception 'No autorizado' using errcode = '42501'; end if;
  if p_medio not in ('nave', 'mercadopago') then raise exception 'Medio de pago inválido'; end if;
  select * into v_ped from pedidos where token_publico = p_token for update;
  if not found then raise exception 'Pedido inexistente'; end if;
  if exists (select 1 from pagos where id_externo = p_id_externo and estado = 'aprobado') then
    return jsonb_build_object('id', v_ped.id, 'numero', v_ped.numero, 'nuevo', false);
  end if;
  if v_ped.estado <> 'pendiente_pago' then raise exception 'El pedido ya no espera pago (%)', v_ped.estado; end if;
  perform _aprobar_pago(v_ped.id, p_medio::medio_pago, p_id_externo);
  if p_comision is not null or p_acreditacion is not null then
    update pagos set comision = least(greatest(coalesce(p_comision, comision), 0), bruto),
                     acreditacion_esperada = coalesce(p_acreditacion, acreditacion_esperada)
    where id_externo = p_id_externo;
  end if;
  return jsonb_build_object('id', v_ped.id, 'numero', v_ped.numero, 'nuevo', true);
end $$;
revoke execute on function aprobar_pago_externo(uuid, text, text, bigint, date) from public, anon, authenticated;
grant execute on function aprobar_pago_externo(uuid, text, text, bigint, date) to service_role;
