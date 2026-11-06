-- Suscriptores de las cartas, cartas enviadas y textos editables de los mails automáticos.
create table suscriptores (
  email             text primary key check (email = lower(email)),
  consentimiento_at timestamptz not null default now(),
  origen            text not null default 'web',
  baja_at           timestamptz,
  sincronizado_at   timestamptz,          -- ya está en la lista de contactos de Resend
  created_at        timestamptz not null default now()
);

create table cartas (
  id            uuid primary key default gen_random_uuid(),
  asunto        text not null check (length(trim(asunto)) > 0),
  titulo        text not null check (length(trim(titulo)) > 0),
  cuerpo        text not null check (length(trim(cuerpo)) > 0),
  estado        text not null default 'borrador' check (estado in ('borrador', 'enviando', 'enviada')),
  destinatarios int,
  resend_id     text,
  enviada_at    timestamptz,
  created_by    text not null default actor(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index cartas_created_idx on cartas (created_at desc);

-- Lo que se cambió de cada mail automático. Sin fila, el mail sale con sus textos originales.
create table textos_mail (
  tipo       text primary key,
  asunto     text,
  titulo     text,
  bajada     text,
  nota       text,
  updated_by text not null default actor(),
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['suscriptores', 'cartas', 'textos_mail'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for all to authenticated using (is_admin()) with check (is_admin())', t || '_admins', t);
    execute format('grant select, insert, update, delete on %I to authenticated, service_role', t);
  end loop;
end $$;
