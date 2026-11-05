// Edén no usa service worker. Este archivo existe solo para dar de baja uno que haya quedado registrado
// en este mismo origen (por ejemplo, otra app que corrió antes en localhost:3000): borra sus cachés,
// se desregistra y recarga las pestañas para que vuelvan a cargar la versión real del sitio.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    (async () => {
      for (const clave of await caches.keys()) await caches.delete(clave);
      await self.registration.unregister();
      for (const cliente of await self.clients.matchAll({ type: "window" })) cliente.navigate(cliente.url);
    })(),
  );
});
