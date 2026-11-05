-- Datos iniciales: catálogo de la web (5 diseños de Biblia y 5 de Journal).
-- Lotes = PROVISORIOS y con costo en cero (el repo es público): se corrigen en Productos.
-- Los admins NO van acá (el repo es público): ver README, "Usuarios".

insert into productos (slug, nombre, tipo, diseno, precio, orden)
select lower(t.tipo || '-' || translate(d.diseno, 'áó', 'ao')), initcap(t.tipo) || ' ' || d.diseno,
       t.tipo::tipo_producto, d.diseno, t.precio, t.base + d.n
from (values ('biblia', 75000, 0), ('journal', 65000, 10)) as t (tipo, precio, base),
     (values (1, 'Origen'), (2, 'Anaj'), (3, 'Habitación'), (4, 'Prajim'), (5, 'Havilah')) as d (n, diseno);

insert into lotes (producto_id, numero, unidades, merma, costo_unitario, nota)
select id, 1, case tipo when 'biblia' then 6 else 10 end, 0,
       0, 'Primera edición (provisorio: confirmar cantidades)'
from productos;
