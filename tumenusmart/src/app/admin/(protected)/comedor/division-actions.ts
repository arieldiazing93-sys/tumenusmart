"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { idLocalActual } from "@/lib/local-actual";
import { exigirPermiso } from "@/lib/auth";
import { registrarBitacora } from "@/lib/bitacora";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { ESTADOS_CUENTA_ABIERTA, claveDeMesa, descuentoDeCuenta, leerConsumoGuardado, totalesDeCuenta } from "@/lib/comedor";
import { ErrorDeUsuario, pistaDelError } from "@/lib/comedor-servidor";
import {
  dividirEnPartesIguales,
  dividirPorProducto,
  nombresDeCuentasNuevas,
  type AsignacionDeLinea,
  type DescuentoDeParte,
  type LineaBase,
} from "@/lib/division-cuenta";

/**
 * Dividir la cuenta de una mesa (cada uno quiere su factura): en partes iguales o por producto. Los números salen de
 * src/lib/division-cuenta.ts —la misma función que usa la pantalla para mostrar cómo quedaría—, así que lo que la caja ve es
 * exactamente lo que se guarda, y ahí está la prueba de que no sobra ni falta un guaraní. Esta acción solo lo aplica:
 *
 *  - La cuenta original conserva su nombre ("Mesa 1") y su número; las nuevas se llaman "1-A", "1-B"… (cuenta propia, con su
 *    propio número correlativo, su descuento y, más adelante, su venta y su comprobante).
 *  - Solo se divide una cuenta ABIERTA: una vez impresa (por cobrar) ya se le entregó al cliente con su total y hay que
 *    reabrirla primero. Todas las cuentas resultantes quedan "abiertas", sin imprimir: sus totales cambiaron, así que hay que
 *    imprimir cada una antes de cobrarla (la regla de siempre). Un ticket de la cuenta original que quedó sin imprimir en la
 *    cola (de antes de reabrirla) se descarta.
 *  - El stock no se toca: ya bajó cuando se envió cada pedido. Lo que descontó cada línea (`consumo`) se reparte junto con
 *    ella, para que cancelar después una parte devuelva solo lo que le corresponde.
 *
 * Exige el permiso de la caja del comedor, trabaja solo dentro del local de la sesión, valida todo en el servidor (del
 * navegador solo llega QUÉ se divide y el total que se vio) y deja su rastro en la Bitácora. Todo ocurre en una transacción:
 * si algo falla, no queda nada a medias.
 */

export type DatosDivision =
  | { modo: "iguales"; partes: number; totalMostrado: number }
  | { modo: "producto"; destinos: number; asignaciones: AsignacionDeLinea[]; totalMostrado: number };

export type CuentaDividida = { id: string; numero: number; mesa: string; total: number };

export type ResultadoDivisionCuenta =
  | { ok: true; original: { mesa: string; total: number }; nuevas: CuentaDividida[] }
  | { ok: false; error: string };

const OPCIONES_TX = { timeout: 20_000, maxWait: 10_000 } as const;
const MAXIMO_DE_ASIGNACIONES = 500;

/** Las columnas del descuento de una cuenta (vacías si no tiene descuento). El motivo y quién lo dio vienen de la cuenta original. */
function columnasDeDescuento(
  descuento: DescuentoDeParte | null,
  original: { descuentoMotivo: string | null; descuentoPor: string | null }
) {
  return descuento
    ? {
        descuentoTipo: descuento.tipo,
        descuentoValor: descuento.valor,
        descuentoMotivo: original.descuentoMotivo,
        descuentoPor: original.descuentoPor,
      }
    : { descuentoTipo: null, descuentoValor: null, descuentoMotivo: null, descuentoPor: null };
}

/** Lo que llega del navegador sobre qué producto va a qué cuenta, con la forma comprobada. null si no tiene la forma esperada. */
function asignacionesValidas(valor: unknown): AsignacionDeLinea[] | null {
  if (!Array.isArray(valor) || valor.length > MAXIMO_DE_ASIGNACIONES) return null;
  const lista: AsignacionDeLinea[] = [];
  for (const x of valor) {
    if (!x || typeof x !== "object") return null;
    const o = x as { itemId?: unknown; destino?: unknown; cantidad?: unknown };
    if (typeof o.itemId !== "string" || typeof o.destino !== "number" || typeof o.cantidad !== "number") return null;
    lista.push({ itemId: o.itemId, destino: o.destino, cantidad: o.cantidad });
  }
  return lista;
}

export async function dividirCuenta(cuentaId: string, datos: DatosDivision): Promise<ResultadoDivisionCuenta> {
  const sesion = await exigirPermiso("comedor.gestionar");
  const storeId = await idLocalActual();

  // Lo que llega del navegador se comprueba antes de tocar nada.
  const modo = datos?.modo;
  if (modo !== "iguales" && modo !== "producto") return { ok: false, error: "Elegí cómo dividir la cuenta." };
  const totalMostrado = Math.round(Number(datos.totalMostrado));
  if (!Number.isFinite(totalMostrado)) return { ok: false, error: "Falta el total de la cuenta. Actualizá la pantalla." };
  const partes = datos.modo === "iguales" ? Math.round(Number(datos.partes)) : 0;
  const destinos = datos.modo === "producto" ? Math.round(Number(datos.destinos)) : 0;
  const asignaciones = datos.modo === "producto" ? asignacionesValidas(datos.asignaciones) : [];
  if (!asignaciones) return { ok: false, error: "Los productos elegidos no son válidos. Actualizá la pantalla." };

  let resultado: Extract<ResultadoDivisionCuenta, { ok: true }> & { numero: number; mesa: string; resumen: string };
  try {
    resultado = await prisma.$transaction(async (tx) => {
      const cuenta = await tx.cuentaMesa.findFirst({
        where: { id: String(cuentaId), storeId, estado: { in: [...ESTADOS_CUENTA_ABIERTA] } },
      });
      if (!cuenta) throw new ErrorDeUsuario("Esa cuenta ya está cerrada.");
      // Una cuenta impresa ya se le entregó al cliente con su total: no se divide. Para dividirla hay que reabrirla.
      if (cuenta.estado !== "abierta") {
        throw new ErrorDeUsuario("La cuenta ya está impresa: no se puede dividir. Reabrila y volvé a dividirla.");
      }

      // Se toma la fila con el estado en la condición: si la imprimieron o la cobraron en el mismo instante, acá no encuentra nada.
      const tomada = await tx.cuentaMesa.updateMany({
        where: { id: cuenta.id, storeId, estado: "abierta" },
        data: { estado: "abierta" },
      });
      if (tomada.count !== 1) throw new ErrorDeUsuario("La cuenta cambió mientras la dividías (se imprimió o se cerró). Actualizá la pantalla.");

      const filas = await tx.itemCuentaMesa.findMany({
        where: { cuentaId: cuenta.id, storeId, estado: "activo" },
        orderBy: [{ ronda: "asc" }, { linea: "asc" }],
      });
      if (filas.length === 0) throw new ErrorDeUsuario("La cuenta no tiene productos para dividir.");

      const lineas: LineaBase[] = filas.map((f) => ({
        id: f.id,
        nombreProducto: f.nombreProducto,
        cantidad: f.cantidad,
        precioUnitario: Number(f.precioUnitario),
        precioAgregados: Number(f.precioAgregados),
        costoProducto: f.costoProducto == null ? null : Number(f.costoProducto),
        costoAgregados: f.costoAgregados == null ? null : Number(f.costoAgregados),
        consumo: leerConsumoGuardado(f.consumo),
      }));
      const pedido = descuentoDeCuenta(cuenta);
      const actual = totalesDeCuenta(lineas, pedido);
      if (actual.descuentoInvalido) {
        throw new ErrorDeUsuario(`El descuento ya no corresponde a esta cuenta (${actual.descuentoInvalido}) Cambialo o quitalo.`);
      }
      // Si la cuenta cambió mientras se decidía cómo dividirla (el mozo cargó algo, o ya se había dividido), lo que la caja vio ya no
      // es lo real: se frena en vez de dividir otra cosa. Esto también frena un doble clic.
      if (totalMostrado !== Math.round(actual.total)) {
        throw new ErrorDeUsuario(
          `La cuenta cambió mientras la dividías: ahora es de ${formatearGuarani(actual.total)}. Cerrá este cuadro y volvé a dividir.`
        );
      }

      const plan =
        modo === "iguales"
          ? dividirEnPartesIguales(lineas, pedido, partes)
          : dividirPorProducto(lineas, pedido, destinos, asignaciones);
      if (!plan.ok) throw new ErrorDeUsuario(plan.error);

      // Los nombres de las cuentas nuevas: la mesa original con una letra, salteando los que otra cuenta abierta ya usa.
      const abiertas = await tx.cuentaMesa.findMany({ where: { storeId, mesaAbierta: { not: null } }, select: { mesaAbierta: true } });
      const enUso = new Set(abiertas.map((a) => a.mesaAbierta).filter((m): m is string => !!m));
      const base = cuenta.mesaBase ?? cuenta.mesa;
      const nombres = nombresDeCuentasNuevas(base, plan.partes.length - 1, (clave) => enUso.has(clave));
      if (!nombres) {
        throw new ErrorDeUsuario("No se pueden armar los nombres de las cuentas nuevas: el nombre de la mesa es demasiado largo.");
      }

      // Las cuentas nuevas: cada una con su número correlativo, el mismo mozo y su parte del descuento.
      const destinosDeCuenta: { id: string; numero: number; mesa: string }[] = [{ id: cuenta.id, numero: cuenta.numero, mesa: cuenta.mesa }];
      for (let i = 1; i < plan.partes.length; i++) {
        const { contadorCuentasMesa } = await tx.store.update({
          where: { id: storeId },
          data: { contadorCuentasMesa: { increment: 1 } },
          select: { contadorCuentasMesa: true },
        });
        const nueva = await tx.cuentaMesa.create({
          data: {
            storeId,
            numero: contadorCuentasMesa,
            mesa: nombres[i - 1],
            mesaAbierta: claveDeMesa(nombres[i - 1]),
            mozoId: cuenta.mozoId,
            estado: "abierta",
            cuentaOrigenId: cuenta.id,
            mesaBase: base,
            ...columnasDeDescuento(plan.partes[i].descuento, cuenta),
          },
          select: { id: true, numero: true, mesa: true },
        });
        destinosDeCuenta.push(nueva);
      }

      // La cuenta original, con la parte del descuento que le tocó.
      await tx.cuentaMesa.update({
        where: { id: cuenta.id },
        data: columnasDeDescuento(plan.partes[0].descuento, cuenta),
      });

      // Las líneas de cada cuenta: se mueven, se actualizan o se crean. Cada cambio exige que la fila siga activa y en la cuenta
      // original: si otra caja la tocó en el mismo instante, acá no encuentra nada y se deshace todo.
      const filaPorId = new Map(filas.map((f) => [f.id, f]));
      const cambio = "La cuenta cambió mientras se dividía. No se hizo ningún cambio: actualizá la pantalla y volvé a intentar.";
      for (let i = 0; i < plan.partes.length; i++) {
        const destino = destinosDeCuenta[i];
        const nuevas: Prisma.ItemCuentaMesaCreateManyInput[] = [];
        let numeroDeLinea = 0;
        for (const l of plan.partes[i].lineas) {
          const fila = filaPorId.get(l.origenId);
          if (!fila) throw new ErrorDeUsuario(cambio);
          if (l.accion === "mover") {
            // Pasa a otra cuenta. Si el producto se repartió entre varias cuentas y no quedó nada en la original, esta fila lleva solo
            // su parte (menos cantidad y menos stock descontado): se actualiza junto con el cambio de cuenta.
            const cambiaLaCantidad = Math.abs(l.cantidad - fila.cantidad) > 1e-9;
            const r = await tx.itemCuentaMesa.updateMany({
              where: { id: fila.id, storeId, cuentaId: cuenta.id, estado: "activo" },
              data: cambiaLaCantidad
                ? { cuentaId: destino.id, cantidad: l.cantidad, consumo: l.consumo as unknown as Prisma.InputJsonValue }
                : { cuentaId: destino.id },
            });
            if (r.count !== 1) throw new ErrorDeUsuario(cambio);
          } else if (l.accion === "actualizar") {
            const r = await tx.itemCuentaMesa.updateMany({
              where: { id: fila.id, storeId, cuentaId: cuenta.id, estado: "activo" },
              data: {
                nombreProducto: l.nombreProducto,
                cantidad: l.cantidad,
                precioUnitario: l.precioUnitario,
                precioAgregados: l.precioAgregados,
                costoProducto: l.costoProducto,
                costoAgregados: l.costoAgregados,
                consumo: l.consumo as unknown as Prisma.InputJsonValue,
              },
            });
            if (r.count !== 1) throw new ErrorDeUsuario(cambio);
          } else if (l.accion === "crear") {
            nuevas.push({
              storeId,
              cuentaId: destino.id,
              ronda: fila.ronda,
              // Una fila nueva necesita su propio par envío/línea (es único): el envío es el de esta cuenta nueva.
              envioId: `division-${destino.id}`,
              linea: numeroDeLinea++,
              mozoId: fila.mozoId,
              cargadoPor: fila.cargadoPor,
              productId: fila.productId,
              nombreProducto: l.nombreProducto,
              cantidad: l.cantidad,
              precioUnitario: l.precioUnitario,
              iva: fila.iva,
              opcionesTexto: fila.opcionesTexto,
              ingredientesQuitadosTexto: fila.ingredientesQuitadosTexto,
              nota: fila.nota,
              costoProducto: l.costoProducto,
              costoAgregados: l.costoAgregados,
              precioAgregados: l.precioAgregados,
              areaImpresionId: fila.areaImpresionId,
              consumo: l.consumo as unknown as Prisma.InputJsonValue,
              estado: "activo",
              enviadoEn: fila.enviadoEn,
            });
          }
          // "conservar": la fila no cambia ni de cuenta ni de datos.
        }
        if (nuevas.length > 0) await tx.itemCuentaMesa.createMany({ data: nuevas });
      }

      // La cuenta de antes, con el total de antes, ya no vale: si quedó sin imprimir en la cola, no tiene sentido que salga.
      await tx.trabajoImpresion.updateMany({
        where: { storeId, cuentaMesaId: cuenta.id, tipo: "ticket", estado: "pendiente" },
        data: { estado: "error", error: "La cuenta se dividió antes de imprimirse." },
      });

      const nuevasCuentas: CuentaDividida[] = destinosDeCuenta.slice(1).map((d, k) => ({
        id: d.id,
        numero: d.numero,
        mesa: d.mesa,
        total: plan.partes[k + 1].total,
      }));
      const resumen = [
        `Mesa ${cuenta.mesa} ${formatearGuarani(plan.partes[0].total)}`,
        ...nuevasCuentas.map((n) => `Mesa ${n.mesa} (cuenta ${formatearNumero(n.numero)}) ${formatearGuarani(n.total)}`),
      ].join(" · ");
      return {
        ok: true as const,
        original: { mesa: cuenta.mesa, total: plan.partes[0].total },
        nuevas: nuevasCuentas,
        numero: cuenta.numero,
        mesa: cuenta.mesa,
        resumen,
      };
    }, OPCIONES_TX);
  } catch (e) {
    if (e instanceof ErrorDeUsuario) return { ok: false, error: e.message };
    // Otra caja abrió, en el mismo instante, una cuenta con el mismo nombre de mesa.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { ok: false, error: "Otra persona acaba de abrir una cuenta con ese nombre de mesa. Probá de nuevo." };
    }
    console.error("[comedor] dividirCuenta falló", e);
    return { ok: false, error: `No se pudo dividir la cuenta. No se hizo ningún cambio. (Detalle: ${pistaDelError(e)})` };
  }

  await registrarBitacora(storeId, sesion, {
    modulo: "comedor",
    accion: "cuenta_dividida",
    descripcion: `Dividió la cuenta ${formatearNumero(resultado.numero)} de la mesa ${resultado.mesa} ${
      modo === "iguales" ? `en ${partes} partes iguales` : "por producto"
    }: ${resultado.resumen}.`,
    entidad: "CuentaMesa",
    entidadId: String(cuentaId),
    detalle: {
      modo,
      cuenta: formatearNumero(resultado.numero),
      mesa: resultado.mesa,
      original: resultado.original.total,
      nuevas: resultado.nuevas.map((n) => ({ mesa: n.mesa, cuenta: formatearNumero(n.numero), total: n.total })),
    },
  });
  revalidatePath("/admin/comedor");
  return { ok: true, original: resultado.original, nuevas: resultado.nuevas };
}
