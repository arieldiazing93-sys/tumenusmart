import type { ReactNode } from "react";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { EliminarProductoBoton, EliminarOpcionBoton } from "./[id]/EliminarBotones";
import { EditarProductoForm } from "./[id]/EditarProductoForm";
import { GruposAgregadosProducto } from "./[id]/GruposAgregadosProducto";
import { RecetaProducto } from "./[id]/RecetaProducto";
import { etiquetaIva, TASAS_IVA } from "@/lib/iva";
import { etiquetaUnidadMedida } from "@/lib/unidad-medida";
import { formatearGuarani } from "@/lib/format";
import { costoDeReceta, costoDelProducto } from "@/lib/costo-receta";
import { aplanarReceta } from "@/lib/insumo-elaborado";
import { cargarElaborados } from "@/lib/cargar-elaborados";
import { SELECCION_PROMOCIONES, tramosDeFilas } from "@/lib/precio-promocion";
import { PromocionesProducto } from "./PromocionesProducto";
import { Tarjeta } from "@/components/ui";

/**
 * Todos los datos de UN producto, para el panel de la derecha de Productos:
 * los datos básicos, el precio, la foto, la visibilidad, los ingredientes, el
 * mitad y mitad, los grupos de agregados y la receta con su costo y utilidad.
 *
 * Es un componente de servidor: lee solo este producto (por el cliente del
 * local, así que uno de otro negocio no aparece). Quien lo use tiene que haber
 * comprobado antes el permiso `productos.editar`, igual que la pantalla.
 */
export async function FichaProducto({ productoId }: { productoId: string }) {
  // Todas las consultas de acá abajo quedan atadas a este local.
  const idLocal = await idLocalActual();
  const prisma = prismaDelLocal(idLocal);

  const [producto, categorias, areasImpresion, todosLosAlmacenes, todosLosGrupos] = await Promise.all([
    prisma.product.findUnique({
      where: { id: productoId },
      include: {
        // Los precios de promoción (días y horas en que se vende a otro precio).
        promociones: SELECCION_PROMOCIONES,
        opciones: {
          orderBy: { orden: "asc" },
          select: { id: true, nombre: true, precioExtra: true },
        },
        receta: {
          select: {
            cantidad: true,
            insumo: {
              select: { id: true, nombre: true, unidadMedida: true, costoUnitario: true, esElaborado: true },
            },
          },
        },
        gruposAgregados: {
          orderBy: [{ orden: "asc" }, { id: "asc" }],
          include: {
            group: {
              include: {
                modificadores: {
                  orderBy: [{ orden: "asc" }, { id: "asc" }],
                  include: {
                    product: {
                      select: { id: true, nombre: true, precio: true, iva: true, unidadMedida: true },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.category.findMany({ orderBy: { orden: "asc" } }),
    prisma.areaImpresion.findMany({
      where: { activa: true },
      orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
      select: { id: true, nombre: true },
    }),
    // Todos, no solo los activos: uno desactivado que este producto ya tenía
    // elegido se tiene que poder seguir viendo (se filtra abajo).
    prisma.almacen.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, nombre: true, activo: true },
    }),
    prisma.optionGroup.findMany({
      orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
      select: { id: true, nombre: true, _count: { select: { modificadores: true } } },
    }),
  ]);

  if (!producto) {
    return (
      <div className="rounded-xl border border-dashed border-linea bg-papel-suave px-6 py-14 text-center">
        <p className="text-[0.95rem] font-semibold tracking-titular text-tinta">Ese producto ya no existe</p>
        <p className="mx-auto mt-1.5 max-w-sm text-[0.85rem] leading-snug text-tinta-media">
          Puede que lo hayan borrado desde otra pantalla. Elegí otro de la lista.
        </p>
      </div>
    );
  }

  const almacenes = todosLosAlmacenes.filter((a) => a.activo || a.id === producto.almacenId);

  // Si la receta lleva una preparación (salsa, masa…), el costo sale de los
  // insumos con que se hace: se la abre igual que al vender.
  const elaborados = await cargarElaborados(idLocal);
  const recetaAbierta = aplanarReceta(
    producto.receta.map((r) => ({
      insumoId: r.insumo.id,
      cantidad: r.cantidad,
      insumo: { costoUnitario: r.insumo.costoUnitario },
    })),
    elaborados
  );
  const costoPorReceta = costoDeReceta(recetaAbierta);

  // Costo y utilidad por unidad. Van sobre el precio SIN IVA: el precio de
  // venta lleva el IVA adentro y ese impuesto no es del negocio, mientras que
  // el costo de los insumos se guarda sin IVA — igual que en Rentabilidad.
  const costoProducto = costoDelProducto(producto.costo, recetaAbierta);
  const porcentajeIva = TASAS_IVA.find((t) => t.valor === producto.iva)?.porcentaje ?? 10;
  const precioSinIva = Number(producto.precio) / (1 + porcentajeIva / 100);
  const utilidad = costoProducto != null ? precioSinIva - costoProducto : null;
  const sobrePrecio = (monto: number) => (precioSinIva > 0 ? (monto / precioSinIva) * 100 : 0);

  const idsAdjuntados = new Set(producto.gruposAgregados.map((g) => g.groupId));
  const gruposDisponibles = todosLosGrupos
    .filter((g) => !idsAdjuntados.has(g.id))
    .map((g) => ({ id: g.id, nombre: g.nombre, cantidadModificadores: g._count.modificadores }));

  const nombreCategoria = categorias.find((c) => c.id === producto.categoryId)?.nombre ?? "esta categoría";

  return (
    // La llave hace que, al abrir otro producto, todos los formularios de abajo
    // arranquen de cero en vez de arrastrar lo que había escrito en el anterior.
    <div
      key={producto.id}
      className="flex flex-col gap-4 rounded-xl border-2 border-azul/50 bg-white p-3 sm:p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="break-words text-[1.1rem] font-semibold tracking-titular text-tinta">{producto.nombre}</h2>
          <p className="text-[0.8rem] text-tinta-suave">
            {nombreCategoria} · {formatearGuarani(Number(producto.precio))}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Un servicio tiene su precio en Agenda → Servicios: las promociones de precio son para productos. */}
          {!producto.esServicio && (
            <PromocionesProducto
              productId={producto.id}
              nombreProducto={producto.nombre}
              precioNormal={Number(producto.precio)}
              promociones={tramosDeFilas(producto.promociones)}
            />
          )}
          <EliminarProductoBoton productId={producto.id} />
        </div>
      </div>

      <EditarProductoForm
        producto={{
          id: producto.id,
          nombre: producto.nombre,
          descripcion: producto.descripcion,
          categoryId: producto.categoryId,
          areaImpresionId: producto.areaImpresionId,
          almacenId: producto.almacenId,
          precio: Number(producto.precio),
          iva: producto.iva,
          unidadMedida: producto.unidadMedida,
          esServicio: producto.esServicio,
          imagenUrl: producto.imagenUrl,
          disponible: producto.disponible,
          destacado: producto.destacado,
          ingredientes: producto.ingredientes,
          mitadYMitadGrupo: producto.mitadYMitadGrupo,
          mitadYMitadModo: producto.mitadYMitadModo,
        }}
        categorias={categorias}
        areasImpresion={areasImpresion}
        almacenes={almacenes}
      />

      {producto.opciones.length > 0 && (
        <Tarjeta className="flex flex-col gap-3">
          <div>
            <p className="rotulo text-[0.8rem] font-bold">Agregados propios (forma vieja)</p>
            <p className="text-sm text-tinta-media">
              Cargados antes de que existieran los Grupos de agregados — ya no se pueden crear ni
              editar acá, pero siguen ofreciéndose en la carta y el POS tal cual. Recreálos como
              producto real (en Grupos de agregados) y sacá estos con "Quitar".
            </p>
          </div>
          <div className="flex flex-col gap-2">
            {producto.opciones.map((o) => (
              <div
                key={o.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-linea bg-white px-3 py-2 text-sm"
              >
                <span>
                  {o.nombre} <span className="text-tinta-suave">· {formatearGuarani(Number(o.precioExtra))}</span>
                </span>
                <EliminarOpcionBoton productId={producto.id} optionId={o.id} />
              </div>
            ))}
          </div>
        </Tarjeta>
      )}

      <div className="flex flex-col gap-3 rounded-xl border border-azul/25 bg-azul-luz p-4">
        <div>
          <p className="rotulo text-[0.8rem] font-bold text-azul-oscuro">Grupos de agregados</p>
          <p className="text-sm text-tinta-media">
            Grupos reutilizables (ej: Salsas, Quesos) que se suman a los agregados propios de
            arriba. Cada modificador es un producto real de tu catálogo — buscalo y agregalo acá
            mismo, sin salir de esta pantalla.
          </p>
        </div>
        <GruposAgregadosProducto
          productId={producto.id}
          categoriaNombre={nombreCategoria}
          gruposAdjuntados={producto.gruposAgregados.map((pg) => ({
            id: pg.group.id,
            nombre: pg.group.nombre,
            modificadores: pg.group.modificadores.map((m) => ({
              productId: m.product.id,
              nombre: m.product.nombre,
              precio: Number(m.product.precio),
              iva: etiquetaIva(m.product.iva),
              unidadMedida: etiquetaUnidadMedida(m.product.unidadMedida),
            })),
          }))}
          gruposDisponibles={gruposDisponibles}
        />
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-linea bg-superficie p-4">
        <div>
          <p className="rotulo text-[0.8rem] font-bold">Receta (Control de stock)</p>
          <p className="text-sm text-tinta-media">
            Qué insumos descuenta cada unidad vendida de este producto, y cuánto de cada uno.
            Si usa una preparación (salsa, masa…), poné la preparación con la cantidad que lleva:
            al vender, se descuentan solos los insumos con que se hace. Sin receta, este producto
            no descuenta ningún insumo. Un "extra" de Grupos de agregados es también un producto —
            armale la receta en su propia ficha para que también descuente.
          </p>
        </div>
        <RecetaProducto
          productId={producto.id}
          receta={producto.receta.map((r) => ({
            insumoId: r.insumo.id,
            nombre: r.insumo.nombre,
            cantidad: Number(r.cantidad),
            unidadMedida: etiquetaUnidadMedida(r.insumo.unidadMedida),
            esElaborado: r.insumo.esElaborado,
          }))}
        />
        {/* El costo del producto ya no se carga a mano: sale de esta receta. */}
        {costoProducto != null && utilidad != null ? (
          <div className="flex flex-col gap-2 border-t border-linea pt-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p className="text-sm font-semibold text-tinta">Costo y utilidad por unidad</p>
              <p className="text-xs text-tinta-suave">
                Sobre el precio de venta sin IVA: {formatearGuarani(precioSinIva)} (precio{" "}
                {formatearGuarani(Number(producto.precio))}, {etiquetaIva(producto.iva).toLowerCase()})
              </p>
            </div>
            <div className="grid max-w-md grid-cols-[5.5rem_minmax(0,1fr)_5.5rem] items-center gap-x-2 gap-y-2">
              <span className="text-sm text-tinta-media">Costo</span>
              <CajaCosteo>{formatearGuarani(costoProducto)}</CajaCosteo>
              <CajaCosteo>{porcentaje(sobrePrecio(costoProducto))}</CajaCosteo>
              <span className="text-sm text-tinta-media">Utilidad</span>
              <CajaCosteo tono={utilidad < 0 ? "negativo" : "normal"}>{formatearGuarani(utilidad)}</CajaCosteo>
              <CajaCosteo tono={utilidad < 0 ? "negativo" : "normal"}>{porcentaje(sobrePrecio(utilidad))}</CajaCosteo>
            </div>
            <p className="text-xs text-tinta-suave">
              {costoPorReceta != null
                ? "El costo es la suma, por cada insumo, de la cantidad de la receta × el costo de ese insumo (el de su última compra, por unidad y sin IVA). La utilidad es el precio sin IVA menos el costo; los porcentajes son sobre el precio sin IVA."
                : "Este costo se cargó a mano antes de que existieran las recetas y se sigue usando hasta que armes la receta. La utilidad es el precio sin IVA menos el costo; los porcentajes son sobre el precio sin IVA."}
              {producto.receta.length > 0 &&
                costoPorReceta == null &&
                " La receta todavía no se puede costear: a algún insumo le falta el costo (se completa al registrar una compra)."}
            </p>
          </div>
        ) : (
          producto.receta.length > 0 && (
            <p className="border-t border-linea pt-3 text-sm text-tinta-media">
              Todavía no se puede calcular el costo: a algún insumo de la receta le falta el costo (se completa al
              registrar una compra).
            </p>
          )
        )}
      </div>
    </div>
  );
}

/** "16,7 %" — un porcentaje con un decimal, al estilo de acá. */
function porcentaje(valor: number): string {
  return `${new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 }).format(valor)} %`;
}

/** Un valor calculado, en una caja gris: se ve que ahí hay un dato, pero no se puede tipear. */
function CajaCosteo({ children, tono = "normal" }: { children: ReactNode; tono?: "normal" | "negativo" }) {
  return (
    <div
      className={`cifra rounded-lg border border-linea bg-papel-hundido px-3 py-2 text-right text-[0.88rem] font-semibold ${
        tono === "negativo" ? "text-peligro" : "text-tinta"
      }`}
    >
      {children}
    </div>
  );
}
