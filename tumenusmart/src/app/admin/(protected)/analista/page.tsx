import Link from "next/link";
import { prismaDelLocal } from "@/lib/prisma-local";
import { idLocalActual } from "@/lib/local-actual";
import { ZONA_NEGOCIO } from "@/lib/timezone";
import { ideaDeLaSemana, marcarIdeaVista } from "@/lib/idea-semanal";
import {
  analizar,
  type Confianza,
  type Idea,
  type PedidoAnalisis,
  type ProductoAnalisis,
} from "@/lib/analista";

export const dynamic = "force-dynamic";

/** Ventana de análisis. Suficiente para ver estacionalidad sin traer años de historia. */
const DIAS_DE_HISTORIA = 180;
const TOPE_PEDIDOS = 3000;

const ESTILO_TIPO: Record<Idea["tipo"], { borde: string; chip: string; etiqueta: string }> = {
  oportunidad: {
    borde: "border-l-brand",
    chip: "bg-orange-100 text-orange-800",
    etiqueta: "Oportunidad",
  },
  alerta: {
    borde: "border-l-peligro",
    chip: "bg-peligro-luz text-peligro",
    etiqueta: "Atención",
  },
  dato: {
    borde: "border-l-linea",
    chip: "bg-papel-hundido text-tinta-media",
    etiqueta: "Para saber",
  },
};

const TEXTO_CONFIANZA: Record<Confianza, string> = {
  alta: "Con bastantes datos detrás",
  media: "Con datos suficientes, pero pocos",
  baja: "Con pocos datos: tomalo como pista",
};

/** Las alertas primero: cuidar lo que ya tenés rinde más que buscar algo nuevo. */
const ORDEN_TIPO: Record<Idea["tipo"], number> = { alerta: 0, oportunidad: 1, dato: 2 };

export default async function AnalistaPage() {
  const storeId = await idLocalActual();
  const prisma = prismaDelLocal(storeId);

  const desde = new Date(Date.now() - DIAS_DE_HISTORIA * 24 * 60 * 60 * 1000);

  const [pedidosCrudos, productosCrudos] = await Promise.all([
    prisma.order.findMany({
      where: { createdAt: { gte: desde } },
      include: { items: true },
      orderBy: { createdAt: "desc" },
      take: TOPE_PEDIDOS,
    }),
    prisma.product.findMany({ include: { category: true } }),
  ]);

  const pedidos: PedidoAnalisis[] = pedidosCrudos.map((p) => ({
    id: p.id,
    creado: p.createdAt,
    estado: p.estado,
    enviado: p.enviadoWhatsapp,
    tipoEntrega: p.tipoEntrega,
    total: Number(p.total),
    costoEnvio: Number(p.costoEnvio),
    clienteNombre: p.clienteNombre,
    clienteTelefono: p.clienteTelefono,
    items: p.items.map((i) => ({
      productId: i.productId,
      nombre: i.nombreProducto,
      cantidad: i.cantidad,
      precioUnitario: Number(i.precioUnitario),
    })),
  }));

  const productos: ProductoAnalisis[] = productosCrudos.map((pr) => ({
    id: pr.id,
    nombre: pr.nombre,
    categoriaId: pr.categoryId,
    categoriaNombre: pr.category.nombre,
    precio: Number(pr.precio),
    costo: pr.costo != null ? Number(pr.costo) : null,
    disponible: pr.disponible,
    creado: pr.createdAt,
  }));

  const resultado = analizar({
    pedidos,
    productos,
    ahora: new Date(),
    zona: ZONA_NEGOCIO,
  });

  const ideas = [...resultado.ideas].sort(
    (a, b) => ORDEN_TIPO[a.tipo] - ORDEN_TIPO[b.tipo]
  );

  const sinCosto = productos.filter((p) => p.costo == null).length;

  // Entrar acá cuenta como haberla leído: se apaga el aviso del menú. La
  // escritura solo ocurre si estaba sin ver, así que volver a entrar no hace
  // nada.
  const deLaSemana = await ideaDeLaSemana(storeId).catch(() => null);
  if (deLaSemana && !deLaSemana.vista) {
    await marcarIdeaVista(storeId, deLaSemana.id).catch(() => {});
  }

  return (
    <div>
      <h1 className="mb-1 text-[1.4rem] font-semibold tracking-titular text-tinta">Ideas para vender más</h1>
      <p className="mb-6 text-sm text-tinta-media">
        Sale de tus propios pedidos de los últimos {DIAS_DE_HISTORIA} días. Se actualiza solo.
      </p>

      {deLaSemana && (
        <section className="mb-6 rounded-lg border-2 border-brand/40 bg-orange-50/50 p-4">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-medium text-white">
              Tu idea de esta semana
            </span>
            <span className="text-xs text-tinta-media">
              Elegida el lunes · una por semana para que puedas trabajarla
            </span>
          </div>
          <h2 className="font-semibold text-tinta">{deLaSemana.titulo}</h2>
          <p className="mt-0.5 text-sm font-medium text-tinta">{deLaSemana.dato}</p>
          <p className="mt-1.5 text-sm text-tinta-media">{deLaSemana.accion}</p>

          {deLaSemana.detalle && deLaSemana.detalle.length > 0 && (
            <ul className="mt-3 divide-y divide-orange-100 rounded-lg bg-white/70 px-3">
              {deLaSemana.detalle.map((d, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                  <span className="truncate text-tinta-media">{d.etiqueta}</span>
                  <span className="whitespace-nowrap font-medium text-tinta-media">{d.valor}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {resultado.faltaData ? (
        <FaltanDatos
          actuales={resultado.faltaData.pedidosActuales}
          necesarios={resultado.faltaData.pedidosNecesarios}
        />
      ) : (
        <>
          <p className="mb-4 text-sm text-tinta-media">
            Analizados <strong>{resultado.base} pedidos</strong>.{" "}
            {ideas.length === 1
              ? "Por ahora hay una sola conclusión sólida."
              : deLaSemana
                ? `Estas son las ${ideas.length} conclusiones completas, por si querés ir más a fondo.`
                : `Encontré ${ideas.length} cosas para contarte.`}
          </p>

          <div className="flex flex-col gap-3">
            {ideas.map((idea) => (
              <TarjetaIdea key={idea.clave} idea={idea} />
            ))}
          </div>
        </>
      )}

      {sinCosto > 0 && (
        <div className="mt-8 rounded-lg border border-dashed border-linea bg-white p-4">
          <h2 className="text-sm font-semibold text-tinta">
            Falta un dato para hablar de ganancia
          </h2>
          <p className="mt-1 text-sm text-tinta-media">
            {sinCosto} de tus {productos.length} productos no tienen cargado el costo. Sin eso
            puedo decirte qué producto <em>factura</em> más, pero no cuál te <em>deja</em> más
            — y muchas veces no son el mismo.
          </p>
          <Link
            href="/admin/productos"
            className="mt-2 inline-block text-sm font-medium text-brand hover:underline"
          >
            Cargar costos en Productos →
          </Link>
        </div>
      )}
    </div>
  );
}

function FaltanDatos({ actuales, necesarios }: { actuales: number; necesarios: number }) {
  const avance = Math.min(100, Math.round((actuales / necesarios) * 100));

  return (
    <div className="rounded-lg border border-linea bg-white p-6">
      <h2 className="text-base font-semibold text-tinta">
        Todavía no tengo suficientes pedidos
      </h2>
      <p className="mt-2 max-w-xl text-sm text-tinta-media">
        Llevás <strong>{actuales}</strong> {actuales === 1 ? "pedido" : "pedidos"} y hacen falta
        al menos <strong>{necesarios}</strong> para que lo que te diga signifique algo. Con menos
        que eso, cualquier patrón que encuentre sería casualidad, y prefiero no darte un consejo
        antes que darte uno inventado.
      </p>

      <div className="mt-4 max-w-sm">
        <div className="h-2 w-full overflow-hidden rounded-full bg-papel-hundido">
          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${avance}%` }} />
        </div>
        <p className="mt-1.5 text-xs text-tinta-media">
          {actuales} de {necesarios} pedidos
        </p>
      </div>

      <p className="mt-5 max-w-xl text-sm text-tinta-media">
        No tenés que hacer nada: se va llenando solo a medida que entren pedidos. Cuando llegue,
        esta pantalla se enciende sola.
      </p>

      <div className="mt-5 border-t border-linea-fina pt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-tinta-suave">
          Mientras tanto, lo que se va a analizar
        </p>
        <ul className="mt-2 grid gap-1.5 text-sm text-tinta-media sm:grid-cols-2">
          <li>· En qué horas y días vendés poco</li>
          <li>· Qué productos ocupan carta y no se venden</li>
          <li>· Qué se pide junto con qué, para armar combos</li>
          <li>· Clientes habituales que dejaron de pedir</li>
          <li>· Cuánta gente arma el pedido y no lo envía</li>
          <li>· Qué producto te deja más ganancia</li>
        </ul>
      </div>
    </div>
  );
}

function TarjetaIdea({ idea }: { idea: Idea }) {
  const estilo = ESTILO_TIPO[idea.tipo];

  return (
    <article
      className={`rounded-lg border border-linea border-l-4 bg-white p-4 ${estilo.borde}`}
    >
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${estilo.chip}`}>
          {estilo.etiqueta}
        </span>
        <h2 className="font-semibold text-tinta">{idea.titulo}</h2>
      </div>

      <p className="text-sm font-medium text-tinta">{idea.dato}</p>
      <p className="mt-1.5 text-sm text-tinta-media">{idea.accion}</p>

      {idea.detalle && idea.detalle.length > 0 && (
        <ul className="mt-3 divide-y divide-linea-fina rounded-lg bg-papel-suave px-3">
          {idea.detalle.map((d, i) => (
            <li key={i} className="flex items-center justify-between gap-3 py-1.5 text-sm">
              <span className="truncate text-tinta-media">{d.etiqueta}</span>
              <span className="whitespace-nowrap font-medium text-tinta-media">{d.valor}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-2.5 text-xs text-tinta-suave">{TEXTO_CONFIANZA[idea.confianza]}</p>
    </article>
  );
}
