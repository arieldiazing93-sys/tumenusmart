import { Cabecera, Tarjeta } from "@/components/ui";

export const dynamic = "force-dynamic";

/**
 * Guías de configuración, no de uso del panel.
 *
 * Lo que va acá es lo que se configura UNA VEZ en una computadora — no cómo
 * se usa cada pantalla (eso tiene que entenderse solo, mirándola). El primer
 * caso es la impresión automática de tickets y comandas.
 */
export default function AyudaPage() {
  return (
    <div>
      <Cabecera
        titulo="Ayuda"
        bajada="Guías para configurar cosas que se hacen una sola vez, no para el día a día del panel."
      />

      <Tarjeta className="max-w-2xl">
        <h2 className="text-[1.05rem] font-semibold tracking-titular text-tinta">
          Impresión automática de tickets y comandas
        </h2>
        <p className="mt-1.5 text-[0.85rem] leading-relaxed text-tinta-media">
          Al imprimir una comanda o un ticket, Chrome muestra el diálogo normal de
          "Imprimir" — hay que elegir la impresora y confirmar cada vez. Esto lo
          salta: imprime directo a la impresora, sin ningún cartel.
        </p>
        <p className="mt-2 text-[0.82rem] font-medium text-aviso">
          Usalo en una computadora dedicada a imprimir, no en la que usás para todo:
          una vez activado, cualquier impresión desde esa ventana de Chrome sale
          directo, sin avisar.
        </p>

        <ol className="mt-5 flex flex-col gap-5">
          <li>
            <p className="font-semibold text-tinta">
              1. Configurar la impresora predeterminada en Windows
            </p>
            <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-[0.85rem] text-tinta-media">
              <li>
                Windows → Configuración → Bluetooth y dispositivos → Impresoras y
                escáneres.
              </li>
              <li>Elegí la impresora de tickets.</li>
              <li>Marcá "Establecer como predeterminada".</li>
            </ol>
          </li>

          <li>
            <p className="font-semibold text-tinta">2. Crear un acceso directo especial de Chrome</p>
            <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-[0.85rem] text-tinta-media">
              <li>Botón derecho en el Escritorio → Nuevo → Acceso directo.</li>
              <li>
                En "Ubicación del elemento", pegá esto (todo en una sola línea):
              </li>
            </ol>
            <pre className="cifra mt-2 overflow-x-auto rounded-lg border border-linea bg-papel-suave p-3 text-[0.78rem] leading-relaxed text-tinta">
{`"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --kiosk-printing --app=https://tumenusmart.com/admin/pedidos`}
            </pre>
            <ol start={3} className="mt-2 list-decimal space-y-1 pl-5 text-[0.85rem] text-tinta-media">
              <li>
                Si Chrome está instalado en otra carpeta, ajustá la ruta — la podés
                confirmar desde el acceso directo de Chrome que ya tengas (botón
                derecho → Propiedades → "Destino").
              </li>
              <li>Ponele un nombre, por ejemplo: "TuMenuSmart - Impresora".</li>
              <li>Aceptar.</li>
            </ol>
          </li>

          <li>
            <p className="font-semibold text-tinta">3. Usarlo</p>
            <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-[0.85rem] text-tinta-media">
              <li>Abrí ese acceso directo nuevo — no el ícono normal de Chrome.</li>
              <li>Iniciá sesión en el panel la primera vez; después queda logueado.</li>
              <li>
                Desde ahí, cada comanda o ticket que se imprima sale directo a la
                impresora, sin ningún cartel ni botón que apretar.
              </li>
            </ol>
          </li>
        </ol>

        <div className="mt-6 border-t border-linea pt-4 text-[0.8rem] leading-relaxed text-tinta-media">
          <p>
            <strong className="font-semibold text-tinta">Funciona en:</strong> Chrome y
            Edge (los dos son Chromium). No funciona en Firefox ni Safari.
          </p>
          <p className="mt-1.5">
            <strong className="font-semibold text-tinta">Si cambian de impresora:</strong> alcanza
            con repetir el paso 1 con la impresora nueva — el acceso directo no hay
            que tocarlo.
          </p>
          <p className="mt-1.5">
            <strong className="font-semibold text-tinta">Para volver a lo normal:</strong> no
            uses ese acceso directo — abrí Chrome como siempre y vas a ver el
            diálogo de impresión de nuevo.
          </p>
        </div>
      </Tarjeta>
    </div>
  );
}
