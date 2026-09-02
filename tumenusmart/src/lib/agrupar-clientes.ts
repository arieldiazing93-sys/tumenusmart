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
