-- Endurecimiento del acceso. Se puede correr en cualquier momento y más de una vez.

-- Intentos de ingreso al back office (src/lib/freno-acceso.ts). Solo la usa el servidor.
create table if not exists intentos_acceso (
  id     bigint generated always as identity primary key,
  huella text not null,
  creado timestamptz not null default now()
);
create index if not exists intentos_acceso_huella on intentos_acceso (huella, creado);
alter table intentos_acceso enable row level security;
revoke all on intentos_acceso from anon, authenticated;
grant select, insert, delete on intentos_acceso to service_role;

-- Un visitante sin sesión no necesita nada de la base: la tienda lee y escribe desde el servidor.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
grant execute on all functions in schema public to service_role;
revoke execute on all functions in schema public from public, anon;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke execute on functions from anon;

-- Las cuentas de Edén son las que ya existen: ni el registro ni la base dejan sumar otra, ni cambiarle el mail a una.
-- Para volver a permitirlo: ver SEGURIDAD.md.
create or replace function cerrar_cuentas() returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'Edén no admite cuentas nuevas';
end $$;
revoke execute on function cerrar_cuentas() from public, anon, authenticated;
create or replace trigger cuentas_cerradas before insert on auth.users for each row execute function public.cerrar_cuentas();
create or replace trigger admins_cerrados before insert or update of email on public.admins for each row execute function public.cerrar_cuentas();

-- Control: ninguna fila debería decir true en "anonimo".
select p.proname as funcion, has_function_privilege('anon', p.oid, 'execute') as anonimo, p.prosecdef as con_permisos_propios
from pg_proc p
where p.pronamespace = 'public'::regnamespace
order by 2 desc, 1;
