# EDEN · web y back office

Next.js 16 + Supabase, deploy en Vercel.

- `/admin`: back office (Hoy, Pedidos, Productos, Plata, Números, Cupones, Ajustes). Solo entran los mails de la tabla `admins`.
- `/`: la web pública (`public/index.html`): la landing de Mich más la tienda. Precios, stock, nombres, textos y fotos salen del back office por `/api/catalogo`.
- `/checkout` y `/pedido/[token]`: compra y seguimiento.

## Verlo en tu compu

Requiere Node 22.12 o más nuevo.

1. `npm install`
2. Copiar `.env.example` a `.env.local` y completar las claves de Supabase. Se piden por privado: nunca van al repo.
3. Sumar `PAGOS_PRUEBA=1` para probar la compra sin pasarela: la tarjeta `4242 4242 4242 4242` aprueba y `4000 0000 0000 0002` rechaza. No se cobra nada.
4. `npm run dev` → http://localhost:3000 (web) y http://localhost:3000/admin (back office).

Con esas claves se trabaja sobre la base real: lo que se compre o cargue queda ahí.

Para entrar a `/admin`, el mail tiene que estar en **Ajustes → Cuentas** y tener usuario en Supabase → Authentication → Users → *Add user*, con *Auto Confirm User* tildado.

## Base nueva desde cero

Solo si se instala otra base. En Supabase → SQL Editor, correr en orden `supabase/migrations/0001` a `0006` y `supabase/seed.sql`. El primer admin va a mano, porque el repo es público:

    insert into admins (email, nombre, socio) values ('tu@mail.com', 'Tu nombre', 'fede');

Costos, gastos y supuestos reales no están en el repo: arrancan en cero y se cargan desde el back office.

## Cuando tengan el dominio

Todo lo que depende del dominio sale de variables, así que el cambio es de configuración, no de código:

| Dónde | Qué cambiar |
|---|---|
| Vercel → Domains | Agregar el dominio y apuntar el DNS |
| Vercel → Environment Variables | `NEXT_PUBLIC_SITE_URL=https://dominio` |
| Supabase → Authentication → URL Configuration | Site URL y Redirect URLs con el dominio nuevo |
| Resend | Verificar el dominio (registros DNS), usar `MAIL_REMITENTE=Edén <hola@dominio>` y `MAILS_MODO=real` |

## Reglas que no se rompen

- La plata se guarda en pesos enteros.
- Cada línea de pedido guarda precio y costo del momento.
- Toda operación sobre pedidos pasa por las funciones de la base (`crear_pedido`, `confirmar_pago`, `despachar`…). Validan admin, stock y estados en una sola transacción.
- RLS activo en todas las tablas. La clave `service_role` nunca va al navegador.
- Un comprobante de transferencia nunca marca un pedido como pagado: siempre lo confirma una persona después de ver la plata en la cuenta.

## Pendientes conocidos

- La suscripción a las cartas de la web usa Netlify Forms: todavía no guarda los mails.
- Nave: falta conectar el checkout embebido y su webhook, que tiene que llamar a `aprobar_pago_externo`.

## Notas técnicas

- `package.json` fuerza `magic-string@0.30.21` (`overrides`). La 1.x es solo ESM y rompe el loader de Tailwind en Turbopack. Sacarlo cuando Tailwind lo corrija.
- `cacheComponents` está apagado: todo el back office es dinámico por usuario.
