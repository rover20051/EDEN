// Avisos de venta del back office. Solo muestra notificaciones: no guarda nada en caché ni intercepta pedidos a la red.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (evento) => evento.waitUntil(self.clients.claim()));

self.addEventListener("push", (evento) => {
  let datos = {};
  try {
    datos = evento.data ? evento.data.json() : {};
  } catch {
    // Un aviso ilegible igual se muestra: Safari da de baja los avisos que llegan sin notificación visible.
  }
  evento.waitUntil(
    self.registration.showNotification(datos.titulo || "Edén", {
      body: datos.cuerpo || "Hay novedades en el back office.",
      icon: "/marca/app-192.png",
      badge: "/marca/app-192.png",
      tag: datos.tag,
      renotify: Boolean(datos.tag),
      data: { url: datos.url || "/admin" },
    }),
  );
});

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const destino = new URL(evento.notification.data?.url || "/admin", self.location.origin).href;
  evento.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const abierta = ventanas.find((v) => new URL(v.url).pathname.startsWith("/admin"));
      if (!abierta) return self.clients.openWindow(destino);
      await abierta.focus();
      return abierta.navigate(destino);
    })(),
  );
});
