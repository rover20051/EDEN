-- Los pedidos llegan al mail que se escribió: el WhatsApp ya no une a dos clientes con mails distintos.

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

  -- Cliente: el indicado, o el del mismo mail. El WhatsApp solo une si no hay dos mails distintos en juego:
  -- un número mal escrito o compartido no puede mandar el pedido de una persona al mail de otra.
  if v_cliente is null then
    select id into v_cliente from clientes
    where (v_email is not null and email = v_email)
       or (v_wa is not null and whatsapp = v_wa and (v_email is null or email is null))
    order by (v_email is not null and email is not distinct from v_email) desc, created_at
    limit 1;
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
