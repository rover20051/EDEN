-- Textos de la web que estaban fijos en la landing y pasan al back office:
--   · la frase y las medidas de la ficha de cada Biblia (Productos → Editar)
--   · el aviso de la barra de arriba (Ajustes)
-- Arrancan con lo que Mich escribió en su landing del 10/11/2026; desde acá se cambian en el back office.
-- No depende de la 0011: se pueden correr en cualquier orden, y correrla dos veces no rompe nada.

alter table productos add column if not exists frase text;
alter table productos add column if not exists medidas text;
alter table ajustes add column if not exists aviso_barra text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'productos_frase_largo') then
    alter table productos add constraint productos_frase_largo check (frase is null or length(frase) <= 600);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'productos_medidas_largo') then
    alter table productos add constraint productos_medidas_largo check (medidas is null or length(medidas) <= 200);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ajustes_aviso_barra_largo') then
    alter table ajustes add constraint ajustes_aviso_barra_largo check (aviso_barra is null or length(aviso_barra) <= 120);
  end if;
end $$;

comment on column productos.frase is 'Texto debajo del nombre en la ficha de la Biblia (un salto de línea separa párrafos). Vacío: la ficha muestra la descripción corta.';
comment on column productos.medidas is 'Medidas de la ficha, una por línea (ej. "23 cm de largo"). Vacío: «Por confirmar».';
comment on column ajustes.aviso_barra is 'Aviso de la barra de arriba de la web. Vacío: la barra no muestra texto.';

-- Frases de Mich, en el orden de su colección. La 4.ª y la 5.ª ella las llamó «Salmo 27» y «Jardín».
update productos set frase = $t$Volver al origen es regresar al diseño inicial de Dios, a la esencia con la que fuimos creados; una vida de comunión, de cercanía, de habitar en su presencia.$t$
  where slug = 'biblia-origen' and frase is null;
update productos set frase = $t$Fuimos creados para disfrutar de Dios; encontrar placer en Su presencia y deleite en Su Palabra.$t$
  where slug = 'biblia-anaj' and frase is null;
update productos set frase = $t$Un lugar para habitar en su presencia donde su casa se convierta en nuestro hogar. No queremos solo visitar, ¡queremos habitar!$t$
  where slug = 'biblia-habitacion' and frase is null;
update productos set frase = $t$“Una sola cosa deseo y esa buscaré, habitar en la casa del Señor todos los días de mi vida” — Ese anhelo de permanecer y habitar en su presencia. Buscando su rostro y contemplando su hermosura.$t$
  where slug = 'biblia-prajim' and frase is null;
update productos set frase = $t$El jardín, un lugar donde no gobiernan demandas ni distracciones, sino la presencia de Dios. Donde el alma descansa y vuelve a recordar quién es.
El jardín sigue abierto, la invitación sigue en pie y Dios aún camina esperando encontrarse contigo.$t$
  where slug = 'biblia-havilah' and frase is null;

-- Las medidas son las mismas para todas las Biblias
update productos set medidas = $t$23 cm de largo
15 cm de ancho
2,3 cm de grosor$t$
  where tipo = 'biblia' and medidas is null;

update ajustes set aviso_barra = 'Envíos gratis en Buenos Aires' where id = 1 and aviso_barra is null;
