import { prisma } from "@/lib/prisma";
import { pantallaConPermiso } from "@/lib/auth";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { Cabecera, Cifra, Vacio } from "@/components/ui";
import { HORAS_ENTRE_AVISOS } from "@/lib/errores";
import { FilaError } from "./FilaError";

export const dynamic = "force-dynamic";

function cuando(fecha: Date): string {
  return fecha.toLocaleString("es-PY", {
    timeZone: ZONA_NEGOCIO,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function ErroresPage() {
  await pantallaConPermiso("cartera.gestionar");

  const hace24h = new Date(Date.now() - 24 * 3_600_000);

  const [sinResolver, resueltos, ultimasHoras] = await Promise.all([
    prisma.errorReportado.findMany({
      where: { resuelto: false },
      orderBy: { ultimaVez: "desc" },
      take: 50,
    }),
    prisma.errorReportado.count({ where: { resuelto: true } }),
    prisma.errorReportado.count({ where: { ultimaVez: { gte: hace24h } } }),
  ]);

  const avisoConfigurado = Boolean(
    process.env.RESEND_API_KEY && process.env.AVISOS_EMAIL_DESTINO
  );

  return (
    <div>
      <Cabecera
        titulo="Errores"
        bajada={`Un renglón por problema, no por vez que falló. El mismo error no vuelve a avisarte por correo durante ${HORAS_ENTRE_AVISOS} horas.`}
      />

      {!avisoConfigurado && (
        <div className="mb-5 rounded-xl border border-aviso/25 bg-aviso-luz p-4">
          <p className="text-[0.9rem] font-semibold text-aviso">
            Los errores se están guardando, pero no te avisan por correo
          </p>
          <p className="mt-1 text-[0.85rem] leading-relaxed text-tinta-media">
            Faltan las variables <strong>RESEND_API_KEY</strong> y{" "}
            <strong>AVISOS_EMAIL_DESTINO</strong> en Vercel. Hasta que estén, esta pantalla
            funciona pero hay que venir a mirarla — que es justo lo que queríamos evitar.
          </p>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Cifra rotulo="Sin resolver" valor={String(sinResolver.length)} />
        <Cifra rotulo="En las últimas 24 h" valor={String(ultimasHoras)} />
        <Cifra rotulo="Resueltos" valor={String(resueltos)} />
      </div>

      {sinResolver.length === 0 ? (
        <Vacio
          titulo="Ningún problema sin resolver"
          detalle="Cuando algo falle en producción va a aparecer acá, y te va a llegar un correo sin que tengas que entrar."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {sinResolver.map((e) => (
            <FilaError
              key={e.id}
              id={e.id}
              mensaje={e.mensaje}
              ruta={e.ruta}
              local={e.nombreLocal}
              usuario={e.usuario}
              detalle={e.detalle}
              ocurrencias={e.ocurrencias}
              primeraVez={cuando(e.primeraVez)}
              ultimaVez={cuando(e.ultimaVez)}
              avisado={e.avisadoEn !== null}
            />
          ))}
        </div>
      )}
    </div>
  );
}
