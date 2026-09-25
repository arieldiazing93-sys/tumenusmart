"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { clasesBoton } from "@/components/ui";
import { sanearDatosPagina, type DatosPagina } from "@/lib/pagina-reservas";
import { guardarPaginaReservas } from "./actions";
import { PerfilPagina } from "./PerfilPagina";
import { SeccionApariencia } from "./SeccionApariencia";
import { SeccionCampos } from "./SeccionCampos";
import { SeccionEmpresa } from "./SeccionEmpresa";
import { SeccionGaleria } from "./SeccionGaleria";
import { SeccionRedes } from "./SeccionRedes";

type Seccion = "empresa" | "redes" | "galeria" | "apariencia" | "campos";

const SECCIONES: { valor: Seccion; etiqueta: string }[] = [
  { valor: "empresa", etiqueta: "Información de la empresa" },
  { valor: "redes", etiqueta: "Enlaces sociales" },
  { valor: "galeria", etiqueta: "Galería de la empresa" },
  { valor: "apariencia", etiqueta: "Personalización de apariencia" },
  { valor: "campos", etiqueta: "Campos del formulario de reserva" },
];

/**
 * El editor de la página pública de reservas: a la izquierda el perfil (foto,
 * habilitar, dirección y WhatsApp) y el menú de secciones; a la derecha la
 * sección elegida.
 *
 * Todo se edita junto y nada se guarda hasta apretar "Guardar cambios": en cuanto
 * se toca algo aparece abajo la barra con "Descartar" y "Guardar cambios", y si se
 * intenta salir con cambios sin guardar el navegador avisa. Es el mismo
 * criterio que el Horario de trabajo.
 *
 * En el celular el menú de secciones es una tira de botones que se desliza y el
 * perfil queda arriba de todo.
 */
export function EditorPagina({ inicial, yaGuardada }: { inicial: DatosPagina; yaGuardada: boolean }) {
  const router = useRouter();
  const [guardado, setGuardado] = useState(inicial);
  const [datos, setDatos] = useState(inicial);
  // La primera vez no hay nada en la base: la barra de guardar se muestra igual, para poder crearla.
  const [existe, setExiste] = useState(yaGuardada);
  const [seccion, setSeccion] = useState<Seccion>("empresa");
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [recienGuardado, setRecienGuardado] = useState(false);

  const hayCambios = JSON.stringify(datos) !== JSON.stringify(guardado);
  const mostrarBarra = hayCambios || !existe;
  // Las mismas reglas que aplica el servidor: así el error sale antes de mandar nada.
  const validacion = sanearDatosPagina(datos);
  const errorLocal = validacion.ok ? null : validacion.error;

  function cambiar(parche: Partial<DatosPagina>) {
    setDatos((actuales) => ({ ...actuales, ...parche }));
    setError(null);
    setRecienGuardado(false);
  }

  // Si se intenta cerrar o recargar con cambios sin guardar, el navegador pregunta.
  useEffect(() => {
    if (!hayCambios) return;
    const avisar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", avisar);
    return () => window.removeEventListener("beforeunload", avisar);
  }, [hayCambios]);

  useEffect(() => {
    if (!recienGuardado) return;
    const t = setTimeout(() => setRecienGuardado(false), 3500);
    return () => clearTimeout(t);
  }, [recienGuardado]);

  function guardar() {
    if (errorLocal) return;
    setError(null);
    iniciar(async () => {
      const resultado = await guardarPaginaReservas(datos);
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      // El servidor puede haber normalizado la dirección: se queda con la que guardó.
      const guardadoAhora = { ...datos, slug: resultado.slug };
      setDatos(guardadoAhora);
      setGuardado(guardadoAhora);
      setExiste(true);
      setRecienGuardado(true);
      router.refresh();
    });
  }

  const contenido = {
    empresa: <SeccionEmpresa datos={datos} cambiar={cambiar} />,
    redes: <SeccionRedes datos={datos} cambiar={cambiar} />,
    galeria: <SeccionGaleria datos={datos} cambiar={cambiar} />,
    apariencia: <SeccionApariencia datos={datos} cambiar={cambiar} />,
    campos: <SeccionCampos datos={datos} cambiar={cambiar} />,
  }[seccion];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-4 lg:grid-cols-[22rem_minmax(0,1fr)] lg:items-start">
        {/* ---------- izquierda: perfil y menú de secciones ---------- */}
        <div className="flex flex-col gap-3">
          <PerfilPagina datos={datos} cambiar={cambiar} />

          {/* Pantalla ancha: lista vertical. */}
          <nav aria-label="Secciones de la página" className="hidden rounded-xl border border-linea bg-superficie p-2 lg:block">
            <ul className="flex flex-col gap-0.5">
              {SECCIONES.map((s) => (
                <li key={s.valor}>
                  <button
                    type="button"
                    onClick={() => setSeccion(s.valor)}
                    aria-current={seccion === s.valor ? "page" : undefined}
                    className={`flex w-full items-center rounded-lg px-3 py-2.5 text-left text-[0.88rem] font-medium transition-colors ${
                      seccion === s.valor
                        ? "bg-brand-light text-brand-texto"
                        : "text-tinta-media hover:bg-papel-hundido hover:text-tinta"
                    }`}
                  >
                    {s.etiqueta}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        {/* ---------- derecha: la sección elegida ---------- */}
        <div className="flex min-w-0 flex-col gap-3">
          {/* Celular y tablet: una tira de botones que se desliza de costado. */}
          <nav aria-label="Secciones de la página" className="-mx-1 overflow-x-auto px-1 pb-1 lg:hidden">
            <ul className="flex gap-2">
              {SECCIONES.map((s) => (
                <li key={s.valor} className="flex-none">
                  <button
                    type="button"
                    onClick={() => setSeccion(s.valor)}
                    aria-current={seccion === s.valor ? "page" : undefined}
                    className={`whitespace-nowrap rounded-full border px-4 py-2.5 text-[0.85rem] font-semibold transition-colors ${
                      seccion === s.valor
                        ? "border-brand bg-brand-light text-brand-texto"
                        : "border-linea bg-superficie text-tinta hover:border-brand"
                    }`}
                  >
                    {s.etiqueta}
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <h2 className="hidden text-[1.15rem] font-semibold tracking-titular text-tinta lg:block">
            {SECCIONES.find((s) => s.valor === seccion)?.etiqueta}
          </h2>
          {contenido}
        </div>
      </div>

      {recienGuardado && !mostrarBarra && (
        <p className="text-[0.86rem] font-semibold text-exito" role="status">
          ✓ Página guardada.
        </p>
      )}

      {/* Aparece en cuanto se toca algo (o la primera vez, hasta crearla) y queda pegada abajo mientras se desliza. */}
      {mostrarBarra && (
        <div className="sticky bottom-3 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand/30 bg-superficie p-3 shadow-media">
          <p className={`min-w-0 flex-1 text-[0.86rem] font-medium ${error || errorLocal ? "text-peligro" : "text-tinta"}`} role="status">
            {error ?? errorLocal ?? (existe ? "Tenés cambios sin guardar." : "Todavía no guardaste tu página.")}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => {
                setDatos(guardado);
                setError(null);
              }}
              disabled={pendiente}
              className={clasesBoton("suave", "md")}
            >
              Descartar
            </button>
            <button
              type="button"
              onClick={guardar}
              disabled={pendiente || !!errorLocal}
              className={clasesBoton("principal", "md")}
            >
              {pendiente ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
