import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sesionActual } from "@/lib/auth";
import { cerrarSesion } from "./logout/actions";
import { idLocalActual, listarLocales } from "@/lib/local-actual";
import { ideaDeLaSemana } from "@/lib/idea-semanal";
import { SelectorLocal } from "./SelectorLocal";
import { COOKIE_MENU, NavPanel, type GrupoSecciones } from "@/components/NavPanel";

/**
 * Las secciones, agrupadas por lo que se hace con ellas.
 *
 * El agrupado no es decorativo: "Día a día" es lo que se toca con la cocina
 * llena, y va arriba de todo. Ajustes son cosas que se configuran una vez.
 */
function armarGrupos(hayIdeaSinVer: boolean, esSuper: boolean): GrupoSecciones[] {
  const grupos: GrupoSecciones[] = [
    {
      titulo: "Día a día",
      secciones: [
        { href: "/admin/pedidos", label: "Pedidos", icono: "pedidos" },
        { href: "/admin/reservas", label: "Reservas", icono: "reservas" },
      ],
    },
    {
      titulo: "Mi carta",
      secciones: [
        { href: "/admin/productos", label: "Productos", icono: "productos" },
        { href: "/admin/categorias", label: "Categorías", icono: "categorias" },
      ],
    },
    {
      titulo: "Cómo va el negocio",
      secciones: [
        { href: "/admin/estadisticas", label: "Estadísticas", icono: "estadisticas" },
        { href: "/admin/analista", label: "Ideas", aviso: hayIdeaSinVer, icono: "ideas" },
      ],
    },
    {
      titulo: "Ajustes",
      secciones: [
        { href: "/admin/configuracion", label: "Configuración", icono: "configuracion" },
        { href: "/admin/repartidores", label: "Repartidores", icono: "repartidores" },
        { href: "/admin/mi-cuenta", label: "Mi cuenta", icono: "cuenta" },
      ],
    },
  ];

  if (esSuper) {
    grupos.push({
      titulo: "Administración",
      secciones: [
        { href: "/admin/super", label: "Cartera", icono: "cartera" },
        { href: "/admin/usuarios", label: "Usuarios", icono: "usuarios" },
      ],
    });
  }
  return grupos;
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const sesion = await sesionActual();
  // El middleware ya redirige si no hay cookie; esto cubre la cookie presente
  // pero inválida: firma manipulada, usuario borrado o usuario desactivado.
  if (!sesion) redirect("/admin/login");

  const esSuper = sesion.rol === "superadmin";

  // El selector solo tiene sentido para el superadmin. Para los demás el local
  // sale de su usuario, así que la lista trae uno solo y el selector no aparece.
  const locales = esSuper ? await listarLocales() : [];

  let localActualId = "";
  try {
    localActualId = await idLocalActual();
  } catch {
    // Sin locales cargados todavía: se deja pasar para que Configuración
    // pueda crear el primero.
    localActualId = "";
  }

  // Aviso de idea nueva: un punto al lado de "Ideas" hasta que el dueño entre
  // a leerla. Es la única notificación del panel, así que se gana el lugar.
  let hayIdeaSinVer = false;
  if (localActualId) {
    try {
      const idea = await ideaDeLaSemana(localActualId);
      hayIdeaSinVer = idea != null && !idea.vista;
    } catch {
      hayIdeaSinVer = false;
    }
  }

  // La preferencia de menú plegado se lee acá, en el servidor, para que la
  // primera pintada ya salga con el ancho correcto. Si se leyera en el
  // navegador, el menú aparecería ancho y se achicaría a la vista.
  const menuPlegado = (await cookies()).get(COOKIE_MENU)?.value === "1";

  const nombreVisible = sesion.nombre?.trim() || sesion.email;
  const iniciales = nombreVisible.slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen bg-papel-suave">
      {/* ---------- barra de arriba ---------- */}
      <header className="sticky top-0 z-40 border-b border-linea bg-papel/90 backdrop-blur print:hidden">
        <div className="mx-auto flex h-14 max-w-[92rem] items-center gap-3 px-4">
          <NavPanel variante="boton" grupos={armarGrupos(hayIdeaSinVer, esSuper)} />

          <Link
            href="/admin/pedidos"
            className="flex-none text-[0.95rem] font-semibold tracking-titular text-tinta"
          >
            TuMenuSmart
          </Link>

          <div className="ml-auto flex min-w-0 items-center gap-2.5">
            {esSuper && <SelectorLocal locales={locales} actual={localActualId} />}

            {/* En pantalla chica el nombre entero no entra; quedan las
                iniciales, que igual sirven para saber con qué cuenta se entró. */}
            <span
              title={nombreVisible}
              className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-brand-light text-[0.72rem] font-semibold text-brand-texto sm:hidden"
            >
              {iniciales}
            </span>
            <span className="hidden max-w-[14rem] truncate text-[0.82rem] text-tinta-media sm:block">
              {nombreVisible}
            </span>

            <form action={cerrarSesion} className="flex-none">
              <button
                type="submit"
                className="rounded-lg px-2.5 py-1.5 text-[0.82rem] font-medium text-tinta-suave transition-colors hover:bg-peligro-luz hover:text-peligro"
              >
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>

      {sesion.debeCambiarPassword && (
        <div className="border-b border-aviso/25 bg-aviso-luz print:hidden">
          <div className="mx-auto flex max-w-[92rem] flex-wrap items-center justify-between gap-2 px-4 py-2.5">
            <p className="text-[0.85rem] text-tinta-media">
              <strong className="font-semibold text-aviso">Cambiá tu contraseña.</strong> Todavía
              estás usando la que te entregaron, y esa la vio más de una persona.
            </p>
            <Link
              href="/admin/mi-cuenta"
              className="flex-none rounded-lg bg-aviso px-3 py-1.5 text-[0.82rem] font-semibold text-white transition-colors hover:opacity-90"
            >
              Cambiarla ahora
            </Link>
          </div>
        </div>
      )}

      <div className="mx-auto flex max-w-[92rem] gap-4 px-4 lg:gap-6 print:max-w-none print:block print:p-0">
        <aside className="print:hidden">
          <NavPanel
            variante="columna"
            plegadaInicial={menuPlegado}
            grupos={armarGrupos(hayIdeaSinVer, esSuper)}
          />
        </aside>

        {/* La entrada es corta (0.18s) a propósito: marca el cambio de sección
            sin hacer esperar a nadie. */}
        <main
          key={sesion.email}
          className="min-w-0 flex-1 animate-panel py-5 print:animate-none print:py-0"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
