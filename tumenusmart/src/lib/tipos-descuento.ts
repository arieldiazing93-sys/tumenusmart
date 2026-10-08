import { textoPorcentaje, type DescuentoPedido } from "./descuento-venta";

/**
 * Los TIPOS DE DESCUENTO que el dueño crea en Ajustes: un nombre y un porcentaje fijo ("Cortesía" 100 %, "Tarjeta" 20 %…). Al descontar una
 * cuenta por porcentaje se elige uno y el porcentaje y el concepto salen de él.
 *
 * El 100 % (una cortesía: la cuenta queda en cero) solo se da con uno de estos tipos, nunca escribiendo "100" a mano: así lo decide
 * el dueño una sola vez y el cajero solo elige "Cortesía". Todo lo de acá es puro (sin base de datos): lo usan las pantallas y las acciones
 * del servidor que guardan el descuento.
 */

export type TipoDescuentoDef = { id: string; nombre: string; porcentaje: number };

export const MAX_NOMBRE_TIPO_DESCUENTO = 40;
export const MIN_NOMBRE_TIPO_DESCUENTO = 2;

export type ResultadoTipoDescuento =
  | { ok: true; nombre: string; porcentaje: number }
  | { ok: false; error: string };

/** Revisa lo que llega del navegador al crear o editar un tipo: nombre con letras y un porcentaje mayor a 0 y hasta 100 (2 decimales). */
export function validarTipoDescuento(d: { nombre: unknown; porcentaje: unknown }): ResultadoTipoDescuento {
  const nombre = String(d.nombre ?? "")
    .replace(/[\x00-\x1F\x7F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (nombre.length < MIN_NOMBRE_TIPO_DESCUENTO) {
    return { ok: false, error: `Escribí el nombre del descuento (al menos ${MIN_NOMBRE_TIPO_DESCUENTO} letras).` };
  }
  if (nombre.length > MAX_NOMBRE_TIPO_DESCUENTO) {
    return { ok: false, error: `El nombre puede tener hasta ${MAX_NOMBRE_TIPO_DESCUENTO} letras.` };
  }

  const crudo = typeof d.porcentaje === "string" ? d.porcentaje.trim().replace(",", ".") : d.porcentaje;
  const valor = crudo === "" || crudo === null || crudo === undefined ? NaN : Number(crudo);
  if (!Number.isFinite(valor) || valor <= 0) {
    return { ok: false, error: "El porcentaje tiene que ser un número mayor a 0." };
  }
  if (valor > 100) return { ok: false, error: "El porcentaje no puede pasar del 100 %." };
  // Dos decimales como máximo: es lo que se guarda y lo que se imprime.
  const porcentaje = Math.round(valor * 100) / 100;
  if (porcentaje <= 0) return { ok: false, error: "El porcentaje tiene que ser un número mayor a 0." };
  return { ok: true, nombre, porcentaje };
}

/** "Cortesía · 100 %". */
export function textoTipoDescuento(t: { nombre: string; porcentaje: number }): string {
  return `${t.nombre} · ${textoPorcentaje(t.porcentaje)} %`;
}

/** Con el mismo nombre (sin importar mayúsculas, tildes ni espacios de más) no puede haber dos tipos en un mismo local. */
export function claveDeNombreDeTipo(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export type ResultadoDescuentoResuelto =
  | {
      ok: true;
      /** El descuento que se calcula de verdad (con el porcentaje del tipo, si se eligió uno); null = sin descuento. */
      descuento: DescuentoPedido | null;
      /** El nombre del tipo elegido ("Cortesía"), para dejarlo en la venta; null si el descuento se escribió a mano. */
      concepto: string | null;
    }
  | { ok: false; error: string };

/**
 * Lo primero que hace quien guarda un descuento (la caja del mostrador, o poner el descuento a una cuenta del comedor o del delivery):
 * decide qué porcentaje vale de verdad.
 *
 *  - Con un tipo elegido: manda el porcentaje del tipo (lo que traiga el navegador en `valor` se ignora) y el concepto es su nombre. El tipo
 *    tiene que existir y estar activo (`tipos` son los activos del local).
 *  - Sin tipo: el descuento es el que se escribió, pero un porcentaje de 100 o más se rechaza: el 100 % solo sale de un tipo.
 *  - Un tipo es siempre un porcentaje: no se combina con un monto.
 */
export function resolverDescuentoConTipos(
  pedido: DescuentoPedido | null | undefined,
  tipos: TipoDescuentoDef[]
): ResultadoDescuentoResuelto {
  if (!pedido) return { ok: true, descuento: null, concepto: null };

  const id = typeof pedido.tipoDescuentoId === "string" ? pedido.tipoDescuentoId : "";
  if (id) {
    if (pedido.tipo !== "porcentaje") return { ok: false, error: "Un tipo de descuento es siempre un porcentaje." };
    const tipo = tipos.find((t) => t.id === id);
    if (!tipo) return { ok: false, error: "Ese tipo de descuento ya no existe o está desactivado. Elegí otro." };
    return { ok: true, descuento: { tipo: "porcentaje", valor: tipo.porcentaje }, concepto: tipo.nombre };
  }

  if (pedido.tipo === "porcentaje" && Number(pedido.valor) >= 100) {
    return {
      ok: false,
      error: "El 100 % se da con un tipo de descuento de 100 % (por ejemplo Cortesía), que se crea en Ajustes → Tipos de descuentos.",
    };
  }
  return { ok: true, descuento: { tipo: pedido.tipo, valor: pedido.valor }, concepto: null };
}
