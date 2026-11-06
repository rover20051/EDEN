-- Categorías nuevas de productos, además de Biblias y Journals.
-- Biblias y Journals siguen en tipo 'biblia' / 'journal' (de eso dependen el precio del Set y el plan de Números).
-- Todo lo demás es tipo 'otro' con su categoría.
alter type tipo_producto add value if not exists 'otro';

create table categorias (
  slug       text primary key,
  nombre     text not null check (length(trim(nombre)) > 0),
  orden      int not null default 0,
  created_at timestamptz not null default now()
);
alter table categorias enable row level security;
create policy categorias_admins on categorias for all to authenticated using (is_admin()) with check (is_admin());
grant select, insert, update, delete on categorias to authenticated;
grant select on categorias to service_role;

alter table productos add column categoria text references categorias (slug) on update cascade;
-- tipo::text: un valor nuevo de un enum no se puede usar en la misma transacción en que se crea.
alter table productos add constraint productos_categoria_segun_tipo check ((tipo::text = 'otro') = (categoria is not null));
