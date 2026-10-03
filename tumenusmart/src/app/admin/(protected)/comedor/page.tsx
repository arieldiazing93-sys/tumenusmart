import { pantallaConPermiso } from "@/lib/auth";
import { puede } from "@/lib/permisos";
import { idLocalActual } from "@/lib/local-actual";
import { prismaDelLocal } from "@/lib/prisma-local";
import { formatearGuarani, formatearNumero } from "@/lib/format";
import { SEGUNDOS_LATIDO_IMPRESION, totalDeLineas } from "@/lib/comedor";
import { BotonEnlace, Cabecera, Pastilla, Vacio } from "@/components/ui";
import { RefrescarCada } from "@/components/RefrescarCada";

export const dynamic = "force-dynamic";

/** "hace 5 min", "hace 1 h 20 min". */
function hace(desde: Date): string {
  const minutos = Math.max(0, Math.round((Date.now() - desde.getTime()) / 60000));
  if (minutos < 1) return "recién";
  if (minutos < 60) return `hace ${minutos} min`;
  const h = Math.floor(minutos / 60);
  const m = minutos % 60;
  return m === 0 ? `hace ${h} h` : `hace ${h} h ${m} min`;
}

/**
 * Servicio comedor: las cuentas abiertas de las mesas, con lo que cargaron los mozos. Se actualiza solo. Por ahora es para
 * ver; anular productos, dar descuentos, cambiar de mozo y cobrar se suman en la próxima etapa.
 */
export default async function ComedorPage() {
  const sesion = await pantallaConPermiso("comedor.ver");
  const db = prismaDelLocal(await idLocalActual());

  const desdeLatido = new Date(Date.now() - SEGUNDOS_LATIDO_IMPRESION * 1000);
  const [cuentas, enEspera, imprimiendo] = await Promise.all([
    db.cuentaMesa.findMany({
      where: { estado: "abierta" },
      orderBy: { abiertaEn: "asc" },
      select: {
        id: true,
        numero: true,
        mesa: true,
        abiertaEn: true,
        mozo: { select: { nombre: true, apellido: true } },
        items: { where: { estado: "activo" }, select: { cantidad: true, precioUnitario: true, ronda: true } },
      },
    }),
    db.trabajoImpresion.count({ where: { estado: { in: ["pendiente", "imprimiendo"] } } }),
    db.estacion.findFirst({ where: { impresionVistaEn: { gte: desdeLatido } }, select: { id: true } }),
  ]);

  const filas = cuentas.map((c) => ({
    id: c.id,
    numero: c.numero,
    mesa: c.mesa,
    mozo: [c.mozo.nombre, c.mozo.apellido].filter(Boolean).join(" "),
    abiertaEn: c.abiertaEn,
    productos: c.items.reduce((s, i) => s + i.cantidad, 0),
    rondas: new Set(c.items.map((i) => i.ronda)).size,
    total: totalDeLineas(c.items.map((i) => ({ precioUnitario: Number(i.precioUnitario), cantidad: i.cantidad }))),
  }));
  const totalAbierto = filas.reduce((s, f) => s + f.total, 0);

  return (
    <div className="flex flex-col gap-4">
      <RefrescarCada segundos={15} />
      <Cabecera
        titulo="Servicio comedor"
        bajada="Las mesas abiertas y lo que cargaron los mozos. Se actualiza solo."
        acciones={
          <>
            {puede(sesion.rol, "comedor.gestionar") && (
              <BotonEnlace href="/admin/impresion" tono="navegar" tam="md">
                Impresión automática
              </BotonEnlace>
            )}
            {puede(sesion.rol, "comedor.configurar") && (
              <BotonEnlace href="/admin/comedor/mozos" tono="navegar" tam="md">
                Mozos y enlace
              </BotonEnlace>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        {imprimiendo ? (
          <Pastilla color="exito" punto>
            Impresión conectada
          </Pastilla>
        ) : (
          <Pastilla color="amarillo" punto>
            Nadie está imprimiendo
          </Pastilla>
        )}
        {enEspera > 0 && (
          <Pastilla color="amarillo">
            {enEspera} {enEspera === 1 ? "comanda en espera" : "comandas en espera"}
          </Pastilla>
        )}
        <span className="text-[0.82rem] text-tinta-media">
          {filas.length} {filas.length === 1 ? "mesa abierta" : "mesas abiertas"} · {formatearGuarani(totalAbierto)} en cuentas
        </span>
      </div>

      {filas.length === 0 ? (
        <Vacio
          titulo="No hay mesas abiertas"
          detalle="Cuando un mozo abra una mesa y envíe un pedido, la cuenta aparece acá."
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filas.map((f) => (
            <li key={f.id} className="flex flex-col gap-2 rounded-xl border-2 border-azul/50 bg-superficie p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[1.2rem] font-semibold tracking-titular text-tinta">Mesa {f.mesa}</p>
                  <p className="text-[0.8rem] text-tinta-media">
                    Cuenta {formatearNumero(f.numero)} · {f.mozo} · {hace(f.abiertaEn)}
                  </p>
                </div>
                <p className="cifra flex-none text-[1.05rem] font-bold text-tinta">{formatearGuarani(f.total)}</p>
              </div>
              <p className="text-[0.8rem] text-tinta-suave">
                {f.productos} {f.productos === 1 ? "producto" : "productos"} · {f.rondas}{" "}
                {f.rondas === 1 ? "pedido" : "pedidos"}
              </p>
              <div>
                <BotonEnlace href={`/admin/comedor/${f.id}`} tono="navegar" tam="sm">
                  Ver cuenta
                </BotonEnlace>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
