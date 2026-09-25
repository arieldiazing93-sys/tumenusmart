"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { prismaDelLocal, siguienteNumeroVentaPos, upsertClienteFiscal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { exigirPermiso } from "@/lib/auth";
import { FORMA_PAGO_A_CREDITO, resumirTurno, type DeclaradoPorForma } from "@/lib/turno-pos";
import { validarPagosDeVenta } from "@/lib/pago-venta";
import { claveDiaAsuncion } from "@/lib/timezone";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { registrarBitacora } from "@/lib/bitacora";
import { armarPedido, type LineaPedida, type ProductoBase } from "@/lib/precio-pedido";
import { registrarConsumoVenta, revertirMovimientosVenta } from "@/lib/movimientos-stock";
import { costoDelProducto } from "@/lib/costo-receta";
import { aplanarReceta } from "@/lib/insumo-elaborado";
import { cargarElaborados } from "@/lib/cargar-elaborados";
import { desglosarIva, formatearNumeroFactura } from "@/lib/factura-pos";
import { anularComprobantes, crearComprobante, descripcionDeItem } from "@/lib/comprobante";
import { DURACION_MINIMA_CITA } from "@/lib/agenda-cita";
import { calcularDescuento, type DescuentoPedido } from "@/lib/descuento-venta";
import { SIN_REGISTRO_FISCAL } from "@/lib/tipo-cliente";
import { turnoAbierto, pedidosDelTurno, entregasSinRendir, netoMovimientosCaja } from "./turno-actual";

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
    await registrarBitacora(storeId, sesion, {
      modulo: "caja",
      accion: "turno_abierto",
      descripcion: `Abrió el turno de caja en ${estacion.nombre}${monto > 0 ? ` con ${formatearGuarani(monto)} de fondo` : ""}.`,
      entidad: "TurnoPos",
      entidadId: turno.id,
      detalle: { estacion: estacion.nombre, fondo_inicial: monto },
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
  | {
      productId: string;
      opcionIds?: string[];
      cantidad: number;
      /**
       * Solo al cobrar una cita (ver `DatosVenta.citaId`): el precio final de un
       * servicio, si se cambió en el turno (un "desde", un ajuste). Se ignora en
       * cualquier otra venta y en cualquier producto que no sea un servicio.
       */
      precioServicio?: number;
    }
  | { mitadYMitad: { productIdA: string; productIdB: string }; opcionIds?: string[]; cantidad: number };

export type DatosVenta = {
  /**
   * Cómo paga el cliente: una forma, o varias si divide el pago (50.000 en
   * efectivo + 50.000 con débito). Con una sola, el monto se ignora y cobra
   * todo; con varias, la suma tiene que dar el total (lo calcula el servidor).
   * "a_credito" va sola. Ver validarPagosDeVenta.
   */
  pagos: { forma: string; monto: number }[];
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
  /** Descuento general de la cuenta (porcentaje o monto). Sin esto, o con valor 0, no hay descuento.
   *  El monto real lo calcula el servidor sobre el subtotal — ver calcularDescuento. */
  descuento?: DescuentoPedido;
  /** Solo si se paga "a_credito": en cuántos días vence lo que debe el cliente (0 a 365; por defecto 30). */
  creditoDias?: number;
  /**
   * Si esta venta cobra una cita de la agenda (ver cobrarCita en agenda/actions.ts):
   * su id. La cita queda Finalizada y enlazada a la venta en la misma transacción
   * que la crea — o no pasa ninguna de las dos cosas.
   */
  citaId?: string;
  /**
   * A quién del personal se le asigna el trabajo (negocios con "preguntar el personal al cobrar",
   * ver Store.pedirPersonalEnVenta). Solo se usa si el local lo tiene activado y la venta no cobra
   * una cita (esa ya tiene su persona): el servidor lo exige y lo verifica, nunca confía en el navegador.
   */
  personalId?: string;
};

/** Lo que se lanza dentro de la transacción si la cita ya no se puede cobrar (la cobraron en ese instante). */
const CITA_NO_COBRABLE = "CITA_NO_COBRABLE";

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
    prisma.store.findUnique({
      where: { id: storeId },
      select: { facturaObligatoria: true, ventasACredito: true, pedirPersonalEnVenta: true },
    }),
  ]);
  if (!turno) return { ok: false, error: "Ese turno no existe." };
  if (turno.estado !== "abierto") {
    return { ok: false, error: "Ese turno ya está cerrado. Abrí uno nuevo para seguir vendiendo." };
  }

  if (!Array.isArray(datos.items) || datos.items.length === 0) {
    return { ok: false, error: "El carrito está vacío." };
  }

  // Cobrar una cita: tiene que ser de este local (`db` ya filtra por local), no estar
  // cobrada ya y no estar cancelada. Se vuelve a comprobar adentro de la transacción.
  // La comisión de quien atiende esa cita, tal como está AHORA: queda guardada en la cita al cobrarla.
  let comisionDeLaCita: number | null = null;
  if (datos.citaId) {
    const cita = await db.cita.findFirst({
      where: { id: datos.citaId },
      select: { ventaPosId: true, estado: true, personal: { select: { comisionPorcentaje: true } } },
    });
    if (!cita) return { ok: false, error: "Esa cita no existe." };
    if (cita.ventaPosId) return { ok: false, error: "Esa cita ya está cobrada." };
    if (cita.estado === "cancelada" || cita.estado === "no_asistio") {
      return { ok: false, error: "Esa cita está cancelada o sin asistencia. Reactivala para poder cobrarla." };
    }
    comisionDeLaCita = cita.personal.comisionPorcentaje == null ? null : Number(cita.personal.comisionPorcentaje);
  }

  // Negocios que atienden sin reserva (barberías, salones): al cobrar en el mostrador el trabajo se le asigna a
  // una persona del personal, y esa venta queda como una cita ya cobrada suya (para su vista de trabajo y su
  // comisión). Solo si el local lo activó y hay personal cargado; con una cita de por medio no hace falta.
  let personalAsignado: { id: string; comisionPorcentaje: number | null } | null = null;
  if (!datos.citaId && store?.pedirPersonalEnVenta && (await db.miembroPersonal.count({ where: { activo: true } })) > 0) {
    const elegido =
      typeof datos.personalId === "string" && datos.personalId
        ? await db.miembroPersonal.findFirst({
            where: { id: datos.personalId, activo: true },
            select: { id: true, comisionPorcentaje: true },
          })
        : null;
    if (!elegido) return { ok: false, error: "Elegí a quién se le asigna el trabajo." };
    personalAsignado = {
      id: elegido.id,
      comisionPorcentaje: elegido.comisionPorcentaje == null ? null : Number(elegido.comisionPorcentaje),
    };
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

  // Venta a crédito: solo si el local la activó, y solo a un cliente al que se
  // le pueda cobrar después. El navegador ya lo pide, pero esto es lo que vale.
  // (Acá solo se mira si ES a crédito, porque eso cambia qué hay que pedirle al
  // cliente; que los pagos cierren contra el total se valida más abajo, cuando
  // el servidor ya calculó cuánto es.)
  const esCredito =
    Array.isArray(datos.pagos) &&
    datos.pagos.length === 1 &&
    String(datos.pagos[0]?.forma ?? "").trim().toLowerCase() === FORMA_PAGO_A_CREDITO;
  let fechaVencimientoCredito: Date | null = null;
  if (esCredito) {
    if (!store?.ventasACredito) {
      return { ok: false, error: "Este local no vende a crédito. Se activa en Configuración." };
    }
    const conRegistro = esFactura && !esSinRegistroFiscal;
    const nombreDeudor = datos.clienteNombre.trim() || (conRegistro ? (datos.facturaRazonSocial ?? "").trim() : "");
    const contactoDeudor =
      datos.clienteTelefono.trim() || (conRegistro ? (datos.facturaNumeroIdentificacion ?? "").trim() : "");
    if (!nombreDeudor || !contactoDeudor) {
      return {
        ok: false,
        error: "Una venta a crédito necesita el nombre del cliente y su teléfono o su RUC/cédula.",
      };
    }
    const diasPedidos = Math.round(Number(datos.creditoDias ?? 30));
    const dias = Number.isFinite(diasPedidos) ? Math.min(Math.max(diasPedidos, 0), 365) : 30;
    // El vencimiento es un día (no una hora): se guarda a medianoche UTC, como las demás fechas de día.
    fechaVencimientoCredito = new Date(Date.parse(claveDiaAsuncion(new Date())) + dias * 24 * 60 * 60 * 1000);
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
      almacenId: true,
      costo: true,
      // Para el comprobante: cada línea de la factura lleva su unidad de medida
      // y si es un servicio (eso decide el tipo de transacción de la factura electrónica).
      unidadMedida: true,
      esServicio: true,
      opciones: {
        where: { tipo: "agregado" },
        orderBy: { orden: "asc" },
        select: { id: true, nombre: true, tipo: true, precioExtra: true, costo: true },
      },
      // Insumos que consume este producto — ver Control de stock.
      receta: {
        select: {
          insumoId: true,
          cantidad: true,
          // Con el costo de cada insumo: de ahí sale el costo del producto (ver costo-receta.ts).
          insumo: { select: { costoUnitario: true } },
        },
      },
      gruposAgregados: {
        select: {
          group: {
            select: {
              modificadores: {
                where: { product: { disponible: true } },
                select: {
                  product: {
                    select: {
                      id: true,
                      nombre: true,
                      precio: true,
                      costo: true,
                      almacenId: true,
                      // Un modificador ES un Product: trae su propia receta —
                      // con el costo de cada insumo, porque el costo del
                      // agregado sale de ahí (ver costo-receta.ts).
                      receta: {
                        select: {
                          insumoId: true,
                          cantidad: true,
                          insumo: { select: { costoUnitario: true } },
                        },
                      },
                    },
                  },
                },
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
  const unidadDelProducto = new Map(productosDelLocal.map((p) => [p.id, p.unidadMedida]));
  const esServicioElProducto = new Map(productosDelLocal.map((p) => [p.id, p.esServicio]));
  // Las preparaciones (salsa, masa…) que lleve alguna receta se abren acá en
  // los insumos con que se hacen: el stock y el costo salen de esos insumos.
  const elaborados = await cargarElaborados(storeId);
  const catalogo: ProductoBase[] = productosDelLocal.map((p) => {
    const receta = aplanarReceta(p.receta, elaborados);
    return {
      id: p.id,
      nombre: p.nombre,
      precio: p.precio,
      disponible: p.disponible,
      ingredientes: p.ingredientes,
      mitadYMitadGrupo: p.mitadYMitadGrupo,
      mitadYMitadModo: p.mitadYMitadModo,
      iva: p.iva,
      receta,
      // Lo que cuesta preparar una unidad, según su receta: se guarda en la línea vendida.
      costo: costoDelProducto(p.costo, receta),
      almacenId: p.almacenId,
      // Los agregados propios más los de cualquier grupo reutilizable
      // adjuntado — mismo criterio que en checkout/actions.ts: cada
      // modificador de un grupo ES un Product real, se usa su propio
      // precio/costo/receta. Un agregado propio (ProductOption) no es un
      // Product, no tiene receta propia — [] a propósito.
      opciones: [
        ...p.opciones.map((o) => ({ ...o, receta: [], almacenId: null })),
        ...p.gruposAgregados.flatMap((g) =>
          g.group.modificadores.map((m) => {
            const recetaAgregado = aplanarReceta(m.product.receta, elaborados);
            return {
              id: m.product.id,
              nombre: m.product.nombre,
              tipo: "agregado",
              precioExtra: m.product.precio,
              costo: costoDelProducto(m.product.costo, recetaAgregado),
              receta: recetaAgregado,
              almacenId: m.product.almacenId,
            };
          })
        ),
      ],
    };
  });

  const pedidas: LineaPedida[] = datos.items.map((it) =>
    "mitadYMitad" in it
      ? { mitadYMitad: it.mitadYMitad, opcionIds: it.opcionIds ?? [], cantidad: it.cantidad }
      : { productId: it.productId, opcionIds: it.opcionIds ?? [], cantidad: it.cantidad }
  );

  const armado = armarPedido(catalogo, pedidas);
  if (!armado.ok) return { ok: false, error: armado.motivo };

  // Al cobrar una cita, el precio de un servicio puede haberse cambiado en el turno.
  // `armarPedido` devuelve las líneas en el mismo orden en que se pidieron, así que
  // se cruzan por posición. Solo cuenta para servicios y solo con una cita de por
  // medio: en cualquier otro caso el precio es siempre el de la carta.
  let filas = armado.lineas;
  let subtotal = armado.subtotal;
  if (datos.citaId) {
    for (const it of datos.items) {
      if (!("mitadYMitad" in it) && it.precioServicio !== undefined) {
        if (!Number.isFinite(it.precioServicio) || it.precioServicio < 0) {
          return { ok: false, error: "El precio de un servicio no es válido." };
        }
      }
    }
    filas = armado.lineas.map((f, i) => {
      const pedido = datos.items[i];
      const manual = pedido && !("mitadYMitad" in pedido) ? pedido.precioServicio : undefined;
      if (manual === undefined || !f.productId || !esServicioElProducto.get(f.productId)) return f;
      return { ...f, precioUnitario: Math.round(manual) };
    });
    subtotal = filas.reduce((suma, f) => suma + f.precioUnitario * f.cantidad, 0);
  }
  if (subtotal <= 0) return { ok: false, error: "El total tiene que ser mayor a cero." };

  // Descuento general: se calcula acá sobre el subtotal recalculado, nunca con
  // un monto que venga del navegador. `total` es lo que se cobra, ya con el
  // descuento restado — de ahí salen el cierre de turno y todos los reportes.
  const descuento = calcularDescuento(subtotal, datos.descuento);
  if (!descuento.ok) return { ok: false, error: descuento.error };
  const total = subtotal - descuento.monto;

  // Cómo se paga, contra el total que acaba de calcular el servidor: una forma
  // cobra todo; varias tienen que sumar exactamente el total.
  const pagosValidados = validarPagosDeVenta(datos.pagos, total);
  if (!pagosValidados.ok) return { ok: false, error: pagosValidados.error };

  const areasImpresion = [
    ...new Set(
      filas
        .map((f) => (f.productId ? areaDelProducto.get(f.productId) : null))
        .filter((a): a is string => !!a)
    ),
  ];

  // Si el trabajo se asigna a alguien del personal: cuánto dura cada servicio (para la hora de inicio de su cita).
  const servicioDelProducto = new Map<string, { id: string; duracionMin: number }>();
  if (personalAsignado) {
    const idsProductos = [...new Set(filas.flatMap((f) => (f.productId ? [f.productId] : [])))];
    if (idsProductos.length > 0) {
      const servicios = await db.servicioAgenda.findMany({
        where: { productId: { in: idsProductos } },
        select: { id: true, productId: true, duracionMin: true },
      });
      for (const s of servicios) servicioDelProducto.set(s.productId, { id: s.id, duracionMin: s.duracionMin });
    }
  }

  const numero = await siguienteNumeroVentaPos(storeId);
  const registradoPor = sesion.nombre?.trim() || sesion.email;
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

  const ventaCreada = await prisma
    .$transaction(async (tx) => {
    let datosFactura: Record<string, unknown> = { comprobanteTipo: "ticket" };
    // El número que consumió esta factura, para armar su Comprobante más abajo.
    let correlativoFactura: number | null = null;

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
      correlativoFactura = peActualizado.ultimoNumeroFactura;
      // El IVA va sobre lo que se cobró de verdad: el descuento se reparte
      // entre las tasas (ver desglosarIva).
      const desglose = desglosarIva(filas, descuento.monto);
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
        // El resumen ("efectivo", "mixto"…); el detalle con los montos va en `pagos`.
        formaPago: pagosValidados.formaPago,
        pagos: {
          create: pagosValidados.pagos.map((p, i) => ({
            storeId,
            forma: p.forma,
            monto: p.monto,
            orden: i,
          })),
        },
        fechaVencimientoCredito,
        total,
        descuento: descuento.monto,
        descuentoPorcentaje: descuento.porcentaje,
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
            // Snapshot de costos y del precio de agregados: Rentabilidad separa producto y
            // agregados también en el mostrador, y usa el costo del día de la venta.
            costoProducto: f.costoProducto,
            costoAgregados: f.costoAgregados,
            precioAgregados: f.precioAgregados,
          })),
        },
      },
      select: { id: true },
    });

    await registrarConsumoVenta(tx, storeId, filas, { ventaPosId: venta.id }, registradoPor);

    // Cobrar una cita: queda Finalizada y enlazada a esta venta. La condición evita
    // que dos cajas cobren la misma cita a la vez: la segunda no encuentra nada que
    // marcar y se deshace toda la venta (incluido el número de factura consumido).
    if (datos.citaId) {
      const marcada = await tx.cita.updateMany({
        where: {
          id: datos.citaId,
          storeId,
          ventaPosId: null,
          estado: { notIn: ["cancelada", "no_asistio"] },
        },
        data: { ventaPosId: venta.id, estado: "finalizada", precio: total, comisionPorcentaje: comisionDeLaCita },
      });
      if (marcada.count !== 1) throw new Error(CITA_NO_COBRABLE);
    }

    // Alguien que llegó sin reserva y se le asignó el trabajo a una persona: la venta queda como una cita ya
    // cobrada de esa persona (nace Finalizada, con la hora en que terminó el trabajo), así aparece en Citas, en su
    // vista de trabajo y en su comisión igual que una cita reservada.
    if (personalAsignado) {
      const fin = new Date();
      const lineasCita = filas.map((f) => {
        const servicio = f.productId ? servicioDelProducto.get(f.productId) : undefined;
        return {
          servicioId: servicio?.id ?? null,
          nombre: f.cantidad > 1 ? `${f.cantidad} × ${f.nombreProducto}` : f.nombreProducto,
          duracionMin: (servicio?.duracionMin ?? 0) * f.cantidad,
          precio: f.precioUnitario * f.cantidad,
        };
      });
      const duracion = Math.max(
        lineasCita.reduce((suma, l) => suma + l.duracionMin, 0),
        DURACION_MINIMA_CITA
      );
      await tx.cita.create({
        data: {
          storeId,
          personalId: personalAsignado.id,
          clienteNombre:
            clienteNombre ||
            (esFactura && !esSinRegistroFiscal ? datos.facturaRazonSocial?.trim() : "") ||
            "Cliente de mostrador",
          clienteTelefono,
          inicio: new Date(fin.getTime() - duracion * 60_000),
          fin,
          estado: "finalizada",
          precio: total,
          descuento: descuento.monto,
          descuentoPorcentaje: descuento.porcentaje,
          serviciosTexto: lineasCita
            .map((l) => l.nombre)
            .join(" + ")
            .slice(0, 300),
          bufferMin: 0,
          origen: "mostrador",
          visible: true,
          ventaPosId: venta.id,
          comisionPorcentaje: personalAsignado.comisionPorcentaje,
          servicios: {
            create: lineasCita.map((l) => ({
              storeId,
              servicioId: l.servicioId,
              nombre: l.nombre,
              duracionMin: l.duracionMin,
              precio: l.precio,
            })),
          },
        },
      });
    }

    // La foto fiscal de la factura: todo lo que un proveedor de factura
    // electrónica (o un reporte) necesita, en una sola tabla. Va en la misma
    // transacción que el número consumido, así nunca quedan una sin la otra.
    if (esFactura && puntoExpedicion && correlativoFactura !== null) {
      await crearComprobante(tx, {
        storeId,
        origen: { ventaPosId: venta.id },
        punto: puntoExpedicion,
        correlativo: correlativoFactura,
        receptor: {
          tipoIdentificacion: datos.facturaTipoIdentificacion!,
          numeroIdentificacion: esSinRegistroFiscal
            ? SIN_REGISTRO_FISCAL.numero
            : datos.facturaNumeroIdentificacion!.trim(),
          razonSocial: esSinRegistroFiscal ? null : datos.facturaRazonSocial!.trim(),
          email: esSinRegistroFiscal ? null : datos.facturaEmail?.trim() || null,
        },
        presencia: "presencial",
        condicion: esCredito ? "credito" : "contado",
        fechaVencimientoCredito,
        items: filas.map((f) => ({
          productId: f.productId ?? null,
          descripcion: descripcionDeItem(f.nombreProducto, f.opcionesTexto),
          unidadMedida: f.productId ? (unidadDelProducto.get(f.productId) ?? null) : null,
          // Un combo mitad y mitad (sin producto único) es comida: mercadería.
          esServicio: f.productId ? (esServicioElProducto.get(f.productId) ?? false) : false,
          cantidad: f.cantidad,
          precioUnitario: f.precioUnitario,
          iva: f.iva,
        })),
        descuento: descuento.monto,
        emitidoPor: registradoPor,
      });
    }

    return venta.id;
  })
    .catch((e: unknown) => {
      // La cita se cobró (o se canceló) en el mismo instante desde otra pantalla.
      if (e instanceof Error && e.message === CITA_NO_COBRABLE) return null;
      throw e;
    });
  if (ventaCreada === null) {
    return { ok: false, error: "Esa cita ya se cobró o se canceló mientras tanto. Actualizá la pantalla." };
  }
  const ventaId = ventaCreada;

  // Solo lo que conviene poder revisar después: las ventas con descuento y las
  // ventas a crédito. Cada venta común ya tiene su propio registro.
  if (descuento.monto > 0 || esCredito) {
    const partes = [
      descuento.monto > 0
        ? `con un descuento de ${formatearGuarani(descuento.monto)}${
            descuento.porcentaje != null ? ` (${descuento.porcentaje}%)` : ""
          }`
        : null,
      esCredito ? "a crédito" : null,
    ].filter(Boolean);
    await registrarBitacora(storeId, sesion, {
      modulo: "ventas",
      accion: esCredito ? "venta_a_credito" : "venta_con_descuento",
      descripcion: `Registró la venta ${formatearNumero(numero)} por ${formatearGuarani(total)}, ${partes.join(" y ")}.`,
      entidad: "VentaPos",
      entidadId: ventaId,
      detalle: {
        venta: formatearNumero(numero),
        subtotal,
        descuento: descuento.monto,
        total,
        a_credito: esCredito,
        cliente: clienteNombre ?? datos.facturaRazonSocial ?? null,
      },
    });
  }

  revalidatePath("/admin/pos");
  revalidatePath("/admin/pos/cuentas");
  if (datos.citaId || personalAsignado) {
    revalidatePath("/admin/agenda");
    revalidatePath("/admin/agenda/citas");
  }
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
      // Con el detalle de pagos: una venta con pago dividido suma en cada forma.
      select: { total: true, formaPago: true, pagos: { select: { forma: true, monto: true } } },
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

  // Lo que entró y salió de la caja en efectivo aparte de las ventas (ingresos
  // y retiros del turno): se congela acá, igual que lo calculado, y suma al
  // efectivo que tendría que haber.
  const movimientos = await netoMovimientosCaja(db, turnoId);

  await db.turnoPos.update({
    where: { id: turnoId },
    data: {
      estado: "cerrado",
      movimientosEfectivoNeto: movimientos.neto,
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

  const totalDeclarado =
    declarado.efectivo + declarado.transferencia + declarado.tarjetaDebito + declarado.tarjetaCredito;
  await registrarBitacora(storeId, sesion, {
    modulo: "caja",
    accion: "turno_cerrado",
    descripcion: `Cerró el turno de caja: ${resumen.cantidad} ${resumen.cantidad === 1 ? "venta" : "ventas"}, ${formatearGuarani(resumen.totalGeneral)} cobrados, ${formatearGuarani(totalDeclarado)} declarados.`,
    entidad: "TurnoPos",
    entidadId: turnoId,
    detalle: {
      ventas: resumen.cantidad,
      cobrado_calculado: resumen.totalGeneral,
      declarado_efectivo: declarado.efectivo,
      declarado_transferencia: declarado.transferencia,
      declarado_tarjeta_debito: declarado.tarjetaDebito,
      declarado_tarjeta_credito: declarado.tarjetaCredito,
      ingresos_menos_retiros_de_caja: movimientos.neto,
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
      numero: true,
      total: true,
      cancelada: true,
      turnoPos: { select: { estado: true } },
      facturaNumero: true,
      facturaAnulada: true,
      _count: { select: { cobros: true } },
    },
  });
  if (!venta) return { ok: false, error: "Esa cuenta no existe." };
  if (venta.cancelada) return { ok: false, error: "Esa cuenta ya estaba cancelada." };
  if (venta._count.cobros > 0) {
    return {
      ok: false,
      error: "Esta venta a crédito ya tiene cobros registrados. Eliminá primero sus cobros (en Cuentas por cobrar) y después cancelala.",
    };
  }
  if (venta.turnoPos.estado !== "abierto") {
    return {
      ok: false,
      error: "El turno de esta cuenta ya está cerrado. Una vez cerrado el turno, la cuenta no se puede cancelar.",
    };
  }

  const identidad = sesion.nombre?.trim() || sesion.email;
  const ahora = new Date();

  // En transacción: cancelar la cuenta y devolverle el stock a sus insumos
  // quedan como una sola cosa, nunca a medias.
  await prisma.$transaction(async (tx) => {
    await tx.ventaPos.update({
      where: { id: ventaId, storeId },
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

    // El comprobante de la factura también queda anulado (el número no se reutiliza).
    if (venta.facturaNumero && !venta.facturaAnulada) {
      await anularComprobantes(tx, {
        storeId,
        origen: { ventaPosId: ventaId },
        por: identidad,
        en: ahora,
        motivo: motivo.trim() || null,
      });
    }

    await revertirMovimientosVenta(tx, storeId, { ventaPosId: ventaId }, identidad);

    // Una venta del mostrador que se le asignó a alguien del personal creó su propia cita (ya
    // cobrada): si la venta se cancela, esa cita no tiene sentido y se borra.
    await tx.cita.deleteMany({ where: { storeId, ventaPosId: ventaId, origen: "mostrador" } });

    // Si esta venta había cobrado una cita de la agenda, la cita vuelve a estar sin
    // cobrar (queda como Próxima) y sale de Citas.
    await tx.cita.updateMany({
      where: { storeId, ventaPosId: ventaId },
      data: { ventaPosId: null, estado: "proxima", comisionPorcentaje: null },
    });
  });

  await registrarBitacora(storeId, sesion, {
    modulo: "ventas",
    accion: "venta_cancelada",
    descripcion: `Canceló la venta ${formatearNumero(venta.numero)} (${formatearGuarani(Number(venta.total))}). Motivo: ${motivo.trim() || "sin motivo"}.${
      venta.facturaNumero && !venta.facturaAnulada ? ` También quedó anulada la factura ${venta.facturaNumero}.` : ""
    }`,
    entidad: "VentaPos",
    entidadId: ventaId,
    detalle: { venta: formatearNumero(venta.numero), total: Number(venta.total), factura: venta.facturaNumero, motivo: motivo.trim() },
  });

  revalidatePath("/admin/pos/cuentas");
  revalidatePath(`/admin/pos/venta/${ventaId}`);
  revalidatePath("/admin/stock/insumos");
  revalidatePath("/admin/agenda");
  revalidatePath("/admin/agenda/citas");
  return { ok: true };
}
