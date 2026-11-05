/**
 * Las 24 jurisdicciones de Argentina. Estos nombres exactos son las claves de `ajustes.envio_tarifas`
 * ({"Córdoba": 9500, …}): si se cambia uno acá, hay que cambiarlo también en las tarifas.
 */
export const PROVINCIAS = [
  "Ciudad Autónoma de Buenos Aires",
  "Buenos Aires",
  "Catamarca",
  "Chaco",
  "Chubut",
  "Córdoba",
  "Corrientes",
  "Entre Ríos",
  "Formosa",
  "Jujuy",
  "La Pampa",
  "La Rioja",
  "Mendoza",
  "Misiones",
  "Neuquén",
  "Río Negro",
  "Salta",
  "San Juan",
  "San Luis",
  "Santa Cruz",
  "Santa Fe",
  "Santiago del Estero",
  "Tierra del Fuego",
  "Tucumán",
] as const;

export type Provincia = (typeof PROVINCIAS)[number];

export const esProvincia = (v: string): v is Provincia => (PROVINCIAS as readonly string[]).includes(v);
