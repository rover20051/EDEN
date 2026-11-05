-- Marketing en la tienda: etiqueta destacada y precio anterior (para mostrar descuento).
alter table productos
  add column etiqueta        text check (etiqueta is null or length(etiqueta) between 1 and 30),
  add column precio_anterior bigint check (precio_anterior is null or precio_anterior > 0);
