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

La pasarela de la tarjeta se elige en **Ajustes → Pasarela de tarjeta** (`ajustes.pasarela`: `mercadopago` o `nave`) y solo deja elegir una con sus credenciales reales cargadas. Cambiarla no toca los pedidos en curso: cada pedido sigue con el medio con que se creó.

- **Mercado Pago elegida:** tarjeta y efectivo en el mismo paso de pago.
- **Nave elegida** (la promo de bienvenida de 90 días): la tarjeta se cobra con Nave y, si Mercado Pago está configurado, el efectivo se ofrece aparte con Mercado Pago (Nave no tiene efectivo). Para volver a Mercado Pago al terminar la promo alcanza con cambiar el selector.

**Mercado Pago (Checkout Bricks).** La tarjeta se carga en el paso de pago de la tienda, en los campos seguros de Mercado Pago con los colores y la letra de Edén: la tienda recibe un token, nunca los datos de la tarjeta, y cobra desde el servidor (`src/lib/mercadopago.ts`). Si el banco pide validar (3DS), el desafío aparece en la misma página. Tarjetas (crédito, débito y prepaga) y efectivo con cupón (Rapipago y Pago Fácil): dinero en cuenta y Cuotas sin Tarjeta no se ofrecen, porque pasan por la página de Mercado Pago, que no deja excluir el dinero en cuenta, y quien tiene plata ahí puede transferir sin comisión. El pedido queda pagado solo con lo que responde la API de Mercado Pago (al cobrar, después del desafío o por su aviso a `/api/mercadopago`), nunca con lo que mande el navegador.

- Credenciales de la aplicación de la cuenta que cobra (Checkout API con la API "Payments"), en Mercado Pago Developers → Tus integraciones → Credenciales. Van en Vercel y cambiarlas requiere volver a publicar (Redeploy):
  - `MP_ACCESS_TOKEN` (solo servidor) y `MP_PUBLIC_KEY`: las de producción. Con ellas cobran todos los clientes.
  - `MP_TEST_ACCESS_TOKEN` y `MP_TEST_PUBLIC_KEY`: las de prueba (`TEST-…`). Solo se usan con el link de prueba de la tienda: nada se cobra, aparece la ayuda con las tarjetas de prueba y los clientes nunca las ven. Sus avisos llegan a `/api/mercadopago/prueba`.
  - Si un par está mal puesto (de prueba en las reales o al revés), se toma como no configurado y la tarjeta queda en "Muy pronto". Con el link de prueba nunca se usan las reales: sin las de prueba, aparece el formulario simulado.
- El pedido reserva las piezas `horas_vencimiento_nave` horas (2 por defecto) hasta que elige cómo pagar. Si Mercado Pago deja un pago con tarjeta en revisión, la reserva se estira 72 h.
- Efectivo: el cupón vence a los 3 días (lo que recomienda Mercado Pago) y la reserva dura un día más, porque el pago tarda hasta 2 horas hábiles en acreditarse. El cupón queda a la vista en la página del pedido (también al recargarla) y le llega por mail (plantilla "Tu cupón para pagar en efectivo"). Si elige pagar con tarjeta o pasa a transferencia, el cupón se anula en Mercado Pago. Un cupón pagado tarde se avisa como cobro de un pedido cancelado.
- Los pagos en marcha se buscan en Mercado Pago por pedido (`external_reference`), así la página del pedido no vuelve a mostrar el formulario si hay un cupón sin pagar o un pago en revisión.
- Les llega un aviso a las socias si un pago se aprueba para un pedido ya cancelado, si el monto no coincide, o si el pago se devuelve, se reclama o se desconoce.
- La comisión real y la fecha en que se libera la plata de cada pago se guardan en el pago (Plata). El plazo (al instante, 10, 18 o 35 días) se elige en la cuenta de Mercado Pago.
- Dos veces por día, a las 10 y las 16 hs de Argentina (cron de Vercel, `/api/cron/mercadopago`, 13 y 19 UTC) se vuelven a leer los cobros por acreditar (`src/lib/sync-mp.ts`): se corrigen la comisión y la fecha de acreditación si Mercado Pago las cambió (queda registrado en el historial del pedido) y se avisa a las socias de un pago devuelto, en reclamo o con contracargo. Los pagos de prueba se saltean.
- Devoluciones: primero desde Mercado Pago ("Devolver dinero" en ese cobro) y después se registran en el pedido.

**Nave (checkout embebido).** `src/lib/nave.ts` (API), `src/lib/cobro-nave.ts` (cobro) y `src/components/pago-tarjeta/nave.tsx` (el SDK `@ranty/ranty-sdk`, un web component que se muestra en la página). El servidor crea una "intención de pago" por pedido, que dura lo que le queda a la reserva y se reutiliza al recargar; si venció, se bloqueó o se rechazó, se crea otra. Como con Mercado Pago, el pedido queda pagado solo con lo que responde la API de Nave (`GET /payments/{id}`), nunca con lo que traiga el aviso o el navegador: el aviso de Nave no está firmado.

- Credenciales (las entrega Nave en el ticket de "Alta de integraciones"; el POS ID sale de Nave → Integraciones → Sistema de gestión). Van en Vercel, y cambiarlas requiere volver a publicar (Redeploy): `NAVE_CLIENT_ID`, `NAVE_CLIENT_SECRET`, `NAVE_AUDIENCE`, `NAVE_POS_ID` y `NAVE_PUBLIC_KEY` (reales), y las mismas con prefijo `NAVE_TEST_` (sandbox, solo con el link de prueba).
- Aviso de Nave a `https://casaeden.com.ar/api/nave` (reales) y `/api/nave/prueba` (sandbox): son las "URL de notificación" que se piden al dar de alta la integración.
- Cada intención lleva un `external_payment_id` propio; se registra en los eventos del pedido (`nave_intencion` y `nave_intencion_creada`) para ubicar el pedido cuando Nave avisa.
- Nave no informa su comisión: queda la estimación de Ajustes (`comision_nave` y `dias_acreditacion_nave`, migración 0002).
- En producción Nave no deja escribir los datos de la tarjeta (muestra QR en la compu y MODO en el celular) salvo que su equipo de Fraude lo habilite para el comercio. El diseño del formulario es de Nave: no se le pueden cambiar los colores. El SDK trae sus propios medidores (Datadog y Amplitude), a diferencia de Mercado Pago.
- Si el pedido pasa a transferencia, la intención se anula. Las devoluciones se hacen desde Nave (la API tiene `POST /payments/{id}/refunds`, todavía no conectado) y después se registran en el pedido; un pago devuelto o con contracargo avisa a las socias.

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
