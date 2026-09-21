"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { prismaDelLocal, siguienteNumeroVentaPos, upsertClienteFiscal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { exigirPermiso } from "@/lib/auth";
import { normalizarFormaPagoPos, resumirTurno, type DeclaradoPorForma } from "@/lib/turno-pos";
import { armarPedido, type LineaPedida, type ProductoBase } from "@/lib/precio-pedido";
import { desglosarIva, formatearNumeroFactura } from "@/lib/factura-pos";
import { SIN_REGISTRO_FISCAL } from "@/lib/tipo-cliente";
import { turnoAbierto, pedidosDelTurno, entregasSinRendir } from "./turno-actual";

export type ResultadoAbrirTurno =
  | { ok: true; turnoId: string; yaAbierto: boolean }
  | { ok: false; error: string };

/**
 * Abre un turno nuevo para esa estación, o devuelve el que ya está abierto.
 *
 * Un solo turno puede estar abierto por ESTACIÓN a la vez (dos estaciones
 * del mismo local sí pueden tener cada una el suyo). Si dos cajeros de la
 * MISMA estación aprietan "Abrir turno" en el mismo instante, el índice
 * único parcial de la base rechaza al segundo create — se atrapa y se
 * engancha al turno que ganó en vez de fallarle en la cara.
 */
export async function abrirTurno(
  estacionId: string,
  montoInicial: number
): Promise<ResultadoAbrirTurno> {
  const sesion = await exigirPermiso("pos.vender");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const estacion = await db.estacion.findFirst({ where: { id: estacionId, activa: true } });
  if (!estacion) return { ok: false, error: "Esa estación no existe o está desactivada." };

  const existente = await turnoAbierto(db, estacionId);
  if (existente) {
    return { ok: true, turnoId: existente.id, yaAbierto: true };
  }

  const monto = Number.isFinite(montoInicial) && montoInicial >= 0 ? montoInicial : 0;

  try {
    const turno = await db.turnoPos.create({
      data: {
        storeId,
        estacionId,
        montoInicial: monto,
        abiertoPor: sesion.nombre?.trim() || sesion.email,
      },
      select: { id: true },
    });
    revalidatePath("/admin/pos");
    return { ok: true, turnoId: turno.id, yaAbierto: false };
  } catch {
    const turnoGanador = await turnoAbierto(db, estacionId);
    if (turnoGanador) return { ok: true, turnoId: turnoGanador.id, yaAbierto: true };
    return { ok: false, error: "No se pudo abrir el turno. Probá de nuevo." };
  }
}

export type ResultadoVenta =
  | { ok: true; ventaId: string; total: number; areasImpresion: string[] }
  | { ok: false; error: string };

export type ItemVentaInput =
  | { productId: string; opcionIds?: string[]; cantidad: number }
  | { mitadYMitad: { productIdA: string; productIdB: string }; opcionIds?: string[]; cantidad: number };

export type DatosVenta = {
  formaPago: string;
  /** "local" (se consume ahí) | "llevar" (para llevar). Cualquier otro valor cae en "local". */
  tipoEntrega: string;
  /** Opcionales: se guardan tal cual se tipean, sin normalizar — igual que
   *  Order.clienteTelefono — para que sumen al mismo cliente si después pide
   *  algo por el menú online. */
  clienteNombre: string;
  clienteTelefono: string;
  nota: string;
  items: ItemVentaInput[];
  /** "ticket" (default) | "factura" — factura solo si la estación de este
   *  turno tiene un punto de expedición vigente asignado. */
  comprobanteTipo: string;
  /** Clasificación SET del comprador — incluye "sin_nombre" (Consumidor
   *  Final, timbrado Autoimpresor obliga a facturar toda venta). Ver
   *  src/lib/tipo-cliente.ts. */
  facturaTipoIdentificacion?: string;
  /** No aplica si facturaTipoIdentificacion es "sin_nombre". */
  facturaNumeroIdentificacion?: string;
  facturaRazonSocial?: string;
  /** Opcional — pensado para el día que se implemente la factura
   *  electrónica. No aplica si facturaTipoIdentificacion es "sin_nombre". */
  facturaEmail?: string;
};

/**
 * Cobra el carrito y cierra la cuenta.
 *
 * El precio (y los combos mitad y mitad) se recalculan con `armarPedido`, la
 * misma función pura que usa el checkout público — nunca se confía en lo
 * que mande el navegador. Si se cargó el teléfono del cliente, además se le
 * da de alta (o se actualiza) su ficha de `Customer` — mismo upsert que
 * hace el checkout — para que la venta cuente para su progreso de
 * fidelización.
 */
export async function registrarVenta(turnoId: string, datos: DatosVenta): Promise<ResultadoVenta> {
  const sesion = await exigirPermiso("pos.vender");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const [turno, store] = await Promise.all([
    db.turnoPos.findUnique({
      where: { id: turnoId },
      select: { id: true, estado: true, estacion: { select: { puntoExpedicion: true } } },
    }),
    prisma.store.findUnique({ where: { id: storeId }, select: { facturaObligatoria: true } }),
  ]);
  if (!turno) return { ok: false, error: "Ese turno no existe." };
  if (turno.estado !== "abierto") {
    return { ok: false, error: "Ese turno ya está cerrado. Abrí uno nuevo para seguir vendiendo." };
  }

  if (!Array.isArray(datos.items) || datos.items.length === 0) {
    return { ok: false, error: "El carrito está vacío." };
  }

  const esFactura = datos.comprobanteTipo === "factura";
  const esSinRegistroFiscal = datos.facturaTipoIdentificacion === SIN_REGISTRO_FISCAL.tipo;
  const puntoExpedicion = turno.estacion.puntoExpedicion;
  const facturaObligatoria = store?.facturaObligatoria ?? false;
  const puntoVigente = !!puntoExpedicion && puntoExpedicion.activo && puntoExpedicion.timbradoHasta > new Date();

  // Si el local exige facturar toda venta (timbrado Autoimpresor, RG
  // 90/2021): sin punto vigente en esta estación no hay forma legal de
  // vender nada, y con punto vigente no se puede colar un "ticket". Nunca
  // hay que confiar en lo que mande el navegador — PantallaVenta ya oculta
  // estas opciones, pero esta validación es la que de verdad importa.
  if (facturaObligatoria) {
    if (!puntoVigente) {
      return {
        ok: false,
        error:
          "Este local exige facturar todas las ventas y esta estación no tiene un punto de expedición vigente asignado. Pedile al dueño que lo asigne en Puntos de expedición.",
      };
    }
    if (!esFactura) {
      return {
        ok: false,
        error: "Este local exige facturar todas las ventas — no se puede vender como ticket.",
      };
    }
  }

  if (esFactura) {
    if (!datos.facturaTipoIdentificacion) {
      return { ok: false, error: "Elegí con o sin registro fiscal." };
    }
    if (!esSinRegistroFiscal && (!datos.facturaNumeroIdentificacion?.trim() || !datos.facturaRazonSocial?.trim())) {
      return { ok: false, error: "Para factura con registro fiscal hacen falta el número y la razón social." };
    }
    if (!esSinRegistroFiscal && datos.facturaEmail?.trim() && !datos.facturaEmail.includes("@")) {
      return { ok: false, error: "El correo electrónico no es válido." };
    }
    if (!puntoExpedicion) {
      return {
        ok: false,
        error:
          "Esta estación no tiene un punto de expedición asignado. Vendé como ticket, o pedile al dueño que lo asigne en Estaciones.",
      };
    }
    if (!puntoExpedicion.activo || puntoExpedicion.timbradoHasta < new Date()) {
      return { ok: false, error: "El timbrado de este punto de expedición está vencido. No se puede emitir factura." };
    }
  }

  // El POS no ofrece variantes ni ingredientes-a-sacar (esos siguen siendo
  // exclusivos del menú online) — pero sí agregados, para ahorrarle al
  // cajero cargar "con queso extra" como una nota suelta. Se relee la carta
  // real igual que el checkout, con los agregados de cada producto.
  const productosDelLocal = await db.product.findMany({
    // Mismo filtro que el checkout público: si una categoría se desactivó
    // justo mientras el cajero tenía la pantalla abierta, sus productos no
    // se pueden seguir vendiendo.
    where: { category: { activa: true } },
    select: {
      id: true,
      nombre: true,
      precio: true,
      disponible: true,
      ingredientes: true,
      mitadYMitadGrupo: true,
      mitadYMitadModo: true,
      iva: true,
      areaImpresionId: true,
      opciones: {
        where: { tipo: "agregado" },
        orderBy: { orden: "asc" },
        select: { id: true, nombre: true, tipo: true, precioExtra: true, costo: true },
      },
      gruposAgregados: {
        select: {
          group: {
            select: {
              modificadores: {
                where: { product: { disponible: true } },
                select: { product: { select: { id: true, nombre: true, precio: true, costo: true } } },
              },
            },
          },
        },
      },
    },
  });
  // Para la impresión automática de comanda por área — ver
  // src/lib/impresion-comprobantes.ts. Los ítems "mitad y mitad" no tienen
  // un único producto (f.productId queda null) y, junto con los productos
  // sin área asignada, simplemente no aparecen en ninguna comanda impresa.
  const areaDelProducto = new Map(productosDelLocal.map((p) => [p.id, p.areaImpresionId]));
  const catalogo: ProductoBase[] = productosDelLocal.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    precio: p.precio,
    disponible: p.disponible,
    ingredientes: p.ingredientes,
    mitadYMitadGrupo: p.mitadYMitadGrupo,
    mitadYMitadModo: p.mitadYMitadModo,
    iva: p.iva,
    // Los agregados propios más los de cualquier grupo reutilizable
    // adjuntado — mismo criterio que en checkout/actions.ts: cada
    // modificador de un grupo ES un Product real, se usa su propio
    // precio/costo.
    opciones: [
      ...p.opciones,
      ...p.gruposAgregados.flatMap((g) =>
        g.group.modificadores.map((m) => ({
          id: m.product.id,
          nombre: m.product.nombre,
          tipo: "agregado",
          precioExtra: m.product.precio,
          costo: m.product.costo,
        }))
      ),
    ],
  }));

  const pedidas: LineaPedida[] = datos.items.map((it) =>
    "mitadYMitad" in it
      ? { mitadYMitad: it.mitadYMitad, opcionIds: it.opcionIds ?? [], cantidad: it.cantidad }
      : { productId: it.productId, opcionIds: it.opcionIds ?? [], cantidad: it.cantidad }
  );

  const armado = armarPedido(catalogo, pedidas);
  if (!armado.ok) return { ok: false, error: armado.motivo };

  const filas = armado.lineas;
  const total = armado.subtotal;
  if (total <= 0) return { ok: false, error: "El total tiene que ser mayor a cero." };

  const areasImpresion = [
    ...new Set(
      filas
        .map((f) => (f.productId ? areaDelProducto.get(f.productId) : null))
        .filter((a): a is string => !!a)
    ),
  ];

  const numero = await siguienteNumeroVentaPos(storeId);
  const registradoPor = sesion.nombre?.trim() || sesion.email;
  const formaPagoNormalizada = normalizarFormaPagoPos(datos.formaPago);
  const tipoEntrega = datos.tipoEntrega === "llevar" ? "llevar" : "local";
  const clienteNombre = datos.clienteNombre.trim() || null;
  const clienteTelefono = datos.clienteTelefono.trim() || null;
  const nota = datos.nota.trim() || null;

  if (clienteTelefono) {
    await prisma.customer.upsert({
      where: { storeId_telefono: { storeId, telefono: clienteTelefono } },
      update: clienteNombre ? { nombre: clienteNombre } : {},
      create: { storeId, nombre: clienteNombre || "Cliente de mostrador", telefono: clienteTelefono },
    });
  }

  const ventaId = await prisma.$transaction(async (tx) => {
    let datosFactura: Record<string, unknown> = { comprobanteTipo: "ticket" };

    if (esFactura && puntoExpedicion) {
      // Con registro fiscal: la ficha del cliente queda guardada por su
      // tipo+número (RUC, Cédula, etc.), para que la próxima vez que
      // factura ya no haga falta volver a elegir el tipo. "Sin nombre" no
      // tiene a quién guardarle nada.
      if (!esSinRegistroFiscal) {
        await upsertClienteFiscal(tx, storeId, {
          tipoIdentificacion: datos.facturaTipoIdentificacion!,
          numeroIdentificacion: datos.facturaNumeroIdentificacion!.trim(),
          razonSocial: datos.facturaRazonSocial!.trim(),
          email: datos.facturaEmail?.trim() ?? "",
        });
      }

      // Atómico: se incrementa PRIMERO y se usa el valor YA incrementado —
      // igual que siguienteNumeroVentaPos. Leer el número y recién después
      // incrementar dejaría una ventana donde dos ventas en simultáneo
      // podrían agarrar el mismo número.
      const peActualizado = await tx.puntoExpedicion.update({
        where: { id: puntoExpedicion.id },
        data: { ultimoNumeroFactura: { increment: 1 } },
        select: { ultimoNumeroFactura: true },
      });
      const desglose = desglosarIva(filas);
      datosFactura = {
        comprobanteTipo: "factura",
        facturaTipoIdentificacion: datos.facturaTipoIdentificacion,
        facturaRazonSocial: esSinRegistroFiscal ? null : datos.facturaRazonSocial!.trim(),
        facturaRuc: esSinRegistroFiscal ? SIN_REGISTRO_FISCAL.numero : datos.facturaNumeroIdentificacion!.trim(),
        facturaNumero: formatearNumeroFactura(
          puntoExpedicion.establecimiento,
          puntoExpedicion.puntoExpedicion,
          peActualizado.ultimoNumeroFactura
        ),
        facturaTimbrado: puntoExpedicion.numeroTimbrado,
        facturaVencimiento: puntoExpedicion.timbradoHasta,
        facturaGravado10: desglose.gravado10,
        facturaGravado5: desglose.gravado5,
        facturaExento: desglose.exento,
        facturaIva10: desglose.iva10,
        facturaIva5: desglose.iva5,
        // Congelado en el registro (a diferencia de antes, que se leía en
        // vivo vía turnoPos.estacion.puntoExpedicion al imprimir) — ver
        // comentario de estos campos en el schema (Fase 11, remisión).
        facturaRazonSocialEmisor: puntoExpedicion.razonSocialEmisor,
        facturaRucEmisor: puntoExpedicion.rucEmisor,
      };
    }

    const venta = await tx.ventaPos.create({
      data: {
        storeId,
        turnoPosId: turnoId,
        numero,
        formaPago: formaPagoNormalizada,
        total,
        registradoPor,
        clienteNombre,
        clienteTelefono,
        tipoEntrega,
        nota,
        ...datosFactura,
        items: {
          create: filas.map((f) => ({
            storeId,
            productId: f.productId,
            nombreProducto: f.nombreProducto,
            cantidad: f.cantidad,
            precioUnitario: f.precioUnitario,
            iva: f.iva,
            opcionesTexto: f.opcionesTexto ?? null,
          })),
        },
      },
      select: { id: true },
    });
    return venta.id;
  });

  revalidatePath("/admin/pos");
  revalidatePath("/admin/pos/cuentas");
  return { ok: true, ventaId, total, areasImpresion };
}

export type ResultadoCierreTurno = { ok: true; turnoId: string } | { ok: false; error: string };

/**
 * Cierra el turno, congelando lo calculado y lo declarado.
 *
 * Mismo antirracing que cerrarRendicion: si lo que hay cargado ahora no
 * coincide con lo que el cajero tenía en pantalla (entró una venta mientras
 * miraba el cierre), no cierra nada y pide refrescar.
 */
export async function cerrarTurno(
  turnoId: string,
  declarado: { efectivo: number; transferencia: number; tarjetaDebito: number; tarjetaCredito: number },
  notas: string,
  cantidadVista: number,
  totalVisto: number
): Promise<ResultadoCierreTurno> {
  const sesion = await exigirPermiso("pos.vender");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const turno = await db.turnoPos.findUnique({
    where: { id: turnoId },
    select: { id: true, estado: true },
  });
  if (!turno) return { ok: false, error: "Ese turno no existe." };
  if (turno.estado !== "abierto") return { ok: false, error: "Ese turno ya está cerrado." };

  // Corte general: no se puede cerrar caja mientras haya plata de delivery
  // circulando sin rendir — ni aunque sea de otra estación (ver
  // entregasSinRendir en turno-actual.ts). El formulario ya avisa esto antes
  // de mostrar el corte ciego, pero esta es la comprobación que de verdad
  // vale: llamar a la acción a mano no puede saltearla.
  const pendientes = await entregasSinRendir(db);
  if (pendientes.length > 0) {
    const repartidores = [...new Set(pendientes.map((p) => p.repartidor?.nombre ?? "sin asignar"))];
    return {
      ok: false,
      error: `No se puede cerrar el turno: hay ${pendientes.length} entrega(s) de delivery sin rendir (${repartidores.join(", ")}). Recibí esa rendición en Cierre antes de cerrar caja.`,
    };
  }

  // El formulario nunca manda algo inválido, pero esto es plata que se
  // congela para siempre en el comprobante: se rechaza el cierre entero en
  // vez de reemplazar en silencio un valor raro por 0 (mismo espíritu que la
  // validación de montoInicial en abrirTurno, pero acá no corresponde
  // "corregir" un monto declarado — corresponde frenar y que el cajero lo
  // vuelva a cargar bien).
  const declaradoValores = [
    declarado.efectivo,
    declarado.transferencia,
    declarado.tarjetaDebito,
    declarado.tarjetaCredito,
  ];
  if (declaradoValores.some((v) => !Number.isFinite(v) || v < 0)) {
    return { ok: false, error: "Los montos declarados tienen que ser números válidos, cero o más." };
  }

  // Un solo cierre: lo cobrado en el mostrador (VentaPos) y los pedidos de
  // retiro/mesa marcados "entregado" durante este turno (Order.turnoPosId)
  // se suman juntos, no en dos cuentas separadas.
  const [ventas, pedidos] = await Promise.all([
    db.ventaPos.findMany({
      where: { turnoPosId: turnoId, cancelada: false },
      select: { total: true, formaPago: true },
    }),
    pedidosDelTurno(db, turnoId),
  ]);
  const resumen = resumirTurno([
    ...ventas,
    ...pedidos
      .filter((p) => p.estado !== "cancelado")
      .map((p) => ({ total: p.total, formaPago: p.formaPagoPos ?? "efectivo" })),
  ]);

  if (resumen.cantidad !== cantidadVista || Math.round(resumen.totalGeneral) !== Math.round(totalVisto)) {
    return {
      ok: false,
      error:
        "Los números cambiaron mientras mirabas la pantalla (entró otra venta). " +
        "Refrescá y fijate el total nuevo antes de cerrar.",
    };
  }

  const declaradoPorForma: DeclaradoPorForma = {
    efectivo: declarado.efectivo,
    transferencia: declarado.transferencia,
    tarjeta_debito: declarado.tarjetaDebito,
    tarjeta_credito: declarado.tarjetaCredito,
  };

  await db.turnoPos.update({
    where: { id: turnoId },
    data: {
      estado: "cerrado",
      cantidadVentas: resumen.cantidad,
      calculadoEfectivo: resumen.porForma.efectivo,
      calculadoTransferencia: resumen.porForma.transferencia,
      calculadoTarjetaDebito: resumen.porForma.tarjeta_debito,
      calculadoTarjetaCredito: resumen.porForma.tarjeta_credito,
      declaradoEfectivo: declaradoPorForma.efectivo,
      declaradoTransferencia: declaradoPorForma.transferencia,
      declaradoTarjetaDebito: declaradoPorForma.tarjeta_debito,
      declaradoTarjetaCredito: declaradoPorForma.tarjeta_credito,
      notas: notas.trim() || null,
      cerradoPor: sesion.nombre?.trim() || sesion.email,
      cerradoEn: new Date(),
    },
  });

  revalidatePath("/admin/pos");
  revalidatePath("/admin/pos/turnos");
  return { ok: true, turnoId };
}

export type ResultadoBuscarCliente = { ok: true; nombre: string } | { ok: false };

/**
 * Busca si ese teléfono ya es cliente del local, para autocompletar el
 * nombre al cargar una venta — un cliente recurrente no tiene por qué
 * repetir su nombre cada vez que compra en el mostrador.
 *
 * Devuelve `{ok:false}` tanto si no existe como ante cualquier problema: es
 * una comodidad, no una validación, así que nunca tiene sentido cortar la
 * venta por esto.
 */
export async function buscarClientePorTelefono(telefono: string): Promise<ResultadoBuscarCliente> {
  await exigirPermiso("pos.vender");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const limpio = telefono.trim();
  if (!limpio) return { ok: false };

  const cliente = await db.customer.findUnique({
    where: { storeId_telefono: { storeId, telefono: limpio } },
    select: { nombre: true },
  });
  if (!cliente) return { ok: false };
  return { ok: true, nombre: cliente.nombre };
}

export type ResultadoBuscarClienteFiscal =
  | { ok: true; nombre: string; tipoIdentificacion: string }
  | { ok: false };

/**
 * Busca un cliente por su número de identificación fiscal (RUC, Cédula,
 * etc.), sin pedir el tipo primero — si es un cliente recurrente, con el
 * número solo alcanza para reconocerlo, tipo incluido, y no hace falta que
 * el cajero se acuerde con qué tipo se lo cargó la vez pasada.
 *
 * Mismo criterio que `buscarClientePorTelefono`: es una comodidad, nunca
 * corta la venta.
 */
export async function buscarClientePorIdentificacion(numero: string): Promise<ResultadoBuscarClienteFiscal> {
  await exigirPermiso("pos.vender");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const limpio = numero.trim();
  if (!limpio) return { ok: false };

  const cliente = await db.customer.findFirst({
    where: { numeroIdentificacion: limpio },
    select: { nombre: true, tipoIdentificacion: true },
  });
  if (!cliente?.tipoIdentificacion) return { ok: false };
  return { ok: true, nombre: cliente.nombre, tipoIdentificacion: cliente.tipoIdentificacion };
}

export type ResultadoCancelarVenta = { ok: true } | { ok: false; error: string };

/**
 * Anula una cuenta ya cobrada.
 *
 * Solo se puede cancelar mientras el turno al que pertenece sigue abierto:
 * una vez cerrado el turno, el cajero ya declaró esos montos en el corte
 * ciego y el comprobante quedó firmado — permitir cancelar después abriría
 * la puerta a "vender, cerrar caja, y después borrar la venta para que no
 * quede registro". No borra nada, de todos modos: queda marcada como
 * cancelada, con quién y por qué, nunca se elimina la fila.
 */
export async function cancelarVenta(ventaId: string, motivo: string): Promise<ResultadoCancelarVenta> {
  const sesion = await exigirPermiso("pos.vender");
  const storeId = await idLocalActual();
  const db = prismaDelLocal(storeId);

  const venta = await db.ventaPos.findUnique({
    where: { id: ventaId },
    select: {
      id: true,
      cancelada: true,
      turnoPos: { select: { estado: true } },
      facturaNumero: true,
      facturaAnulada: true,
    },
  });
  if (!venta) return { ok: false, error: "Esa cuenta no existe." };
  if (venta.cancelada) return { ok: false, error: "Esa cuenta ya estaba cancelada." };
  if (venta.turnoPos.estado !== "abierto") {
    return {
      ok: false,
      error: "El turno de esta cuenta ya está cerrado. Una vez cerrado el turno, la cuenta no se puede cancelar.",
    };
  }

  const identidad = sesion.nombre?.trim() || sesion.email;
  const ahora = new Date();

  await db.ventaPos.update({
    where: { id: ventaId },
    data: {
      cancelada: true,
      canceladaPor: identidad,
      canceladaEn: ahora,
      motivoCancelacion: motivo.trim() || null,
      // Cancelar la cuenta entera anula la factura de yapa: no puede quedar
      // un número de timbrado vigente sobre una venta que ya no existe.
      ...(venta.facturaNumero && !venta.facturaAnulada
        ? {
            facturaAnulada: true,
            facturaAnuladaPor: identidad,
            facturaAnuladaEn: ahora,
            facturaMotivoAnulacion: motivo.trim() || null,
          }
        : {}),
    },
  });

  revalidatePath("/admin/pos/cuentas");
  revalidatePath(`/admin/pos/venta/${ventaId}`);
  return { ok: true };
}
