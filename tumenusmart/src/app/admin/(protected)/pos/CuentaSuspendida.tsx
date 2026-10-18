import { BotonEnlace, Tarjeta } from "@/components/ui";

/**
 * Se muestra en lugar de la pantalla de venta (y de abrir turno) cuando la cuenta del local está SUSPENDIDA a mano: no se pueden
 * registrar ventas, pero sí ver los reportes y cerrar el turno de caja que haya quedado abierto (ver src/lib/suspension.ts).
 */
export function CuentaSuspendida({ hayTurnoAbierto }: { hayTurnoAbierto: boolean }) {
  return (
    <div className="mx-auto max-w-md">
      <Tarjeta className="text-center shadow-sm !border-2 !border-azul/50">
        <span aria-hidden="true" className="mb-3 block text-4xl">
          ⏸️
        </span>
        <h1 className="text-[1.15rem] font-semibold tracking-titular text-tinta">La cuenta está suspendida</h1>
        <p className="mt-2 text-[0.88rem] text-tinta-media">
          Por ahora no se pueden registrar ventas. Seguís pudiendo ver tus reportes
          {hayTurnoAbierto ? " y cerrar el turno de caja que quedó abierto" : ""}. Comunicate con TuMenuSmart para reactivarla.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {hayTurnoAbierto && (
            <BotonEnlace href="/admin/pos/cerrar" tono="principal" tam="md">
              Cerrar turno
            </BotonEnlace>
          )}
          <BotonEnlace href="/admin/pos/cuentas" tono="navegar" tam="md">
            Historial de cuentas
          </BotonEnlace>
          <BotonEnlace href="/admin/pos/turnos" tono="navegar" tam="md">
            Cierres de turno
          </BotonEnlace>
          <BotonEnlace href="/admin/estadisticas" tono="navegar" tam="md">
            Estadísticas
          </BotonEnlace>
        </div>
      </Tarjeta>
    </div>
  );
}