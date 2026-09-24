import Link from "next/link";
import { pantallaConPermiso } from "@/lib/auth";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { MODULOS_BITACORA, etiquetaModulo } from "@/lib/bitacora";
import { limitesEnAsuncion, rangoDeDias } from "@/lib/rango-dias";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { Cabecera, Campo, Entrada, Pastilla, Selector, Tabla, Td, Th, Tr, Vacio, clasesBoton } from "@/components/ui";

export const dynamic = "force-dynamic";

const LIMITE = 500;

/** El detalle guardado como JSON en texto, listo para mostrar como "dato: valor". */
function detalleComoLista(texto: string | null): { clave: string; valor: string }[] {
  if (!texto) return [];
  try {
    const datos = JSON.parse(texto) as Record<string, unknown>;
    return Object.entries(datos).map(([clave, valor]) => ({
      clave: clave.replace(/_/g, " "),
      valor: typeof valor === "object" && valor !== null ? JSON.stringify(valor) : String(valor ?? "—"),
    }));
  } catch {
    return [{ clave: "detalle", valor: texto }];
  }
}

/**
 * La bitácora del sistema: quién hizo qué y cuándo, del más nuevo al más viejo.
 * Solo la ve el dueño. Es de solo lectura: lo que queda registrado no se edita
 * ni se borra desde ningún lado.
 */
export default async function BitacoraPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; usuario?: string; modulo?: string; q?: string }>;
}) {
  await pantallaConPermiso("bitacora.ver");
  const db = prismaDelLocal(await idLocalActual());

  const { desde, hasta, usuario, modulo, q } = await searchParams;
  const rango = rangoDeDias(desde, hasta);
  const texto = q?.trim() ?? "";
  const moduloValido = MODULOS_BITACORA.some((m) => m.valor === modulo) ? modulo : undefined;
  const hayFiltros = !!(desde || hasta || usuario || moduloValido || texto);

  const hace180Dias = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
  const [registros, usuarios] = await Promise.all([
    db.bitacora.findMany({
      where: {
        createdAt: limitesEnAsuncion(rango),
        ...(usuario ? { usuarioEmail: usuario } : {}),
        ...(moduloValido ? { modulo: moduloValido } : {}),
        ...(texto ? { descripcion: { contains: texto, mode: "insensitive" as const } } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: LIMITE,
    }),
    // Quiénes actuaron en los últimos meses, para el filtro por usuario.
    db.bitacora.groupBy({
      by: ["usuarioEmail", "usuario"],
      where: { createdAt: { gte: hace180Dias } },
    }),
  ]);

  const hora = (fecha: Date) =>
    fecha.toLocaleString("es-PY", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
      timeZone: ZONA_NEGOCIO,
    });

  return (
    <div className="flex flex-col gap-4">
      <Cabecera
        titulo="Bitácora"
        bajada="El registro de lo que hace cada usuario en el sistema: quién, qué y cuándo. Es solo de lectura: lo que queda anotado no se puede editar ni borrar."
      />

      <form
        method="get"
        className="grid grid-cols-1 gap-3 rounded-xl border border-linea bg-superficie p-4 sm:grid-cols-2 lg:grid-cols-5"
      >
        <Campo etiqueta="Desde">
          <Entrada type="date" name="desde" defaultValue={rango.desde} />
        </Campo>
        <Campo etiqueta="Hasta">
          <Entrada type="date" name="hasta" defaultValue={rango.hasta} />
        </Campo>
        <Campo etiqueta="Usuario">
          <Selector name="usuario" defaultValue={usuario ?? ""}>
            <option value="">Todos</option>
            {[...usuarios]
              .sort((a, b) => a.usuario.localeCompare(b.usuario, "es"))
              .map((u) => (
                <option key={u.usuarioEmail} value={u.usuarioEmail}>
                  {u.usuario}
                </option>
              ))}
          </Selector>
        </Campo>
        <Campo etiqueta="Área">
          <Selector name="modulo" defaultValue={moduloValido ?? ""}>
            <option value="">Todas</option>
            {MODULOS_BITACORA.map((m) => (
              <option key={m.valor} value={m.valor}>
                {m.etiqueta}
              </option>
            ))}
          </Selector>
        </Campo>
        <Campo etiqueta="Buscar en lo que hizo">
          <Entrada name="q" defaultValue={texto} placeholder="Ej: cancelada, #0007…" />
        </Campo>
        <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-5">
          <button type="submit" className={clasesBoton("principal", "sm")}>
            Buscar
          </button>
          {hayFiltros && (
            <Link href="/admin/bitacora" className={clasesBoton("fantasma", "sm")}>
              Limpiar filtros
            </Link>
          )}
          <span className="text-xs text-tinta-suave">
            Sin fechas, muestra el mes actual. Los dos extremos entran.
          </span>
        </div>
      </form>

      {registros.length === 0 ? (
        <Vacio
          titulo={hayFiltros ? "Nada coincide con ese filtro" : "Todavía no hay nada registrado en este período"}
          detalle={
            hayFiltros
              ? undefined
              : "A medida que se cancelen ventas, se anulen facturas, se carguen compras o se muevan insumos, va quedando acá."
          }
        />
      ) : (
        <>
          <Tabla>
            <thead>
              <tr className="bg-exito-luz">
                <Th>Fecha y hora</Th>
                <Th>Usuario</Th>
                <Th>Área</Th>
                <Th>Qué hizo</Th>
              </tr>
            </thead>
            <tbody>
              {registros.map((r) => {
                const detalle = detalleComoLista(r.detalle);
                return (
                  <Tr key={r.id}>
                    <Td className="cifra whitespace-nowrap align-top">{hora(r.createdAt)}</Td>
                    <Td className="align-top font-medium text-tinta">{r.usuario}</Td>
                    <Td className="align-top">
                      <Pastilla>{etiquetaModulo(r.modulo)}</Pastilla>
                    </Td>
                    <Td className="align-top text-tinta">
                      {r.descripcion}
                      {detalle.length > 0 && (
                        <details className="mt-1">
                          <summary className="cursor-pointer text-xs font-medium text-tinta-suave">Ver detalle</summary>
                          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs text-tinta-media">
                            {detalle.map((d) => (
                              <div key={d.clave} className="contents">
                                <dt className="font-medium capitalize">{d.clave}</dt>
                                <dd>{d.valor}</dd>
                              </div>
                            ))}
                          </dl>
                        </details>
                      )}
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </Tabla>
          <p className="text-xs text-tinta-suave">
            {registros.length === LIMITE
              ? `Se muestran los ${LIMITE} más recientes de este filtro. Acotá las fechas para ver los anteriores.`
              : `${registros.length} ${registros.length === 1 ? "registro" : "registros"}.`}
          </p>
        </>
      )}
    </div>
  );
}
