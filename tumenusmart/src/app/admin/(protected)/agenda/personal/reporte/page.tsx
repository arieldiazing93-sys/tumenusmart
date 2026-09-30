import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { Aviso, BotonEnlace, Cabecera, Tabla, Td, Th, Tr, Vacio, clasesBoton } from "@/components/ui";
import { diaLargo } from "@/lib/agenda";
import { claveSumarDias } from "@/lib/calendario";
import { formatearGuarani } from "@/lib/format";
import { diaEnTexto } from "@/lib/rango-dias";
import { MAXIMO_DIAS_REPORTE, cargarReportePersonal } from "@/lib/reporte-personal";
import { claveDiaAsuncion } from "@/lib/timezone";
import { AvatarPersonal } from "../../AvatarPersonal";
import { FiltroReporte, type AtajoReporte } from "./FiltroReporte";

export const dynamic = "force-dynamic";

/** Tope de filas del detalle en pantalla: más que eso no se lee igual (los totales de arriba cuentan todo el período). */
const MAXIMO_FILAS = 500;

function textoPorcentaje(valor: number): string {
  return String(valor).replace(".", ",");
}

/**
 * El reporte de movimiento del personal: los trabajos que terminó cada persona (citas cobradas,
 * tanto las que tenían reserva como las cobradas en el mostrador a alguien sin reserva) y lo que le
 * toca de comisión, en el período que se elija. Se elige a quién —una persona o todo el personal—
 * y las fechas, y recién al tocar "Ver reporte" se arma. Se puede bajar en Excel. Es del dueño (ve comisiones).
 *
 * Cuenta por el día del trabajo, igual que Citas y la vista de cada persona (ver `lib/reporte-personal.ts`, que
 * también arma el Excel).
 */
export default async function ReportePersonalPage({
  searchParams,
}: {
  searchParams: Promise<{ personal?: string; desde?: string; hasta?: string }>;
}) {
  await pantallaConPermiso("agenda.configurar");
  const db = prismaDelLocal(await idLocalActual());
  const sp = await searchParams;

  const hoy = claveDiaAsuncion(new Date());
  const primerDiaMes = `${hoy.slice(0, 7)}-01`;
  const ultimoDiaMesAnterior = claveSumarDias(primerDiaMes, -1);
  const atajos: AtajoReporte[] = [
    { etiqueta: "Hoy", desde: hoy, hasta: hoy },
    { etiqueta: "Últimos 7 días", desde: claveSumarDias(hoy, -6), hasta: hoy },
    { etiqueta: "Este mes", desde: primerDiaMes, hasta: hoy },
    { etiqueta: "Mes anterior", desde: `${ultimoDiaMesAnterior.slice(0, 7)}-01`, hasta: ultimoDiaMesAnterior },
  ];

  const {
    personas,
    personalElegido,
    periodo,
    demasiadoLargo,
    porPersona,
    general,
    nombresSinComision,
    nombresSinComisionProducto,
    filas,
    hayMas,
  } = await cargarReportePersonal(db, sp, MAXIMO_FILAS);
  const promedio = general.cantidad > 0 ? general.cobrado / general.cantidad : 0;
  const columnas = personalElegido ? 7 : 8;
  // Sin trabajos NI ventas con comisión de producto: ahí sí no hay nada que mostrar. Antes solo miraba los
  // trabajos, y a alguien que solo vendió productos (sin hacer ningún corte) le mostraba "sin nada" igual.
  const hayMovimiento = general.cantidad > 0 || general.comisionProducto > 0;

  const resumen = [
    { rotulo: general.cantidad === 1 ? "Trabajo" : "Trabajos", valor: String(general.cantidad), tono: "neutro" },
    { rotulo: "Cobrado", valor: formatearGuarani(general.cobrado), tono: "neutro" },
    { rotulo: "Promedio por trabajo", valor: formatearGuarani(promedio), tono: "neutro" },
    { rotulo: "Comisión de servicios", valor: formatearGuarani(general.comision), tono: "exito" },
    { rotulo: "Comisión de productos", valor: formatearGuarani(general.comisionProducto), tono: "exito" },
  ];

  const urlDe = (personalId: string) =>
    periodo
      ? `/admin/agenda/personal/reporte?personal=${personalId}&desde=${periodo.desde}&hasta=${periodo.hasta}`
      : "/admin/agenda/personal/reporte";
  // La descarga en Excel: lo mismo que se está viendo (la misma persona y el mismo período).
  const urlExcel = periodo
    ? `/admin/agenda/personal/reporte/exportar?personal=${personalElegido?.id ?? "todos"}&desde=${periodo.desde}&hasta=${periodo.hasta}`
    : null;
  // La versión imprimible: mismo criterio, para "Imprimir / Guardar como PDF" desde el navegador.
  const urlImprimir = periodo
    ? `/admin/agenda/personal/reporte/imprimir?personal=${personalElegido?.id ?? "todos"}&desde=${periodo.desde}&hasta=${periodo.hasta}`
    : null;

  return (
    <div>
      <Cabecera
        titulo="Reporte de personal"
        bajada="El movimiento de cada persona: los trabajos que terminó (con reserva o cobrados en el mostrador) y lo que le toca de comisión. Elegí a quién y el período, y tocá Ver reporte."
        acciones={
          <BotonEnlace href="/admin/agenda/personal" tono="navegar" tam="md">
            Volver a Personal
          </BotonEnlace>
        }
      />

      <FiltroReporte
        personal={personas.map((p) => ({ id: p.id, nombre: p.nombre, activo: p.activo }))}
        valores={{
          personal: personalElegido?.id ?? "todos",
          desde: periodo?.desde ?? primerDiaMes,
          hasta: periodo?.hasta ?? hoy,
        }}
        atajos={atajos}
      />

      {!periodo ? (
        <Vacio
          titulo="Elegí a quién y el período"
          detalle="Después tocá Ver reporte: vas a ver los trabajos que terminó y lo que le toca de comisión."
        />
      ) : demasiadoLargo ? (
        <Aviso titulo="El período es muy largo">
          Elegí hasta {MAXIMO_DIAS_REPORTE} días por vez (un año) para armar el reporte.
        </Aviso>
      ) : (
        <>
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[1rem] font-semibold tracking-titular text-tinta">
              {personalElegido ? personalElegido.nombre : "Todo el personal"}
              <span className="font-normal text-tinta-media">
                {" "}
                · {periodo.desde === periodo.hasta ? diaEnTexto(periodo.desde) : `${diaEnTexto(periodo.desde)} – ${diaEnTexto(periodo.hasta)}`}
              </span>
            </h2>
            {/* Verde: sacar el reporte a un archivo (Excel). Azul: lleva a otra pantalla — el PDF se
                imprime/guarda desde ahí con el botón del navegador, mismo criterio que Estadísticas. */}
            {hayMovimiento && (
              <div className="flex flex-wrap gap-2">
                {urlExcel && (
                  <a href={urlExcel} className={clasesBoton("exito", "sm")}>
                    Descargar Excel
                  </a>
                )}
                {urlImprimir && (
                  <a href={urlImprimir} target="_blank" rel="noopener noreferrer" className={clasesBoton("navegar", "sm")}>
                    Ver reporte / PDF
                  </a>
                )}
              </div>
            )}
          </div>

          <dl className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {resumen.map((r) => (
              <div
                key={r.rotulo}
                className={`rounded-lg px-3 py-2.5 ${r.tono === "exito" ? "bg-exito-luz" : "bg-papel-suave"}`}
              >
                <dt className={`text-[0.7rem] font-medium ${r.tono === "exito" ? "text-exito" : "text-tinta-suave"}`}>
                  {r.rotulo}
                </dt>
                <dd
                  className={`cifra mt-0.5 truncate text-[1.05rem] font-semibold ${r.tono === "exito" ? "text-exito" : "text-tinta"}`}
                >
                  {r.valor}
                </dd>
              </div>
            ))}
          </dl>

          {nombresSinComision.length > 0 && (
            <div className="mb-3">
              <Aviso>
                {nombresSinComision.join(", ")} {nombresSinComision.length === 1 ? "todavía no tiene" : "todavía no tienen"} una
                comisión de servicio cargada, así que no se le calcula. Poné el porcentaje en Personal → Editar.
              </Aviso>
            </div>
          )}
          {nombresSinComisionProducto.length > 0 && (
            <div className="mb-3">
              <Aviso>
                {nombresSinComisionProducto.join(", ")}{" "}
                {nombresSinComisionProducto.length === 1 ? "todavía no tiene" : "todavía no tienen"} una comisión de
                producto cargada, así que no se le calcula. Poné el porcentaje en Personal → Editar.
              </Aviso>
            </div>
          )}

          {!hayMovimiento ? (
            <Vacio
              titulo={
                personalElegido
                  ? `${personalElegido.nombre} no tiene movimiento en este período`
                  : "No hay movimiento en este período"
              }
              detalle="Cuenta un trabajo cobrado (una cita, o una venta del mostrador asignada a esa persona) o una venta de productos con su comisión."
            />
          ) : (
            <>
              {/* ---------- por persona (solo cuando se mira a todo el personal) ---------- */}
              {!personalElegido && (
                <div className="mb-4">
                  {/* Pantalla ancha: tabla. */}
                  <div className="hidden md:block">
                    <Tabla>
                      <thead>
                        <tr>
                          <Th>Personal</Th>
                          <Th className="text-right">Trabajos</Th>
                          <Th className="text-right">Cobrado</Th>
                          <Th className="text-right">Comisión servicios</Th>
                          <Th className="text-right">Comisión productos</Th>
                          <Th className="text-right">
                            <span className="sr-only">Acción</span>
                          </Th>
                        </tr>
                      </thead>
                      <tbody>
                        {personas
                          .filter((p) => p.activo || porPersona.has(p.id))
                          .map((p) => {
                            const suma = porPersona.get(p.id) ?? { cantidad: 0, cobrado: 0, comision: 0, comisionProducto: 0 };
                            return (
                              <Tr key={p.id}>
                                <Td>
                                  <span className="flex items-center gap-2.5">
                                    <AvatarPersonal nombre={p.nombre} fotoUrl={p.fotoUrl} indice={p.indice} />
                                    <span className="min-w-0">
                                      <span className="block truncate font-medium text-tinta">{p.nombre}</span>
                                      <span className="block text-[0.72rem] text-tinta-suave">
                                        {p.comision != null ? `Servicio ${textoPorcentaje(p.comision)}%` : "Sin comisión servicio"}
                                        {" · "}
                                        {p.comisionProducto != null
                                          ? `Producto ${textoPorcentaje(p.comisionProducto)}%`
                                          : "Sin comisión producto"}
                                      </span>
                                    </span>
                                  </span>
                                </Td>
                                <Td className="cifra text-right">{suma.cantidad}</Td>
                                <Td className="cifra text-right">{formatearGuarani(suma.cobrado)}</Td>
                                <Td className="cifra text-right font-medium text-exito">{formatearGuarani(suma.comision)}</Td>
                                <Td className="cifra text-right font-medium text-exito">
                                  {formatearGuarani(suma.comisionProducto)}
                                </Td>
                                <Td className="text-right">
                                  {suma.cantidad > 0 && (
                                    <BotonEnlace href={urlDe(p.id)} tono="navegar" tam="sm">
                                      Ver su trabajo
                                    </BotonEnlace>
                                  )}
                                </Td>
                              </Tr>
                            );
                          })}
                      </tbody>
                      <tfoot>
                        <tr>
                          <Td className="text-right font-medium">Total</Td>
                          <Td className="cifra text-right font-semibold text-tinta">{general.cantidad}</Td>
                          <Td className="cifra text-right font-semibold text-tinta">{formatearGuarani(general.cobrado)}</Td>
                          <Td className="cifra text-right font-semibold text-exito">{formatearGuarani(general.comision)}</Td>
                          <Td className="cifra text-right font-semibold text-exito">
                            {formatearGuarani(general.comisionProducto)}
                          </Td>
                          <Td>{null}</Td>
                        </tr>
                      </tfoot>
                    </Tabla>
                  </div>

                  {/* Celular: una tarjeta por persona. */}
                  <ul className="flex flex-col gap-2 md:hidden">
                    {personas
                      .filter((p) => p.activo || porPersona.has(p.id))
                      .map((p) => {
                        const suma = porPersona.get(p.id) ?? {
                          cantidad: 0,
                          cobrado: 0,
                          comision: 0,
                          comisionProducto: 0,
                        };
                        return (
                          <li key={p.id} className="rounded-xl border border-linea bg-superficie p-3">
                            <div className="flex items-center gap-2.5">
                              <AvatarPersonal nombre={p.nombre} fotoUrl={p.fotoUrl} indice={p.indice} />
                              <div className="min-w-0 flex-1">
                                <p className="truncate font-medium text-tinta">{p.nombre}</p>
                                <p className="text-[0.72rem] text-tinta-suave">
                                  {p.comision != null ? `Servicio ${textoPorcentaje(p.comision)}%` : "Sin comisión servicio"}
                                  {" · "}
                                  {p.comisionProducto != null
                                    ? `Producto ${textoPorcentaje(p.comisionProducto)}%`
                                    : "Sin comisión producto"}
                                </p>
                              </div>
                            </div>
                            <div className="mt-2.5 grid grid-cols-2 gap-2 border-t border-linea-fina pt-2.5 text-center sm:grid-cols-4">
                              <div>
                                <p className="cifra text-[0.86rem] font-semibold text-tinta">{suma.cantidad}</p>
                                <p className="text-[0.66rem] text-tinta-suave">Trabajos</p>
                              </div>
                              <div>
                                <p className="cifra text-[0.86rem] font-semibold text-tinta">
                                  {formatearGuarani(suma.cobrado)}
                                </p>
                                <p className="text-[0.66rem] text-tinta-suave">Cobrado</p>
                              </div>
                              <div>
                                <p className="cifra text-[0.86rem] font-semibold text-exito">
                                  {formatearGuarani(suma.comision)}
                                </p>
                                <p className="text-[0.66rem] text-tinta-suave">Com. servicios</p>
                              </div>
                              <div>
                                <p className="cifra text-[0.86rem] font-semibold text-exito">
                                  {formatearGuarani(suma.comisionProducto)}
                                </p>
                                <p className="text-[0.66rem] text-tinta-suave">Com. productos</p>
                              </div>
                            </div>
                            {suma.cantidad > 0 && (
                              <BotonEnlace href={urlDe(p.id)} tono="navegar" tam="md" className="mt-3 w-full">
                                Ver su trabajo
                              </BotonEnlace>
                            )}
                          </li>
                        );
                      })}
                  </ul>
                </div>
              )}

              {/* ---------- el detalle de cada trabajo ---------- */}
              <p className="mb-1.5 text-[0.82rem] font-semibold text-tinta">Detalle de trabajos</p>

              {/* Pantalla ancha: tabla. */}
              <div className="hidden md:block">
                <Tabla>
                  <thead>
                    <tr>
                      <Th>Fecha y hora</Th>
                      {!personalElegido && <Th>Personal</Th>}
                      <Th>Cliente</Th>
                      <Th>Servicios</Th>
                      <Th>Pago</Th>
                      <Th className="text-right">Total</Th>
                      <Th className="text-right">%</Th>
                      <Th className="text-right">Comisión</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {filas.map((f) => (
                      <Tr key={f.id}>
                        <Td>
                          <span className="block font-medium text-tinta">{diaLargo(f.dia)}</span>
                          <span className="cifra text-[0.78rem] text-tinta-suave">{f.hora}</span>
                        </Td>
                        {!personalElegido && <Td>{f.personal}</Td>}
                        <Td className="font-medium text-tinta">
                          {f.cliente}
                          {f.sinReserva && (
                            <span className="block text-[0.7rem] font-normal text-tinta-suave">Sin reserva</span>
                          )}
                        </Td>
                        <Td>{f.servicios ?? "—"}</Td>
                        <Td>{f.pago}</Td>
                        <Td className="cifra text-right font-medium text-tinta">{formatearGuarani(f.total)}</Td>
                        <Td className="cifra text-right">
                          {f.porcentaje != null ? `${textoPorcentaje(f.porcentaje)}%` : "—"}
                        </Td>
                        <Td className="cifra text-right font-medium text-exito">
                          {f.porcentaje != null ? formatearGuarani(f.comision) : "—"}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                  {!hayMas && (
                    <tfoot>
                      <tr>
                        <Td colSpan={columnas - 3} className="text-right font-medium">
                          Total
                        </Td>
                        <Td className="cifra text-right font-semibold text-tinta">{formatearGuarani(general.cobrado)}</Td>
                        <Td>{null}</Td>
                        <Td className="cifra text-right font-semibold text-exito">{formatearGuarani(general.comision)}</Td>
                      </tr>
                    </tfoot>
                  )}
                </Tabla>
              </div>

              {/* Celular: una tarjeta por trabajo. */}
              <ul className="flex flex-col gap-2 md:hidden">
                {filas.map((f) => (
                  <li key={f.id} className="rounded-xl border border-linea bg-superficie p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-tinta">{diaLargo(f.dia)}</p>
                        <p className="cifra text-[0.78rem] text-tinta-suave">{f.hora}</p>
                      </div>
                      {!personalElegido && (
                        <p className="min-w-0 truncate text-[0.78rem] text-tinta-suave">{f.personal}</p>
                      )}
                    </div>

                    <p className="mt-2 truncate text-[0.95rem] font-semibold text-tinta">
                      {f.cliente}
                      {f.sinReserva && (
                        <span className="ml-1.5 text-[0.72rem] font-normal text-tinta-suave">(Sin reserva)</span>
                      )}
                    </p>
                    <p className="truncate text-[0.82rem] text-tinta-media">{f.servicios ?? "—"}</p>
                    <p className="text-[0.78rem] text-tinta-suave">{f.pago}</p>

                    <div className="mt-2.5 flex items-center justify-between border-t border-linea-fina pt-2.5 text-[0.82rem]">
                      <span className="text-tinta-media">
                        {f.porcentaje != null ? `${textoPorcentaje(f.porcentaje)}%` : "—"}
                      </span>
                      <span className="cifra font-semibold text-tinta">{formatearGuarani(f.total)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[0.82rem]">
                      <span className="text-tinta-suave">Comisión</span>
                      <span className="cifra font-semibold text-exito">
                        {f.porcentaje != null ? formatearGuarani(f.comision) : "—"}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>

              {hayMas && (
                <p className="mt-3 text-center text-[0.8rem] text-tinta-suave">
                  Se muestran los últimos {MAXIMO_FILAS} trabajos del período. Los totales de arriba cuentan todos: acotá las
                  fechas para ver el detalle completo.
                </p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
