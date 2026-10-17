/**
 * Agrupa pedidos por cliente (identificado por teléfono), sumando cantidad y
 * gasto y quedándose con el nombre y la fecha del pedido más reciente.
 *
 * Puro a propósito, sin tocar la base: tanto el analista comercial
 * (`src/lib/analista.ts`, que ya recibe los pedidos cargados) como el módulo
 * de Analytics (`src/lib/clientes-analytics.ts`, que sí consulta la base) usan
 * esta misma regla, para no terminar con dos formas distintas de decir
 * "quién es un cliente".
 */

export type ClienteAgrupado = {
  telefono: string;
  nombre: string;
  pedidos: number;
  gastado: number;
  ultimoPedido: Date;
};

export type PedidoParaAgrupar = {
  clienteTelefono: string;
  clienteNombre: string;
  createdAt: Date;
  total: number;
};

/**
 * Con qué se reconoce que dos ventas son del MISMO cliente: el teléfono, pero sin importar cómo lo escribió el cajero. El teléfono se
 * guarda tal cual se tipeó, así que «0981 123 456», «0981123456» y «+595 981 123 456» son la misma persona; esta clave es solo los
 * números, sin el 0 del principio ni el 595 del país: las tres dan «981123456».
 *
 * (Cuando un cliente no deja teléfono pero pide factura, se guarda su cédula o RUC en ese lugar: también se reconoce por sus números,
 * sin guiones ni puntos.) Devuelve vacío si no hay ningún número: esa venta no es de un cliente que se pueda reconocer.
 */
export function claveDeCliente(telefono: string | null | undefined): string {
  let digitos = (telefono ?? "").replace(/\D/g, "");
  if (!digitos) return "";
  // El 595 solo se saca si lo que queda sigue siendo un teléfono entero: una cédula corta que empiece con 595 no se toca.
  if (digitos.startsWith("595") && digitos.length >= 11) digitos = digitos.slice(3);
  if (digitos.startsWith("0")) digitos = digitos.slice(1);
  return digitos;
}

// OJO: esta lista (Analytics, Ideas) sigue agrupando por el teléfono EXACTO como está escrito, a propósito: el programa de fidelidad
// (src/lib/fidelidad.ts) cuenta las compras y los canjes por ese mismo texto, y unir acá lo que allá está separado desacomodaría el
// progreso de cada cliente. Hoy `claveDeCliente` la usa solo Estadísticas (tarjetas «Clientes únicos» y «Clientes nuevos»).
export function agruparPorCliente(pedidos: PedidoParaAgrupar[]): ClienteAgrupado[] {
  const mapa = new Map<string, ClienteAgrupado>();
  for (const p of pedidos) {
    const clave = p.clienteTelefono.trim();
    if (!clave) continue;
    const c = mapa.get(clave) ?? {
      telefono: clave,
      nombre: p.clienteNombre,
      pedidos: 0,
      gastado: 0,
      ultimoPedido: p.createdAt,
    };
    c.pedidos += 1;
    c.gastado += p.total;
    if (p.createdAt > c.ultimoPedido) {
      c.ultimoPedido = p.createdAt;
      c.nombre = p.clienteNombre;
    }
    mapa.set(clave, c);
  }
  return [...mapa.values()];
}
