# EDEN · web y back office

Next.js 16 + Supabase, deploy en Vercel.

- `/admin`: back office (Hoy, Pedidos, Productos, Plata, Números, Cupones, Ajustes). Solo entran los mails de la tabla `admins`.
- `/`: la web pública (`public/index.html`): la landing de Mich más la tienda. Precios, stock, nombres, textos y fotos salen del back office por `/api/catalogo`.
- `/checkout` y `/pedido/[token]`: compra y seguimiento.

## Verlo en tu compu

Requiere Node 22.12 o más nuevo.

1. `npm install`
2. Copiar `.env.example` a `.env.local` y completar las claves de Supabase. Se piden por privado: nunca van al repo.
3. Sumar `PAGOS_PRUEBA=1` para probar la compra sin pasarela: la tarjeta `4242 4242 4242 4242` aprueba y `4000 0000 0000 0002` rechaza. No se cobra nada. Con `MP_ACCESS_TOKEN` (credenciales de prueba `TEST-…`), en cambio, se paga en el Mercado Pago de prueba.
4. `npm run dev` → http://localhost:3000 (web) y http://localhost:3000/admin (back office).

Con esas claves se trabaja sobre la base real: lo que se compre o cargue queda ahí.

Para entrar a `/admin`, el mail tiene que estar en **Ajustes → Cuentas** y tener usuario en Supabase → Authentication → Users → *Add user*, con *Auto Confirm User* tildado.

## Abrir la tienda

La web publicada queda **cerrada** hasta que se cargue `TIENDA_ABIERTA=1` en Vercel: se ve, pero no permite hacer pedidos.

Para probarla antes, entrar a `/api/prueba?clave=<TIENDA_CLAVE_PRUEBA>`: se puede comprar con la tarjeta de prueba `4242 4242 4242 4242` (aprobada) o `4000 0000 0000 0002` (rechazada), sin cobro. `/api/prueba?salir=1` sale del modo prueba.

Antes de vender de verdad: borrar los pedidos de prueba y `TIENDA_CLAVE_PRUEBA`, para que nadie pueda pagar con la tarjeta de prueba.

## Cobro con tarjeta o efectivo

La pasarela se elige en `ajustes.pasarela` (`mercadopago` o `nave`). Nave todavía no está conectada: elegida, la tarjeta queda como "Muy pronto".

**Mercado Pago (Checkout Bricks).** La tarjeta se carga en el paso de pago de la tienda, en los campos seguros de Mercado Pago con los colores y la letra de Edén: la tienda recibe un token, nunca los datos de la tarjeta, y cobra desde el servidor (`src/lib/mercadopago.ts`). Si el banco pide validar (3DS), el desafío aparece en la misma página. Tarjetas (crédito, débito y prepaga) y efectivo con cupón (Rapipago y Pago Fácil): dinero en cuenta y Cuotas sin Tarjeta no se ofrecen, porque pasan por la página de Mercado Pago, que no deja excluir el dinero en cuenta, y quien tiene plata ahí puede transferir sin comisión. El pedido queda pagado solo con lo que responde la API de Mercado Pago (al cobrar, después del desafío o por su aviso a `/api/mercadopago`), nunca con lo que mande el navegador.

- `MP_ACCESS_TOKEN` (solo servidor) y `MP_PUBLIC_KEY` en Vercel: credenciales de la aplicación (Checkout API con la API "Payments") de la cuenta que cobra, en Mercado Pago Developers → Tus integraciones → Credenciales. Con las de prueba (`TEST-…`) los cobros son simulados; con las de producción, reales. Cambiarlas requiere volver a publicar (Redeploy).
- El pedido reserva las piezas `horas_vencimiento_nave` horas (2 por defecto) hasta que elige cómo pagar. Si Mercado Pago deja un pago con tarjeta en revisión, la reserva se estira 72 h.
- Efectivo: el cupón vence a los 3 días (lo que recomienda Mercado Pago) y la reserva dura un día más, porque el pago tarda hasta 2 horas hábiles en acreditarse. El cupón queda a la vista en la página del pedido (también al recargarla) y le llega por mail (plantilla "Tu cupón para pagar en efectivo"). Si elige pagar con tarjeta o pasa a transferencia, el cupón se anula en Mercado Pago. Un cupón pagado tarde se avisa como cobro de un pedido cancelado.
- Los pagos en marcha se buscan en Mercado Pago por pedido (`external_reference`), así la página del pedido no vuelve a mostrar el formulario si hay un cupón sin pagar o un pago en revisión.
- Les llega un aviso a las socias si un pago se aprueba para un pedido ya cancelado, si el monto no coincide, o si el pago se devuelve, se reclama o se desconoce.
- La comisión real y la fecha en que se libera la plata de cada pago se guardan en el pago (Plata). El plazo (al instante, 10, 18 o 35 días) se elige en la cuenta de Mercado Pago.
- Devoluciones: primero desde Mercado Pago ("Devolver dinero" en ese cobro) y después se registran en el pedido.

## Avisos de venta en el celular

Se activan desde la campanita del back office, en cada dispositivo. Requieren HTTPS: en un celular funcionan con la web ya publicada.

En iPhone (iOS 16.4 o más nuevo): abrir el back office en Safari, tocar Compartir → **Agregar a inicio**, abrir Edén desde ese ícono, iniciar sesión y tocar **Activar avisos** en la campanita.

Si un aviso no le llega a una cuenta, le llega por mail.

## Base nueva desde cero

Solo si se instala otra base. En Supabase → SQL Editor, correr en orden `supabase/migrations/0001` a `0013` y `supabase/seed.sql`. El primer admin va a mano, porque el repo es público:

    insert into admins (email, nombre, socio) values ('tu@mail.com', 'Tu nombre', 'fede');

Costos, gastos y supuestos reales no están en el repo: arrancan en cero y se cargan desde el back office.

## Cuando tengan el dominio

Todo lo que depende del dominio sale de variables, así que el cambio es de configuración, no de código:

| Dónde | Qué cambiar |
|---|---|
| Vercel → Domains | Agregar el dominio y apuntar el DNS |
| Vercel → Environment Variables | `NEXT_PUBLIC_SITE_URL=https://dominio` |
| Supabase → Authentication → URL Configuration | Site URL y Redirect URLs con el dominio nuevo |
| Resend | Verificar el dominio (registros DNS), usar `MAIL_DOMINIO=dominio` y `MAILS_MODO=real`. Cada dirección de `src/lib/mails/remitentes.ts` tiene que existir como casilla |

## Reglas que no se rompen

- La plata se guarda en pesos enteros.
- Cada línea de pedido guarda precio y costo del momento.
- Toda operación sobre pedidos pasa por las funciones de la base (`crear_pedido`, `confirmar_pago`, `despachar`…). Validan admin, stock y estados en una sola transacción.
- RLS activo en todas las tablas. La clave `service_role` nunca va al navegador.
- Un comprobante de transferencia nunca marca un pedido como pagado: siempre lo confirma una persona después de ver la plata en la cuenta.

## Pendientes conocidos

- La suscripción a las cartas de la web usa Netlify Forms: todavía no guarda los mails.
- Devoluciones: se registran en cada pedido; la plata se devuelve afuera (banco o panel de cobros). El botón de arrepentimiento (`/arrepentimiento`, exigido por la Disposición 954/2025) entrega un código en el momento y avisa a las socias.

## Notas técnicas

- `package.json` fuerza `magic-string@0.30.21` (`overrides`). La 1.x es solo ESM y rompe el loader de Tailwind en Turbopack. Sacarlo cuando Tailwind lo corrija.
- `cacheComponents` está apagado: todo el back office es dinámico por usuario.
