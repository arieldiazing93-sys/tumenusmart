import Link from "next/link";
import { pantallaConPermiso } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { formatearGuarani } from "@/lib/format";
import { listarCuentasPorPagar, type FiltroEstadoCuentas } from "@/lib/cuentas-por-pagar";
import { ETIQUETA_ESTADO_CUENTA, type EstadoCuenta } from "@/lib/pagos-compra";
import {
  BotonEnlace,
  Cabecera,
  Campo,
  Pastilla,
  Selector,
  Tabla,
  Tarjeta,
  Td,
  Th,
  Tr,
  Vacio,
  clasesBoton,
  type ColorEstado,
} from "@/components/ui";
import { RegistrarPagoBoton } from "./RegistrarPagoBoton";

export const dynamic = "force-dynamic";

const COLOR_ESTADO: Record<EstadoCuenta, ColorEstado> = {
  pendiente: "aviso",
  parcial: "azul",
  pagada: "exito",
};

function estadoDelFiltro(valor: string | undefined): FiltroEstadoCuentas {
  return valor === "pagadas" || valor === "todas" ? valor : "con_saldo";
}

/** Cuándo vence una cuenta con saldo, en una pastilla que se lee de un vistazo. */
function PastillaVencimiento({ dias }: { dias: number | null }) {
  if (dias == null) return <Pastilla>Sin vencimiento</Pastilla>;
  if (dias < 0) return <Pastilla color="peligro">Vencida hace {-dias} {dias === -1 ? "día" : "días"}</Pastilla>;
  if (dias === 0) return <Pastilla color="aviso">Vence hoy</Pastilla>;
  if (dias <= 7) return <Pastilla color="aviso">Vence en {dias} {dias === 1 ? "día" : "días"}</Pastilla>;
  return <Pastilla>Vence en {dias} días</Pastilla>;
}

export default async function CuentasPorPagarPage({
  searchParams,
}: {
  searchParams: Promise<{ proveedor?: string; estado?: string }>;
}) {
  const sesion = await pantallaConPermiso("stock.ver");
  const puedeEditar = puede(sesion.rol, "stock.editar");
  const storeId = await idLocalActual();
  const prisma = prismaDelLocal(storeId);

  const { proveedor, estado: estadoTexto } = await searchParams;
  const estado = estadoDelFiltro(estadoTexto);
  const hayFiltros = !!proveedor || estado !== "con_saldo";

  const [cuentas, proveedores] = await Promise.all([
    listarCuentasPorPagar(storeId, { proveedorId: proveedor || null, estado }),
    prisma.proveedor.findMany({ orderBy: { nombre: "asc" }, select: { id: true, nombre: true } }),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <Cabecera
        titulo="Cuentas por pagar"
        bajada="Lo que le debés a tus proveedores por compras a crédito. Cada compra a crédito queda acá hasta que se paga completa; los pagos se anotan con Registrar pago."
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tarjeta>
          <p className="rotulo">Total que debés</p>
          <p className="cifra mt-1 text-[1.35rem] font-semibold text-tinta">{formatearGuarani(cuentas.totalSaldo)}</p>
        </Tarjeta>
        <Tarjeta>
          <p className="rotulo">Ya vencido</p>
          <p
            className={`cifra mt-1 text-[1.35rem] font-semibold ${cuentas.saldoVencido > 0 ? "text-peligro" : "text-tinta"}`}
          >
            {formatearGuarani(cuentas.saldoVencido)}
          </p>
        </Tarjeta>
        <Tarjeta>
          <p className="rotulo">Vence en los próximos 7 días</p>
          <p className="cifra mt-1 text-[1.35rem] font-semibold text-tinta">{formatearGuarani(cuentas.saldoPorVencer)}</p>
        </Tarjeta>
      </div>

      {cuentas.porProveedor.length > 0 && !proveedor && (
        <div className="flex flex-col gap-2">
          <p className="rotulo text-[0.8rem] font-bold">Lo que le debés a cada proveedor</p>
          <Tabla>
            <thead>
              <tr>
                <Th>Proveedor</Th>
                <Th>Compras con saldo</Th>
                <Th>Debés</Th>
                <Th>
                  <span className="sr-only">Acciones</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {cuentas.porProveedor.map((p) => (
                <Tr key={p.proveedorId ?? "sin-proveedor"}>
                  <Td className="font-medium text-tinta">{p.proveedor}</Td>
                  <Td>{p.compras}</Td>
                  <Td className="cifra font-semibold text-tinta">{formatearGuarani(p.saldo)}</Td>
                  <Td>
                    {p.proveedorId && (
                      <BotonEnlace href={`/admin/stock/cuentas-por-pagar?proveedor=${p.proveedorId}`} tono="navegar" tam="sm">
                        Ver sus compras
                      </BotonEnlace>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Tabla>
        </div>
      )}

      <form
        method="get"
        className="grid grid-cols-1 gap-3 rounded-xl border border-linea bg-superficie p-4 sm:grid-cols-3"
      >
        <Campo etiqueta="Proveedor">
          <Selector name="proveedor" defaultValue={proveedor ?? ""}>
            <option value="">Todos</option>
            {proveedores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Selector>
        </Campo>
        <Campo etiqueta="Mostrar">
          <Selector name="estado" defaultValue={estado}>
            <option value="con_saldo">Las que tienen saldo</option>
            <option value="pagadas">Las ya pagadas</option>
            <option value="todas">Todas</option>
          </Selector>
        </Campo>
        <div className="flex flex-wrap items-end gap-2">
          <button type="submit" className={clasesBoton("suave")}>
            Buscar
          </button>
          {hayFiltros && (
            <Link href="/admin/stock/cuentas-por-pagar" className={clasesBoton("fantasma")}>
              Limpiar filtros
            </Link>
          )}
        </div>

        {/* El reporte sale con el proveedor y el estado elegidos arriba, sin
            tener que apretar Buscar antes: cada botón manda este mismo
            formulario a su propia dirección (el Excel se descarga, el PDF se
            abre en otra pestaña). */}
        <div className="flex flex-wrap items-center gap-2 border-t border-linea pt-3 sm:col-span-3">
          <span className="text-sm font-medium text-tinta">Reporte de cuentas por pagar</span>
          <button
            type="submit"
            formAction="/admin/stock/cuentas-por-pagar/exportar"
            className={clasesBoton("principal", "sm")}
          >
            Descargar Excel
          </button>
          <button
            type="submit"
            formAction="/admin/stock/cuentas-por-pagar/imprimir"
            formTarget="_blank"
            className={clasesBoton("navegar", "sm")}
          >
            Ver reporte / PDF
          </button>
          <span className="text-xs text-tinta-suave">
            Usa el proveedor y el filtro de arriba. Incluye cada compra, lo que se debe a cada proveedor y los pagos hechos.
          </span>
        </div>
      </form>

      {cuentas.filas.length === 0 ? (
        <Vacio
          titulo={hayFiltros ? "Ninguna compra coincide con ese filtro" : "No tenés nada pendiente de pago"}
          detalle={
            hayFiltros ? undefined : "Cuando registres una compra a crédito, aparece acá hasta que se pague completa."
          }
        />
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Proveedor</Th>
              <Th>Folio</Th>
              <Th>Fecha</Th>
              <Th>Vencimiento</Th>
              <Th>Total</Th>
              <Th>Pagado</Th>
              <Th>Saldo</Th>
              <Th>Estado</Th>
              <Th>
                <span className="sr-only">Acciones</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {cuentas.filas.map((f) => (
              <Tr key={f.compraId}>
                <Td className="font-medium text-tinta">{f.proveedor}</Td>
                <Td>{f.folio ?? "—"}</Td>
                <Td>{f.fecha.toLocaleDateString("es-PY")}</Td>
                <Td>
                  {f.saldo > 0 ? (
                    <div className="flex flex-col items-start gap-1">
                      {f.vencimiento && <span>{f.vencimiento.toLocaleDateString("es-PY")}</span>}
                      <PastillaVencimiento dias={f.diasParaVencer} />
                    </div>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td className="cifra">{formatearGuarani(f.total)}</Td>
                <Td className="cifra">{formatearGuarani(f.pagado)}</Td>
                <Td className={`cifra font-semibold ${f.saldo > 0 ? "text-tinta" : ""}`}>{formatearGuarani(f.saldo)}</Td>
                <Td>
                  <Pastilla color={COLOR_ESTADO[f.estado]}>{ETIQUETA_ESTADO_CUENTA[f.estado]}</Pastilla>
                </Td>
                <Td>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <BotonEnlace href={`/admin/stock/compras/${f.compraId}#pagos`} tono="navegar" tam="sm">
                      Ver
                    </BotonEnlace>
                    {f.saldo > 0 && puedeEditar && (
                      <RegistrarPagoBoton
                        compraId={f.compraId}
                        saldo={f.saldo}
                        descripcion={`${f.proveedor}${f.folio ? ` — folio ${f.folio}` : ""}`}
                      />
                    )}
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </div>
  );
}
