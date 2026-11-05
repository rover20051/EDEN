// Sin "use client": lo usa el layout (servidor) y la barra lateral (cliente).
// v2: desde que la barra arranca compacta por defecto (las preferencias viejas no aplican).
export const CLAVE_BARRA = "eden-barra-v2";

/** Script inline: la barra arranca compacta; si la fijaron abierta, la abre antes de pintar (sin parpadeo). */
export const SCRIPT_BARRA = `try{if(localStorage.getItem("${CLAVE_BARRA}")==="ancha")document.documentElement.dataset.barra="ancha"}catch(e){}`;
