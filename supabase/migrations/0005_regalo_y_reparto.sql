-- 1) Gastos pagados por "Nari y Mich": se reparten mitad y mitad, y cada una puede cobrar su parte por separado.
alter table gastos add column reintegrado_a text[] not null default '{}';
update gastos
set reintegrado_a = case
  when not reintegrado then '{}'
  when pagado_por = 'nari_mich' then '{nari,mich}'
  when pagado_por = 'eden' then '{}'
  else array[pagado_por]
end;

-- 2) Pedidos para regalar: a quién va y el mensaje de la tarjeta.
alter table pedidos
  add column es_regalo boolean not null default false,
  add column regalo_para text check (regalo_para is null or length(regalo_para) <= 80),
  add column regalo_mensaje text check (regalo_mensaje is null or length(regalo_mensaje) <= 300);
