-- Avisos de venta por notificación push: un registro por cada celular o compu que los activó.
create table suscripciones_push (
  endpoint    text primary key,
  p256dh      text not null,
  auth        text not null,
  admin_email text not null references admins (email) on delete cascade on update cascade,
  dispositivo text,
  created_at  timestamptz not null default now()
);
alter table suscripciones_push enable row level security;
create policy suscripciones_push_admins on suscripciones_push for all to authenticated using (is_admin()) with check (is_admin());
grant select, insert, update, delete on suscripciones_push to authenticated;
grant select, delete on suscripciones_push to service_role;

alter table mensajes drop constraint mensajes_canal_check;
alter table mensajes add constraint mensajes_canal_check check (canal in ('mail', 'telegram', 'push'));
