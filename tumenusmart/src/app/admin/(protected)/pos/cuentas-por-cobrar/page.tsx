import Link from "next/link";
import { pantallaConPermiso } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { idLocalActual } from "@/lib/local-actual";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { listarCuentasPorCobrar, type FiltroEstadoCobros } from "@/lib/cuentas-por-cobrar";
import { ETIQUETA_ESTADO_CUENTA, type EstadoCuenta } from "@/lib/pagos-compra";
import {
  BotonEnlace,
  Cabecera,
  Campo,
  Entrada,
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
import { RegistrarCobroBoton } from "./RegistrarCobroBoton";

export const dynamic = "force-dynamic";

const COLOR_ESTADO: Record<EstadoCuenta, ColorEstado> = {
  pendiente: "aviso",
  parcial: "azul",
  pagada: "exito",
};

/** Para lo que se cobra el estado "pagada" se lee "Cobrada". */
const ETIQUETA_ESTADO: Record<EstadoCuenta, string> = {
  ...ETIQUETA_ESTADO_CUENTA,
  pagada: "Cobrada",
};

function estadoDelFiltro(valor: string | undefined): FiltroEstadoCobros {
  return valor === "cobradas" || valor === "todas" ? valor : "con_saldo";
}

/** Cuándo vence una cuenta con saldo, en una pastilla que se lee de un vistazo. */
function PastillaVencimiento({ dias }: { dias: number | null }) {
  if (dias == null) return <Pastilla>Sin vencimiento</Pastilla>;
  if (dias < 0) return <Pastilla color="peligro">Vencida hace {-dias} {dias === -1 ? "día" : "días"}</Pastilla>;
  if (dias === 0) return <Pastilla color="aviso">Vence hoy</Pastilla>;
  if (dias <= 7) return <Pastilla color="aviso">Vence en {dias} {dias === 1 ? "día" : "días"}</Pastilla>;
  return <Pastilla>Vence en {dias} días</Pastilla>;
}

export default async function CuentasPorCobrarPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; estado?: string }>;
}) {
  await pantallaConPermiso("pos.vender");
  const storeId = await idLocalActual();

  const { q, estado: estadoTexto } = await searchParams;
  const texto = q?.trim() ?? "";
  const estado = estadoDelFiltro(estadoTexto);
  const hayFiltros = !!texto || estado !== "con_saldo";

  const [cuentas, store] = await Promise.all([
    listarCuentasPorCobrar(storeId, { texto, estado }),
    // Store no está en la lista de tablas por local: se lee con el cliente global y el id explícito.
    prisma.store.findUnique({ where: { id: storeId }, select: { ventasACredito: true } }),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <Cabecera
        titulo="Cuentas por cobrar"
        bajada="Lo que los clientes le deben al negocio por ventas a crédito. Cada venta a crédito queda acá hasta que se cobra completa; los cobros se anotan con Registrar cobro."
      />

      {!store?.ventasACredito && (
        <p className="rounded-lg bg-aviso-luz px-4 py-3 text-[0.85rem] font-medium text-aviso">
          Las ventas a crédito están desactivadas en Configuración: no se ofrece "A crédito" al cobrar. Lo que ya se
          vendió a crédito se sigue pudiendo cobrar desde acá.
        </p>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tarjeta>
          <p className="rotulo">Total que te deben</p>
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

      {cuentas.porCliente.length > 0 && !texto && (
        <div className="flex flex-col gap-2">
          <p className="rotulo text-[0.8rem] font-bold">Lo que debe cada cliente</p>
          <Tabla>
            <thead>
              <tr className="bg-exito-luz">
                <Th>Cliente</Th>
                <Th>Ventas con saldo</Th>
                <Th>Debe</Th>
                <Th>
                  <span className="sr-only">Acciones</span>
                </Th>
              </tr>
            </thead>
            <tbody>
              {cuentas.porCliente.map((c) => (
                <Tr key={c.clave}>
                  <Td className="font-medium text-tinta">
                    {c.cliente}
                    {c.telefono && <span className="block text-xs font-normal text-tinta-suave">{c.telefono}</span>}
                  </Td>
                  <Td>{c.ventas}</Td>
                  <Td className="cifra font-semibold text-tinta">{formatearGuarani(c.saldo)}</Td>
                  <Td>
                    <BotonEnlace
                      href={`/admin/pos/cuentas-por-cobrar?q=${encodeURIComponent(c.clave)}`}
                      tono="navegar"
                      tam="sm"
                    >
                      Ver sus ventas
                    </BotonEnlace>
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
        <Campo etiqueta="Buscar cliente">
          <Entrada name="q" defaultValue={texto} placeholder="Nombre, teléfono o RUC" />
        </Campo>
        <Campo etiqueta="Mostrar">
          <Selector name="estado" defaultValue={estado}>
            <option value="con_saldo">Las que tienen saldo</option>
            <option value="cobradas">Las ya cobradas</option>
            <option value="todas">Todas</option>
          </Selector>
        </Campo>
        <div className="flex flex-wrap items-end gap-2">
          <button type="submit" className={clasesBoton("suave")}>
            Buscar
          </button>
          {hayFiltros && (
            <Link href="/admin/pos/cuentas-por-cobrar" className={clasesBoton("fantasma")}>
              Limpiar filtros
            </Link>
          )}
        </div>
      </form>

      {cuentas.filas.length === 0 ? (
        <Vacio
          titulo={hayFiltros ? "Ninguna venta coincide con ese filtro" : "Nadie te debe nada por ahora"}
          detalle={
            hayFiltros
              ? undefined
              : "Cuando vendas a crédito en el Punto de Venta, la venta aparece acá hasta que se cobre completa."
          }
        />
      ) : (
        <Tabla>
          <thead>
            <tr className="bg-exito-luz">
              <Th>Venta</Th>
              <Th>Fecha</Th>
              <Th>Cliente</Th>
              <Th>Vencimiento</Th>
              <Th>Total</Th>
              <Th>Cobrado</Th>
              <Th>Saldo</Th>
              <Th>Estado</Th>
              <Th>
                <span className="sr-only">Acciones</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {cuentas.filas.map((f) => (
              <Tr key={f.ventaId}>
                <Td className="cifra font-medium text-tinta">
                  {formatearNumero(f.numero)}
                  {f.facturaNumero && <span className="block text-xs font-normal text-tinta-suave">Fact. {f.facturaNumero}</span>}
                </Td>
                <Td>{f.fecha.toLocaleDateString("es-PY")}</Td>
                <Td className="font-medium text-tinta">
                  {f.cliente}
                  {(f.identificacion || f.telefono) && (
                    <span className="block text-xs font-normal text-tinta-suave">
                      {[f.identificacion, f.telefono].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </Td>
                <Td>
                  {f.saldo > 0 ? (
                    <div className="flex flex-col items-start gap-1">
                      {f.vencimiento && <span>{f.vencimiento.toLocaleDateString("es-PY", { timeZone: "UTC" })}</span>}
                      <PastillaVencimiento dias={f.diasParaVencer} />
                    </div>
                  ) : (
                    "—"
                  )}
                </Td>
                <Td className="cifra">{formatearGuarani(f.total)}</Td>
                <Td className="cifra">{formatearGuarani(f.cobrado)}</Td>
                <Td className={`cifra font-semibold ${f.saldo > 0 ? "text-tinta" : ""}`}>{formatearGuarani(f.saldo)}</Td>
                <Td>
                  <Pastilla color={COLOR_ESTADO[f.estado]}>{ETIQUETA_ESTADO[f.estado]}</Pastilla>
                </Td>
                <Td>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <BotonEnlace href={`/admin/pos/venta/${f.ventaId}#cobros`} tono="navegar" tam="sm">
                      Ver
                    </BotonEnlace>
                    {f.saldo > 0 && (
                      <RegistrarCobroBoton
                        ventaId={f.ventaId}
                        saldo={f.saldo}
                        descripcion={`Venta ${formatearNumero(f.numero)} — ${f.cliente}`}
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
