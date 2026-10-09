import { pantallaConPermiso } from "@/lib/auth";
import { idLocalActual } from "@/lib/local-actual";
import { Aviso, BotonEnlace, Cabecera, Pastilla, Tabla, Td, Th, Tarjeta, Tr, Vacio, clasesBoton } from "@/components/ui";
import { formatearGuarani } from "@/lib/format";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { cdcParaMostrar } from "@/lib/sifen/cdc";
import { estadoFacturacionElectronica, listarDocumentos } from "@/lib/sifen/servidor";
import { CertificadoForm } from "./CertificadoForm";
import { ConfiguracionForm } from "./ConfiguracionForm";

export const dynamic = "force-dynamic";

const fecha = (d: Date) => d.toLocaleDateString("es-PY", { timeZone: ZONA_NEGOCIO, day: "2-digit", month: "2-digit", year: "numeric" });
const fechaHora = (d: Date) =>
  d.toLocaleString("es-PY", { timeZone: ZONA_NEGOCIO, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

const ETIQUETA_ESTADO: Record<string, string> = {
  firmado: "Firmado",
  enviado: "Enviado",
  aprobado: "Aprobado",
  aprobado_con_observacion: "Aprobado con observación",
  rechazado: "Rechazado",
  cancelado: "Cancelado",
  inutilizado: "Inutilizado",
};

function Punto({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-[0.86rem]">
      <span aria-hidden="true" className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full text-[0.72rem] font-bold ${ok ? "bg-exito-luz text-exito" : "bg-papel-hundido text-tinta-suave"}`}>
        {ok ? "✓" : "•"}
      </span>
      <span className={ok ? "text-tinta" : "text-tinta-media"}>{children}</span>
    </li>
  );
}

export default async function FacturacionElectronicaPage() {
  await pantallaConPermiso("facturacion.configurar");
  const storeId = await idLocalActual();
  const [estado, documentos] = await Promise.all([estadoFacturacionElectronica(storeId), listarDocumentos(storeId, 20)]);
  const c = estado.certificado;
  const listo = estado.falta.length === 0;

  return (
    <div>
      <Cabecera
        titulo="Facturación electrónica"
        bajada="La factura electrónica (SIFEN) se firma dentro del propio sistema. Acá se carga el certificado digital del negocio y el código de seguridad que entrega la DNIT, y se ven los documentos firmados."
        acciones={
          <BotonEnlace href="/admin/pos/puntos-expedicion" tono="navegar" tam="md">
            Datos del emisor
          </BotonEnlace>
        }
      />

      <div className="flex flex-col gap-4">
        <Tarjeta className="!border-2 !border-azul/50">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[1rem] font-semibold tracking-titular text-tinta">Estado</h2>
            <Pastilla color={listo ? "exito" : "amarillo"} punto>
              {listo ? "Listo para firmar" : `Falta${estado.falta.length === 1 ? "" : "n"} ${estado.falta.length}`}
            </Pastilla>
          </div>
          <ul className="mt-3 flex flex-col gap-2">
            <Punto ok={estado.boveda}>
              La clave que protege los certificados está configurada en el servidor
              {!estado.boveda && " (variable CERTIFICADOS_CLAVE: sin ella no se puede guardar ni usar un certificado)"}
            </Punto>
            <Punto ok={estado.emisorFaltantes.length === 0}>
              Datos del emisor completos
              {estado.emisorFaltantes.length > 0 && ` (faltan: ${estado.emisorFaltantes.join(", ")})`}
            </Punto>
            <Punto ok={Boolean(c) && !c?.vencido}>
              Certificado digital {c ? (c.vencido ? "vencido" : "vigente") : "sin cargar"}
            </Punto>
            <Punto ok={estado.tieneCsc}>Código de seguridad del contribuyente (CSC) {estado.tieneCsc ? "cargado" : "sin cargar"}</Punto>
          </ul>
          <p className="mt-3 text-[0.78rem] text-tinta-suave">
            Ambiente actual: <strong className="text-tinta">{estado.ambiente === "produccion" ? "Producción" : "Pruebas"}</strong>. Todavía no se envía nada a
            la DNIT: por ahora el sistema arma, firma y guarda el documento, y se puede ver su comprobante impreso (KuDE).
          </p>
        </Tarjeta>

        {!estado.boveda && (
          <Aviso color="aviso" titulo="Falta configurar la clave de la bóveda">
            Quien administra el servidor tiene que crear la variable de entorno <code className="rounded bg-papel-hundido px-1">CERTIFICADOS_CLAVE</code> (32 bytes al
            azar en base64) y volver a desplegar. Guardala también en un lugar seguro fuera del servidor: si se pierde, hay que volver a cargar los certificados.
          </Aviso>
        )}

        <Tarjeta className="!border-2 !border-azul/50">
          <h2 className="text-[1rem] font-semibold tracking-titular text-tinta">Certificado digital</h2>
          <p className="mt-0.5 text-[0.84rem] leading-snug text-tinta-media">
            Lo emite un prestador de servicios de certificación habilitado (con el RUC del contribuyente). La clave del certificado queda cifrada en el servidor y
            nunca se vuelve a mostrar.
          </p>

          {c ? (
            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1.5 text-[0.84rem] sm:grid-cols-2">
              <div>
                <dt className="text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave">Titular</dt>
                <dd className="text-tinta">{c.sujeto}</dd>
              </div>
              <div>
                <dt className="text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave">RUC del certificado</dt>
                <dd className="text-tinta">{c.ruc ? `${c.ruc}${c.dv ? `-${c.dv}` : ""}` : "No figura"}</dd>
              </div>
              <div>
                <dt className="text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave">Emitido por</dt>
                <dd className="text-tinta">{c.emisor}</dd>
              </div>
              <div>
                <dt className="text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave">Vigencia</dt>
                <dd className={c.vencido ? "font-semibold text-peligro" : c.diasParaVencer <= 30 ? "font-semibold text-aviso" : "text-tinta"}>
                  {fecha(c.validoDesde)} al {fecha(c.validoHasta)}
                  {c.vencido ? " · vencido" : ` · quedan ${c.diasParaVencer} días`}
                </dd>
              </div>
              <div>
                <dt className="text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave">Huella (SHA-256)</dt>
                <dd className="break-all font-mono text-[0.74rem] text-tinta">{c.huellaSha256}</dd>
              </div>
              <div>
                <dt className="text-[0.72rem] font-semibold uppercase tracking-rotulo text-tinta-suave">Cargado</dt>
                <dd className="text-tinta">
                  {fechaHora(c.createdAt)} por {c.subidoPor}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-3 rounded-lg bg-papel-suave px-3 py-2 text-[0.84rem] text-tinta-media">Todavía no hay un certificado cargado.</p>
          )}

          {c && c.avisos.length > 0 && (
            <div className="mt-3 rounded-lg border border-aviso/30 bg-aviso-luz px-3 py-2 text-[0.82rem] text-tinta-media">
              <p className="font-medium text-tinta">A tener en cuenta:</p>
              <ul className="mt-1 list-disc pl-5">
                {c.avisos.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-4 border-t border-linea-fina pt-4">
            <CertificadoForm hayCertificado={Boolean(c)} />
          </div>
        </Tarjeta>

        <Tarjeta className="!border-2 !border-azul/50">
          <h2 className="text-[1rem] font-semibold tracking-titular text-tinta">Ambiente y código de seguridad</h2>
          <p className="mt-0.5 mb-3 text-[0.84rem] leading-snug text-tinta-media">
            El código de seguridad (CSC) lo entrega la DNIT al habilitarte como facturador electrónico; en el ambiente de pruebas son los de prueba que da la propia
            DNIT. Firma el código QR de cada comprobante.
          </p>
          <ConfiguracionForm ambiente={estado.ambiente} idCsc={estado.idCsc} tieneCsc={estado.tieneCsc} />
        </Tarjeta>

        <Tarjeta className="!border-2 !border-azul/50" padding={false}>
          <div className="p-4 pb-3">
            <h2 className="text-[1rem] font-semibold tracking-titular text-tinta">Documentos firmados</h2>
            <p className="mt-0.5 text-[0.84rem] leading-snug text-tinta-media">
              Los últimos 20. Para firmar uno, abrí la factura en <strong>Facturas</strong> y usá «Ver datos para factura electrónica».
            </p>
          </div>
          {documentos.length === 0 ? (
            <div className="px-4 pb-4">
              <Vacio titulo="Todavía no se firmó ningún documento" detalle="Cuando firmes una factura, aparece acá con su XML y su comprobante impreso." />
            </div>
          ) : (
            <Tabla className="!rounded-none !border-0 !border-t">
              <thead>
                <tr>
                  <Th>Firmado</Th>
                  <Th>Factura</Th>
                  <Th>CDC</Th>
                  <Th className="text-right">Total</Th>
                  <Th>Estado</Th>
                  <Th>Ver</Th>
                </tr>
              </thead>
              <tbody>
                {documentos.map((d) => (
                  <Tr key={d.id}>
                    <Td>{fechaHora(d.firmadoEn)}</Td>
                    <Td>{d.numero}</Td>
                    <Td className="font-mono text-[0.72rem]">{cdcParaMostrar(d.cdc)}</Td>
                    <Td className="text-right tabular-nums">{formatearGuarani(d.total)}</Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        <Pastilla color={d.estado === "rechazado" ? "peligro" : d.estado === "firmado" ? "azul" : "exito"}>{ETIQUETA_ESTADO[d.estado] ?? d.estado}</Pastilla>
                        {d.vistaPrevia && <Pastilla color="amarillo">Vista previa</Pastilla>}
                        {d.ambiente === "pruebas" && <Pastilla color="neutro">Pruebas</Pastilla>}
                      </div>
                    </Td>
                    <Td>
                      <div className="flex flex-wrap gap-1.5">
                        <a href={`/admin/facturacion-electronica/xml/${d.id}`} className={clasesBoton("navegar", "sm")}>
                          XML
                        </a>
                        <a href={`/admin/facturacion-electronica/kude/${d.id}?formato=cinta`} target="_blank" rel="noopener" className={clasesBoton("navegar", "sm")}>
                          KuDE ticket
                        </a>
                        <a href={`/admin/facturacion-electronica/kude/${d.id}?formato=carta`} target="_blank" rel="noopener" className={clasesBoton("navegar", "sm")}>
                          KuDE A4
                        </a>
                      </div>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Tabla>
          )}
        </Tarjeta>
      </div>
    </div>
  );
}
