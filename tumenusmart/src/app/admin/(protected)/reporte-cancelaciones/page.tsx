import { pantallaConPermiso } from "@/lib/auth";
import { Cabecera, Campo, Cifra, Selector, Tabla, Td, Th, Tr, Vacio, clasesBoton } from "@/components/ui";
import { idLocalActual } from "@/lib/local-actual";
import { formatearCantidad, formatearGuarani } from "@/lib/format";
import { calcularRangoFecha, type FiltroFecha } from "@/lib/rango-fecha";
import { NOMBRE_DE_CANAL } from "@/lib/reporte-promociones";
import { TIPOS_DE_REGISTRO, formatearFechaHora, leerTipo, resumirRegistros } from "@/lib/reporte-cancelaciones";
import { cargarRegistros } from "@/lib/reporte-cancelaciones-servidor";
import { FiltroFechaReporte } from "@/components/FiltroFechaReporte";

export const dynamic = "force-dynamic";

// Los tres períodos que se usan: hoy, este mes y un rango de fechas (el rango lo trae el propio filtro, aparte de los atajos).
const FILTROS_FECHA: { value: FiltroFecha; label: string }[] = [
  { value: "hoy", label: "Hoy" },
  { value: "mes", label: "Este mes" },
];

const MAXIMO_FILAS_EN_PANTALLA = 300;

/**
 * Cancelaciones y descuentos: un solo formulario para sacar el reporte de las cuentas canceladas, de los productos cancelados o de los
 * descuentos, del período y de la persona que se elija, y en cada registro quién lo autorizó. Las cuentas están en
 * src/lib/reporte-cancelaciones.ts y la lectura de la base en reporte-cancelaciones-servidor.ts.
 */
export default async function ReporteCancelacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; usuario?: string; fecha?: string; desde?: string; hasta?: string }>;
}) {
  await pantallaConPermiso("estadisticas.ver");

  const { tipo: tipoCrudo, usuario: usuarioCrudo, fecha, desde, hasta } = await searchParams;
  const tipo = leerTipo(tipoCrudo);
  const info = TIPOS_DE_REGISTRO.find((t) => t.value === tipo)!;
  const usuario = usuarioCrudo?.trim() ? usuarioCrudo.trim() : null;
  const fechaActiva: FiltroFecha = (fecha as FiltroFecha) ?? "mes";
  const rango = calcularRangoFecha(fechaActiva, desde, hasta) ?? calcularRangoFecha("mes", undefined, undefined)!;

  const registros = await cargarRegistros(await idLocalActual(), rango, tipo);
  const r = resumirRegistros(registros, usuario);
  const t = r.totales;
  const filas = r.filas.slice(0, MAXIMO_FILAS_EN_PANTALLA);
  // Las personas para elegir; si la elegida no tuvo nada en este tipo o período, igual queda en la lista para no cambiarla sola.
  const personas = usuario && !r.usuarios.includes(usuario) ? [...r.usuarios, usuario] : r.usuarios;

  function querystringActual() {
    const params = new URLSearchParams();
    params.set("tipo", tipo);
    if (usuario) params.set("usuario", usuario);
    params.set("fecha", fechaActiva);
    if (fechaActiva === "rango" && desde) params.set("desde", desde);
    if (fechaActiva === "rango" && hasta) params.set("hasta", hasta);
    return params.toString();
  }

  const esProductos = tipo === "productos";
  const esDescuentos = tipo === "descuentos";

  return (
    <div className="flex flex-col gap-4">
      <Cabecera
        titulo="Cancelaciones y descuentos"
        bajada="Las cuentas canceladas, los productos cancelados y los descuentos, con la persona que autorizó cada uno y el motivo que dejó."
        acciones={
          <>
            <a href={`/admin/reporte-cancelaciones/exportar?${querystringActual()}`} className={clasesBoton("navegar", "sm")}>
              Descargar Excel
            </a>
            <a
              href={`/admin/reporte-cancelaciones/imprimir?${querystringActual()}`}
              target="_blank"
              rel="noopener noreferrer"
              className={clasesBoton("navegar", "sm")}
            >
              Ver reporte / PDF
            </a>
          </>
        }
      />

      {/* El período: se adapta al celular (atajos que se deslizan, rango en dos campos lado a lado) y conserva lo que se eligió abajo. */}
      <FiltroFechaReporte
        accion="/admin/reporte-cancelaciones"
        opciones={FILTROS_FECHA}
        activa={fechaActiva}
        desde={desde}
        hasta={hasta}
        conservar={{ tipo, usuario: usuario ?? undefined }}
      />

      {/* El criterio: qué reporte y de quién. Es un formulario común: no hace falta JavaScript. */}
      <form method="get" action="/admin/reporte-cancelaciones" className="campos-grises grid gap-3 rounded-xl border border-linea bg-superficie p-3.5 sm:grid-cols-[1fr_1fr_auto]">
        <input type="hidden" name="fecha" value={fechaActiva} />
        {fechaActiva === "rango" && desde && <input type="hidden" name="desde" value={desde} />}
        {fechaActiva === "rango" && hasta && <input type="hidden" name="hasta" value={hasta} />}
        <Campo etiqueta="Reporte">
          <Selector name="tipo" defaultValue={tipo}>
            {TIPOS_DE_REGISTRO.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Selector>
        </Campo>
        <Campo etiqueta="Autorizó">
          <Selector name="usuario" defaultValue={usuario ?? ""}>
            <option value="">Todas las personas</option>
            {personas.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Selector>
        </Campo>
        <div className="flex items-end">
          <button type="submit" className={`w-full sm:w-auto ${clasesBoton("navegar")}`}>
            Ver reporte
          </button>
        </div>
      </form>

      {r.filas.length === 0 ? (
        <Vacio
          titulo={`No hay registros de “${info.label.toLowerCase()}” en este período${usuario ? ` de ${usuario}` : ""}`}
          detalle="Cambiá el período, el reporte o la persona y tocá “Ver reporte”."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Cifra valor={t.registros} rotulo={info.label} detalle={esProductos ? `${formatearCantidad(t.unidades)} unidades` : undefined} />
            <Cifra
              valor={formatearGuarani(t.monto)}
              rotulo={info.cancelado}
              detalle={esDescuentos ? `sobre ${formatearGuarani(t.cobrado + t.monto)} antes del descuento` : undefined}
            />
            <Cifra valor={t.personas} rotulo="Personas que autorizaron" detalle={usuario ? `solo ${usuario}` : undefined} />
          </div>

          <h2 className="text-[0.95rem] font-semibold text-tinta">Por persona que autorizó</h2>
          <Tabla className="min-w-0">
            <thead>
              <tr>
                <Th>Autorizó</Th>
                <Th className="text-right">Registros</Th>
                <Th className="text-right">{info.cancelado}</Th>
              </tr>
            </thead>
            <tbody>
              {r.porPersona.map((p) => (
                <Tr key={p.usuario}>
                  <Td className="font-medium text-tinta">{p.usuario}</Td>
                  <Td className="cifra text-right">{p.registros}</Td>
                  <Td className="cifra text-right font-semibold text-tinta">{formatearGuarani(p.monto)}</Td>
                </Tr>
              ))}
            </tbody>
          </Tabla>

          <h2 className="text-[0.95rem] font-semibold text-tinta">Detalle</h2>
          <Tabla className="min-w-0">
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Canal</Th>
                <Th>{esDescuentos ? "Venta" : "Cuenta"}</Th>
                <Th>{esProductos ? "Producto" : esDescuentos ? "Descuento" : "Estado"}</Th>
                <Th className="text-right">{info.cancelado}</Th>
                {esDescuentos && <Th className="text-right">Cobrado</Th>}
                <Th>Motivo</Th>
                <Th>Autorizó</Th>
                {esProductos && <Th>Lo cargó</Th>}
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <Tr key={f.id}>
                  <Td className="whitespace-nowrap text-tinta-media">{formatearFechaHora(f.fecha)}</Td>
                  <Td>{NOMBRE_DE_CANAL[f.canal]}</Td>
                  <Td className="whitespace-nowrap">{f.referencia}</Td>
                  <Td>{f.detalle}</Td>
                  <Td className="cifra text-right font-semibold text-tinta">{formatearGuarani(f.monto)}</Td>
                  {esDescuentos && <Td className="cifra text-right">{f.cobrado === null ? "—" : formatearGuarani(f.cobrado)}</Td>}
                  <Td className="min-w-[10rem]">{f.motivo ?? "—"}</Td>
                  <Td className="font-medium text-tinta">{f.autorizo?.trim() || "Sin dato"}</Td>
                  {esProductos && <Td>{f.cargo ?? "—"}</Td>}
                </Tr>
              ))}
            </tbody>
          </Tabla>
          {r.filas.length > MAXIMO_FILAS_EN_PANTALLA && (
            <p className="text-[0.78rem] text-tinta-suave">
              Se muestran los {MAXIMO_FILAS_EN_PANTALLA} más recientes, de {r.filas.length}. El Excel trae todos.
            </p>
          )}

          <p className="text-[0.78rem] leading-snug text-tinta-suave">
            “Autorizó” es el usuario del panel que hizo la acción: quien cerró la cuenta, anuló el producto o la venta, o puso el descuento (en
            el mostrador, quien hizo la venta). Las cuentas canceladas son las cerradas sin cobrar —su monto es lo que se había cargado— y las
            ventas ya cobradas que después se anularon. Los descuentos son los generales de la cuenta, de ventas que no se anularon; los
            descuentos de las promociones están en su propio reporte. Cada registro cuenta por el día en que se hizo.
          </p>
        </>
      )}
    </div>
  );
}
