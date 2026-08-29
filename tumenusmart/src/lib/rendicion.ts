/**
 * El cierre de caja del repartidor.
 *
 * La idea de fondo es una sola y conviene decirla antes que nada: de todo lo
 * que el repartidor entregó, lo único que tiene que devolver en mano es el
 * EFECTIVO. Lo que se pagó con tarjeta o transferencia ya entró a la cuenta
 * del negocio y él nunca lo tocó.
 *
 * Por eso el número grande de la pantalla es uno solo —"esto me tenés que
 * dar"— y el resto va aparte, como información. Mezclarlos es exactamente lo
 * que hace que a las once de la noche, con tres repartidores volviendo
 * juntos, a alguien se le escape un pedido sin cobrar.
 *
 * Acá adentro no hay base de datos: se le pasan los pedidos ya leídos y
 * devuelve las cuentas. Así se puede probar de verdad.
 */

export type FormaDeCobro = "efectivo" | "tarjeta" | "transferencia" | "ya_pagado";

export const FORMAS_DE_COBRO: { valor: FormaDeCobro; etiqueta: string; rinde: boolean }[] = [
  { valor: "efectivo", etiqueta: "Efectivo", rinde: true },
  { valor: "tarjeta", etiqueta: "Tarjeta", rinde: false },
  { valor: "transferencia", etiqueta: "Transferencia", rinde: false },
  // "Ya estaba pago" es el pedido que se pagó antes de salir del local. El
  // repartidor no cobró nada y no debe nada por él, pero tiene que poder
  // decirlo: si no, la única opción honesta que le queda es mentir.
  { valor: "ya_pagado", etiqueta: "Ya estaba pago", rinde: false },
];

const VALIDAS = new Set(FORMAS_DE_COBRO.map((f) => f.valor));

/**
 * Convierte lo que venga en una forma de cobro válida.
 *
 * Cae en "efectivo" cuando no reconoce el valor, y no en null, porque este
 * dato lo manda el teléfono del repartidor: si llegara cualquier cosa, el
 * pedido tiene que quedar contado como plata a rendir y no desaparecer de la
 * cuenta. Es preferible que el dueño pida una aclaración de más a que un
 * pedido cobrado no figure en ningún lado.
 */
export function normalizarCobro(valor: unknown): FormaDeCobro {
  const texto = String(valor ?? "").trim().toLowerCase();
  return (VALIDAS.has(texto as FormaDeCobro) ? texto : "efectivo") as FormaDeCobro;
}

export function etiquetaDeCobro(valor: string): string {
  return FORMAS_DE_COBRO.find((f) => f.valor === valor)?.etiqueta ?? "Efectivo";
}

/** Si esa forma de cobro implica que el repartidor tiene plata en el bolsillo. */
export function rindeEfectivo(valor: string): boolean {
  return FORMAS_DE_COBRO.find((f) => f.valor === valor)?.rinde ?? true;
}

/**
 * Un monto como puede llegar desde donde sea.
 *
 * Prisma no devuelve los Decimal como número ni como texto: devuelve un
 * objeto Decimal. Poner acá `number | string` compilaba en las pruebas —donde
 * los montos se escriben a mano— y reventaba recién en el build, al pasarle
 * lo que da la base de verdad.
 *
 * Aceptar "algo que sabe convertirse en texto" cubre los tres casos sin que
 * este módulo tenga que importar Prisma, que es justo lo que lo hace
 * probable sin levantar una base.
 */
export type Monto = number | string | { toString(): string };

export type PedidoDeCierre = {
  id: string;
  numero: number;
  total: Monto;
  cobroMetodo: string | null;
};

export type ResumenCierre = {
  cantidad: number;
  /** Lo que el repartidor tiene que poner sobre el mostrador. */
  efectivo: number;
  /** Lo que se cobró por otros medios: no lo trae él, pero se muestra. */
  otros: number;
  /** Cuánto se movió en total, sirva o no para la rendición. */
  total: number;
  porMetodo: { metodo: FormaDeCobro; etiqueta: string; cantidad: number; monto: number }[];
};

function aNumero(valor: Monto): number {
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : 0;
  const n = parseFloat(String(valor));
  return Number.isFinite(n) ? n : 0;
}

export function resumirCierre(pedidos: PedidoDeCierre[]): ResumenCierre {
  const acumulado = new Map<FormaDeCobro, { cantidad: number; monto: number }>();
  let efectivo = 0;
  let otros = 0;

  for (const p of pedidos) {
    const metodo = normalizarCobro(p.cobroMetodo);
    const monto = aNumero(p.total);

    if (rindeEfectivo(metodo)) efectivo += monto;
    else otros += monto;

    const previo = acumulado.get(metodo) ?? { cantidad: 0, monto: 0 };
    acumulado.set(metodo, { cantidad: previo.cantidad + 1, monto: previo.monto + monto });
  }

  // Se recorre FORMAS_DE_COBRO y no el Map para que el orden sea siempre el
  // mismo: efectivo primero, que es lo que se cuenta con la plata en la mano.
  const porMetodo = FORMAS_DE_COBRO.filter((f) => acumulado.has(f.valor)).map((f) => {
    const d = acumulado.get(f.valor)!;
    return { metodo: f.valor, etiqueta: f.etiqueta, cantidad: d.cantidad, monto: d.monto };
  });

  return {
    cantidad: pedidos.length,
    efectivo,
    otros,
    total: efectivo + otros,
    porMetodo,
  };
}

// ===========================================================================
//  El comprobante de una rendición ya cerrada
// ===========================================================================

/**
 * Los totales que quedaron congelados al recibir la plata.
 *
 * Vienen de la tabla `Rendicion`, no de sumar los pedidos otra vez. El
 * comprobante existe justamente para decir cuánto se entregó ESE día, y eso
 * no puede cambiar porque alguien haya corregido un precio después.
 */
export type RendicionCongelada = {
  cantidadPedidos: number;
  totalEfectivo: Monto;
  totalOtros: Monto;
};

export type ContrasteRendicion = {
  /** Si los pedidos de hoy siguen dando lo mismo que se recibió aquel día. */
  coincide: boolean;
  cantidadRendida: number;
  cantidadAhora: number;
  efectivoRendido: number;
  efectivoAhora: number;
};

/**
 * Compara lo que se recibió contra lo que esos mismos pedidos dicen hoy.
 *
 * No sirve para corregir el comprobante —el número bueno es siempre el
 * congelado— sino para poder avisar en la hoja que algo se tocó después. Sin
 * esto, un pedido editado más tarde haría que la lista impresa no sumara el
 * total impreso y nadie sabría cuál de los dos creer.
 *
 * Los montos se comparan redondeados, igual que al cerrar: el guaraní no
 * tiene centavos y una diferencia de medio no es una edición.
 */
export function contrastarRendicion(
  pedidos: PedidoDeCierre[],
  congelada: RendicionCongelada
): ContrasteRendicion {
  const ahora = resumirCierre(pedidos);
  const efectivoRendido = aNumero(congelada.totalEfectivo);
  const cantidadRendida = congelada.cantidadPedidos;

  return {
    coincide:
      cantidadRendida === ahora.cantidad &&
      Math.round(efectivoRendido) === Math.round(ahora.efectivo),
    cantidadRendida,
    cantidadAhora: ahora.cantidad,
    efectivoRendido,
    efectivoAhora: ahora.efectivo,
  };
}
