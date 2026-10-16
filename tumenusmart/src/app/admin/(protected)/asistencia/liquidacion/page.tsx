import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { Aviso, BotonEnlace, Cabecera, Cifra, clasesBoton } from "@/components/ui";
import { FiltroFechaReporte } from "@/components/FiltroFechaReporte";
import { formatearGuarani } from "@/lib/format";
import { DIAS_MAXIMOS_LIQUIDACION, cargarLiquidacion, periodoDeLiquidacion } from "@/lib/liquidacion-asistencia";
import { AVISO_REFERENCIA_LIQUIDACION } from "@/lib/ausencias";
import type { FiltroFecha } from "@/lib/rango-fecha";
import { diaEnTexto } from "@/lib/rango-dias";
import { TablaLiquidacion } from "./TablaLiquidacion";

export const dynamic = "force-dynamic";

const FILTROS_FECHA: { value: FiltroFecha; label: string }[] = [
  { value: "hoy", label: "Hoy" },
  { value: "mes", label: "Este mes" },
  { value: "mesAnterior", label: "Mes anterior" },
];

/**
 * La liquidación del personal: por cada persona, los días que tenía que ir, los que fue, los justificados (reposo, aviso,
 * vacaciones, feriado) y las faltas sin aviso, y lo que le corresponde según cómo se le paga (mensual o jornal). Por defecto, este
 * mes. Esto NO paga nada: es el cálculo para que el dueño sepa cuánto es. Las cuentas están en src/lib/liquidacion-asistencia.ts.
 */
export default async function LiquidacionPage({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; desde?: string; hasta?: string }>;
}) {
  await pantallaConPermiso("asistencia.gestionar");
  const { fecha, desde, hasta } = await searchParams;
  const periodoPedido = periodoDeLiquidacion(fecha, desde, hasta);
  const fechaActiva: FiltroFecha = periodoPedido.activa;

  const db = prismaDelLocal(await idLocalActual());
  const reporte = await cargarLiquidacion(db, { desde: periodoPedido.desde, hasta: periodoPedido.hasta });
  const { filas, totales } = reporte;

  const consulta = `fecha=${fechaActiva}${fechaActiva === "rango" && desde ? `&desde=${desde}` : ""}${
    fechaActiva === "rango" && hasta ? `&hasta=${hasta}` : ""
  }`;
  const periodo =
    reporte.desde === reporte.hasta ? diaEnTexto(reporte.desde) : `${diaEnTexto(reporte.desde)} al ${diaEnTexto(reporte.hasta)}`;

  return (
    <div className="flex flex-col gap-3">
      <Cabecera
        titulo="Liquidación"
        bajada="Lo que le corresponde a cada persona según los días que fue y los que faltó, con avisos y justificativos. Es el cálculo: no paga nada."
        acciones={
          <>
            {/* Los dos botones del reporte, en azul: el Excel baja un archivo y el PDF se abre para imprimir. */}
            {filas.length > 0 && (
              <>
                <a href={`/admin/asistencia/liquidacion/exportar?${consulta}`} className={clasesBoton("navegar", "sm")}>
                  Descargar Excel
                </a>
                <a
                  href={`/admin/asistencia/liquidacion/imprimir?${consulta}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={clasesBoton("navegar", "sm")}
                >
                  Ver reporte / PDF
                </a>
              </>
            )}
            <BotonEnlace href="/admin/asistencia" tono="navegar" tam="sm">
              Marcaciones
            </BotonEnlace>
            <BotonEnlace href="/admin/asistencia/ausencias" tono="navegar" tam="sm">
              Ausencias
            </BotonEnlace>
          </>
        }
      />

      <FiltroFechaReporte accion="/admin/asistencia/liquidacion" opciones={FILTROS_FECHA} activa={fechaActiva} desde={desde} hasta={hasta} />
      <p className="-mt-2 text-[0.8rem] text-tinta-suave">Período: {periodo}</p>

      {reporte.recortado && (
        <p className="text-[0.76rem] text-aviso">Se liquidan como máximo {DIAS_MAXIMOS_LIQUIDACION} días de una vez: se muestran los últimos.</p>
      )}
      {reporte.incompleta && (
        <Aviso titulo="Hay tantas marcaciones que la lista se cortó" color="aviso">
          Los días trabajados pueden estar incompletos. Acotá el período para liquidar con todos los datos.
        </Aviso>
      )}
      {totales.sinFormaDePago > 0 && (
        <Aviso titulo={`${totales.sinFormaDePago} ${totales.sinFormaDePago === 1 ? "persona" : "personas"} sin forma de pago`} color="aviso">
          No se les puede calcular lo que les toca. Entrá a Colaboradores, tocá «Editar» y elegí mensual o jornal con su monto.
        </Aviso>
      )}

      {/* Lo primero que se lee: esto es una referencia, no una liquidación legal ni algo que se pague o descuente solo. */}
      <Aviso titulo={AVISO_REFERENCIA_LIQUIDACION.titulo} color="aviso">
        {AVISO_REFERENCIA_LIQUIDACION.texto}
      </Aviso>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cifra valor={formatearGuarani(totales.neto)} rotulo="Total a pagar" detalle={`${totales.personas} ${totales.personas === 1 ? "persona" : "personas"}`} />
        <Cifra valor={formatearGuarani(totales.bruto)} rotulo="Bruto" detalle="antes de descuentos" />
        <Cifra
          valor={formatearGuarani(totales.descuento)}
          rotulo="Descuentos"
          detalle={`${totales.faltas} ${totales.faltas === 1 ? "falta" : "faltas"} sin aviso · ${totales.justificadosSinGoce} sin goce`}
        />
        <Cifra valor={totales.tardanzas} rotulo="Llegadas tarde" detalle="informativo: no descuenta" />
      </div>

      <TablaLiquidacion filas={filas} />

      <p className="text-[0.76rem] leading-snug text-tinta-suave">
        Mensual: el salario del período menos un día (el salario ÷ 30) por cada falta sin aviso y cada día justificado sin goce. Jornal:
        un jornal por cada día que fue y por cada día justificado que se le paga. Los días de hoy sin marcar y los que vienen todavía
        no cuentan como falta. A quien se dio de baja se lo cuenta hasta su última marcación.
      </p>
    </div>
  );
}
