/**
 * Analista comercial: mira los pedidos de un local y saca conclusiones útiles.
 *
 * Este archivo es deliberadamente PURO — no toca la base de datos ni Next.js.
 * Recibe datos y devuelve ideas. Eso permite probarlo de verdad con casos
 * armados a mano, que es la única forma de confiar en algo que después le va a
 * decir a un negocio dónde poner su plata.
 *
 * La regla de oro de todo lo que hay acá: **callar cuando no alcanza**. Una
 * conclusión sacada de doce pedidos es ruido con forma de consejo, y el dueño
 * la va a tomar como si fuera cierta. Por eso cada idea declara cuántos datos
 * la respaldan, y las que no llegan al mínimo directamente no se emiten.
 */

// ---------------------------------------------------------------------------
//  Lo que entra
// ---------------------------------------------------------------------------

export type ItemAnalisis = {
  productId: string | null;
  nombre: string;
  cantidad: number;
  precioUnitario: number;
};

export type PedidoAnalisis = {
  id: string;
  creado: Date;
  estado: string;
  /** false = el cliente armó el pedido y nunca lo mandó por WhatsApp */
  enviado: boolean;
  tipoEntrega: string;
  total: number;
  costoEnvio: number;
  clienteNombre: string;
  clienteTelefono: string;
  items: ItemAnalisis[];
};

export type ProductoAnalisis = {
  id: string;
  nombre: string;
  categoriaId: string;
  categoriaNombre: string;
  precio: number;
  /** Nulo mientras el negocio no lo haya cargado. Sin esto no hay margen. */
  costo: number | null;
  disponible: boolean;
  creado: Date;
};

export type EntradaAnalisis = {
  pedidos: PedidoAnalisis[];
  productos: ProductoAnalisis[];
  /** Momento contra el que se miden las antigüedades. Se pasa para poder probar. */
  ahora: Date;
  /** Zona horaria del negocio, para agrupar por hora y por día. */
  zona: string;
};

// ---------------------------------------------------------------------------
//  Lo que sale
// ---------------------------------------------------------------------------

/** Cuánto respaldo tiene una conclusión. */
export type Confianza = "alta" | "media" | "baja";

export type Idea = {
  clave: string;
  /** "oportunidad" suma plata; "alerta" evita perderla; "dato" solo informa. */
  tipo: "oportunidad" | "alerta" | "dato";
  titulo: string;
  /** El número concreto que respalda la conclusión. Nunca va vacío. */
  dato: string;
  /** Qué hacer con esto. Concreto, no genérico. */
  accion: string;
  confianza: Confianza;
  /** Filas de apoyo: productos, clientes, franjas. */
  detalle?: { etiqueta: string; valor: string }[];
};

export type ResultadoAnalisis = {
  /** Cuántos pedidos enviados se usaron para el análisis. */
  base: number;
  /** Si todavía no alcanza, esto explica qué falta y no se emite ninguna idea. */
  faltaData: { pedidosActuales: number; pedidosNecesarios: number } | null;
  ideas: Idea[];
};

// ---------------------------------------------------------------------------
//  Umbrales
// ---------------------------------------------------------------------------
//  Los números de acá abajo son el corazón honesto del módulo. Están elegidos
//  para que una conclusión aparezca recién cuando tiene sentido estadístico,
//  no cuando queda lindo mostrar algo.

/** Debajo de esto no se dice absolutamente nada sobre patrones. */
export const MINIMO_PARA_OPINAR = 30;

/** Para hablar de franjas horarias o días hace falta bastante más. */
const MINIMO_PARA_FRANJAS = 60;
const MINIMO_PARA_FRANJAS_ALTA = 200;

/** Para afirmar que dos productos "van juntos". */
const MINIMO_PARA_COMBOS = 40;
const VECES_MINIMAS_PAR = 5;
const PROPORCION_MINIMA_PAR = 0.3;

/** Un producto se considera "dormido" recién si tuvo tiempo de venderse. */
const DIAS_MINIMOS_EN_CARTA = 30;

/** Un cliente "se fue" si era habitual y hace mucho que no aparece. */
const PEDIDOS_PARA_SER_HABITUAL = 2;
const DIAS_SIN_VOLVER = 45;

const MS_POR_DIA = 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
//  Utilidades
// ---------------------------------------------------------------------------

const NOMBRES_DIA = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
];

/** Hora del día (0-23) en la zona del negocio. */
export function horaLocal(fecha: Date, zona: string): number {
  const partes = new Intl.DateTimeFormat("es-PY", {
    timeZone: zona,
    hour: "2-digit",
    hour12: false,
  }).formatToParts(fecha);
  const hora = partes.find((p) => p.type === "hour")?.value ?? "0";
  // Algunas zonas devuelven "24" para la medianoche.
  return Number(hora) % 24;
}

/** Día de la semana (0 = domingo) en la zona del negocio. */
export function diaLocal(fecha: Date, zona: string): number {
  const texto = new Intl.DateTimeFormat("en-US", {
    timeZone: zona,
    weekday: "short",
  }).format(fecha);
  const mapa: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return mapa[texto] ?? 0;
}

function porcentaje(parte: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((parte / total) * 100);
}

function guaranies(n: number): string {
  return "Gs. " + Math.round(n).toLocaleString("es-PY");
}

function franjaTexto(hora: number): string {
  const fin = (hora + 1) % 24;
  return `${String(hora).padStart(2, "0")}:00 a ${String(fin).padStart(2, "0")}:00`;
}

/** Pedidos que cuentan como venta real: enviados y no cancelados. */
export function pedidosReales(pedidos: PedidoAnalisis[]): PedidoAnalisis[] {
  return pedidos.filter((p) => p.enviado && p.estado !== "cancelado");
}

// ---------------------------------------------------------------------------
//  El análisis
// ---------------------------------------------------------------------------

export function analizar(entrada: EntradaAnalisis): ResultadoAnalisis {
  const { pedidos, productos, ahora, zona } = entrada;
  const reales = pedidosReales(pedidos);

  if (reales.length < MINIMO_PARA_OPINAR) {
    return {
      base: reales.length,
      faltaData: {
        pedidosActuales: reales.length,
        pedidosNecesarios: MINIMO_PARA_OPINAR,
      },
      ideas: [],
    };
  }

  const ideas: Idea[] = [
    ideaResumen(reales),
    ideaAbandono(pedidos),
    ideaFranjaFloja(reales, zona),
    ideaDiaFlojo(reales, zona),
    ideaProductosDormidos(reales, productos, ahora),
    ideaCombo(reales),
    ideaCategoriaAusente(reales, productos),
    ideaClientesPerdidos(reales, ahora),
    ideaClientesFieles(reales),
    ideaMargen(reales, productos),
    ideaDeliveryVsRetiro(reales),
  ].filter((x): x is Idea => x !== null);

  return { base: reales.length, faltaData: null, ideas };
}

// --- Resumen -----------------------------------------------------------------

function ideaResumen(reales: PedidoAnalisis[]): Idea {
  const facturado = reales.reduce((s, p) => s + p.total, 0);
  const ticket = facturado / reales.length;

  return {
    clave: "resumen",
    tipo: "dato",
    titulo: "Tu foto del período",
    dato: `${reales.length} pedidos, ${guaranies(facturado)} facturados, ticket promedio ${guaranies(ticket)}`,
    accion:
      "Es la base de todo lo que sigue. Si subís el ticket promedio un 10%, facturás un 10% más sin conseguir un solo cliente nuevo.",
    confianza: "alta",
  };
}

// --- Carritos abandonados ----------------------------------------------------

function ideaAbandono(todos: PedidoAnalisis[]): Idea | null {
  const noCancelados = todos.filter((p) => p.estado !== "cancelado");
  if (noCancelados.length < MINIMO_PARA_OPINAR) return null;

  const abandonados = noCancelados.filter((p) => !p.enviado);
  const tasa = porcentaje(abandonados.length, noCancelados.length);
  if (tasa < 15) return null;

  const plataPerdida = abandonados.reduce((s, p) => s + p.total, 0);

  return {
    clave: "abandono",
    tipo: "alerta",
    titulo: "Carritos que se arman y no se envían",
    dato: `${tasa}% de los pedidos armados nunca se mandaron: ${abandonados.length} de ${noCancelados.length}, por ${guaranies(plataPerdida)}`,
    accion:
      "Esta gente ya eligió qué quería comer y se cayó en el último paso. Antes de gastar en publicidad, revisá el formulario en un celular: cuántos datos pedís, si el costo de envío aparece tarde, si el botón final se entiende.",
    confianza: noCancelados.length >= 100 ? "alta" : "media",
  };
}

// --- Franja horaria floja ----------------------------------------------------

function ideaFranjaFloja(reales: PedidoAnalisis[], zona: string): Idea | null {
  if (reales.length < MINIMO_PARA_FRANJAS) return null;

  const porHora = new Map<number, { pedidos: number; total: number }>();
  for (const p of reales) {
    const h = horaLocal(p.creado, zona);
    const acc = porHora.get(h) ?? { pedidos: 0, total: 0 };
    acc.pedidos += 1;
    acc.total += p.total;
    porHora.set(h, acc);
  }

  // Solo se consideran horas en las que el negocio realmente opera: las que
  // tienen al menos algo de actividad. Si no, "las 4 de la mañana" ganaría
  // siempre el premio a la franja más floja, y no sería un hallazgo.
  const activas = [...porHora.entries()].filter(([, v]) => v.pedidos > 0);
  if (activas.length < 4) return null;

  activas.sort((a, b) => b[1].pedidos - a[1].pedidos);
  const mejor = activas[0];
  const peor = activas[activas.length - 1];

  // Que la diferencia valga la pena contarla.
  if (mejor[1].pedidos < peor[1].pedidos * 3) return null;

  return {
    clave: "franja",
    tipo: "oportunidad",
    titulo: "Tenés una franja fuerte y una muy floja",
    dato: `De ${franjaTexto(mejor[0])} hacés ${mejor[1].pedidos} pedidos; de ${franjaTexto(peor[0])}, solo ${peor[1].pedidos}`,
    accion: `La cocina y el personal ya están pagos en las dos franjas. Una promoción acotada a ${franjaTexto(peor[0])} no te regala margen: te llena horas que hoy tenés vacías.`,
    confianza: reales.length >= MINIMO_PARA_FRANJAS_ALTA ? "alta" : "media",
    detalle: activas
      .slice(0, 5)
      .map(([h, v]) => ({ etiqueta: franjaTexto(h), valor: `${v.pedidos} pedidos` })),
  };
}

// --- Día flojo ---------------------------------------------------------------

function ideaDiaFlojo(reales: PedidoAnalisis[], zona: string): Idea | null {
  if (reales.length < MINIMO_PARA_FRANJAS) return null;

  const porDia = new Map<number, number>();
  for (const p of reales) {
    const d = diaLocal(p.creado, zona);
    porDia.set(d, (porDia.get(d) ?? 0) + 1);
  }
  const activos = [...porDia.entries()];
  if (activos.length < 4) return null;

  activos.sort((a, b) => b[1] - a[1]);
  const mejor = activos[0];
  const peor = activos[activos.length - 1];
  if (mejor[1] < peor[1] * 2.5) return null;

  return {
    clave: "dia",
    tipo: "oportunidad",
    titulo: `Los ${NOMBRES_DIA[peor[0]]} son tu día más flojo`,
    dato: `${NOMBRES_DIA[mejor[0]]}: ${mejor[1]} pedidos · ${NOMBRES_DIA[peor[0]]}: ${peor[1]} pedidos`,
    accion: `Probá algo que solo exista los ${NOMBRES_DIA[peor[0]]} y que la gente tenga que esperar a ese día. Un descuento general te baja el margen todos los días; uno atado a un solo día mueve gente sin tocar el resto.`,
    confianza: reales.length >= MINIMO_PARA_FRANJAS_ALTA ? "alta" : "media",
    detalle: activos.map(([d, n]) => ({
      etiqueta: NOMBRES_DIA[d],
      valor: `${n} pedidos`,
    })),
  };
}

// --- Productos dormidos ------------------------------------------------------

function ideaProductosDormidos(
  reales: PedidoAnalisis[],
  productos: ProductoAnalisis[],
  ahora: Date
): Idea | null {
  const vendidos = new Map<string, number>();
  for (const p of reales) {
    for (const i of p.items) {
      if (!i.productId) continue;
      vendidos.set(i.productId, (vendidos.get(i.productId) ?? 0) + i.cantidad);
    }
  }

  // Solo productos que estuvieron en la carta el tiempo suficiente como para
  // que no venderse sea información y no simplemente novedad.
  const conAntiguedad = productos.filter(
    (pr) =>
      pr.disponible &&
      (ahora.getTime() - pr.creado.getTime()) / MS_POR_DIA >= DIAS_MINIMOS_EN_CARTA
  );
  if (conAntiguedad.length < 5) return null;

  const dormidos = conAntiguedad
    .map((pr) => ({ pr, unidades: vendidos.get(pr.id) ?? 0 }))
    .filter((x) => x.unidades <= 1)
    .sort((a, b) => a.unidades - b.unidades);

  if (dormidos.length === 0) return null;

  const proporcion = porcentaje(dormidos.length, conAntiguedad.length);

  return {
    clave: "dormidos",
    tipo: "alerta",
    titulo: "Productos que ocupan carta y no se venden",
    dato: `${dormidos.length} de ${conAntiguedad.length} productos (${proporcion}%) vendieron una unidad o ninguna`,
    accion:
      "Una carta larga cansa y esconde lo que sí vendés. Con cada uno decidí: sacarlo, cambiarle la foto y el nombre, o meterlo en un combo. Lo peor es dejarlo ahí sin decidir.",
    confianza: reales.length >= 100 ? "alta" : "media",
    detalle: dormidos.slice(0, 8).map((x) => ({
      etiqueta: x.pr.nombre,
      valor: x.unidades === 0 ? "ninguna venta" : "1 unidad",
    })),
  };
}

// --- Combinaciones frecuentes ------------------------------------------------

function ideaCombo(reales: PedidoAnalisis[]): Idea | null {
  const conVarios = reales.filter(
    (p) => new Set(p.items.map((i) => i.productId ?? i.nombre)).size >= 2
  );
  if (reales.length < MINIMO_PARA_COMBOS || conVarios.length < 15) return null;

  const solos = new Map<string, number>();
  const pares = new Map<string, number>();

  for (const p of reales) {
    const nombres = [...new Set(p.items.map((i) => i.nombre))].sort();
    for (const n of nombres) solos.set(n, (solos.get(n) ?? 0) + 1);
    for (let a = 0; a < nombres.length; a++) {
      for (let b = a + 1; b < nombres.length; b++) {
        const clave = `${nombres[a]}||${nombres[b]}`;
        pares.set(clave, (pares.get(clave) ?? 0) + 1);
      }
    }
  }

  let mejor: { a: string; b: string; veces: number; proporcion: number } | null = null;

  for (const [clave, veces] of pares) {
    if (veces < VECES_MINIMAS_PAR) continue;
    const [a, b] = clave.split("||");
    // Se mide contra el producto que MENOS aparece de los dos: así el par tiene
    // que ser fuerte de verdad, y no solo arrastrado por un superventas.
    const base = Math.min(solos.get(a) ?? 0, solos.get(b) ?? 0);
    if (base === 0) continue;
    const proporcion = veces / base;
    if (proporcion < PROPORCION_MINIMA_PAR) continue;
    if (!mejor || proporcion > mejor.proporcion) {
      mejor = { a, b, veces, proporcion };
    }
  }

  if (!mejor) return null;

  return {
    clave: "combo",
    tipo: "oportunidad",
    titulo: "Dos productos que la gente pide juntos",
    dato: `${mejor.a} y ${mejor.b} aparecen juntos en ${mejor.veces} pedidos — el ${Math.round(mejor.proporcion * 100)}% de las veces que se pide el menos frecuente de los dos`,
    accion:
      "Armalos como combo con un precio apenas menor que la suma. No perdés margen: le sacás la decisión de encima al cliente y subís el ticket de los que hoy piden uno solo.",
    confianza: reales.length >= 150 ? "alta" : "media",
  };
}

// --- Categoría que no se suma ------------------------------------------------

function ideaCategoriaAusente(
  reales: PedidoAnalisis[],
  productos: ProductoAnalisis[]
): Idea | null {
  if (reales.length < MINIMO_PARA_OPINAR) return null;

  const categoriaDeProducto = new Map<string, { id: string; nombre: string }>();
  for (const pr of productos) {
    categoriaDeProducto.set(pr.id, { id: pr.categoriaId, nombre: pr.categoriaNombre });
  }

  const categorias = new Map<string, string>();
  for (const pr of productos) categorias.set(pr.categoriaId, pr.categoriaNombre);
  if (categorias.size < 2) return null;

  // Cuántos pedidos incluyen al menos un producto de cada categoría.
  const pedidosConCategoria = new Map<string, number>();
  for (const p of reales) {
    const presentes = new Set<string>();
    for (const i of p.items) {
      if (!i.productId) continue;
      const cat = categoriaDeProducto.get(i.productId);
      if (cat) presentes.add(cat.id);
    }
    for (const c of presentes) {
      pedidosConCategoria.set(c, (pedidosConCategoria.get(c) ?? 0) + 1);
    }
  }

  let peor: { id: string; nombre: string; tasa: number } | null = null;
  for (const [id, nombre] of categorias) {
    const tasa = porcentaje(pedidosConCategoria.get(id) ?? 0, reales.length);
    if (!peor || tasa < peor.tasa) peor = { id, nombre, tasa };
  }

  // Si ya se suma en la mayoría de los pedidos, no hay nada que recomendar.
  if (!peor || peor.tasa >= 50 || peor.tasa === 0) return null;

  const faltantes = reales.length - (pedidosConCategoria.get(peor.id) ?? 0);

  return {
    clave: "categoria_ausente",
    tipo: "oportunidad",
    titulo: `La mayoría de tus pedidos no lleva nada de ${peor.nombre}`,
    dato: `Solo el ${peor.tasa}% de los pedidos incluye algo de ${peor.nombre}: quedan ${faltantes} pedidos sin`,
    accion: `Ofrecelo en el momento justo, cuando el cliente ya eligió el plato principal. Sumar ${peor.nombre.toLowerCase()} a una parte de esos ${faltantes} pedidos es la forma más barata de subir el ticket: el envío y la preparación ya están pagos.`,
    confianza: reales.length >= 100 ? "alta" : "media",
  };
}

// --- Clientes que dejaron de pedir -------------------------------------------

type Cliente = {
  telefono: string;
  nombre: string;
  pedidos: number;
  gastado: number;
  ultimo: Date;
};

function agruparClientes(reales: PedidoAnalisis[]): Cliente[] {
  const mapa = new Map<string, Cliente>();
  for (const p of reales) {
    const clave = p.clienteTelefono.trim();
    if (!clave) continue;
    const c = mapa.get(clave) ?? {
      telefono: clave,
      nombre: p.clienteNombre,
      pedidos: 0,
      gastado: 0,
      ultimo: p.creado,
    };
    c.pedidos += 1;
    c.gastado += p.total;
    if (p.creado > c.ultimo) {
      c.ultimo = p.creado;
      c.nombre = p.clienteNombre;
    }
    mapa.set(clave, c);
  }
  return [...mapa.values()];
}

function ideaClientesPerdidos(reales: PedidoAnalisis[], ahora: Date): Idea | null {
  const clientes = agruparClientes(reales);
  if (clientes.length < 15) return null;

  const perdidos = clientes
    .filter(
      (c) =>
        c.pedidos >= PEDIDOS_PARA_SER_HABITUAL &&
        (ahora.getTime() - c.ultimo.getTime()) / MS_POR_DIA >= DIAS_SIN_VOLVER
    )
    .sort((a, b) => b.gastado - a.gastado);

  if (perdidos.length === 0) return null;

  const plata = perdidos.reduce((s, c) => s + c.gastado, 0);

  return {
    clave: "clientes_perdidos",
    tipo: "alerta",
    titulo: "Clientes habituales que dejaron de pedir",
    dato: `${perdidos.length} personas que ya te habían comprado al menos dos veces no vuelven hace ${DIAS_SIN_VOLVER} días o más. Entre todas gastaron ${guaranies(plata)}`,
    accion:
      "Estos son los más baratos de recuperar de todo tu negocio: ya te conocen, ya les gustó y ya tenés su WhatsApp. Un mensaje personal, sin cadena ni promoción masiva, suele alcanzar.",
    confianza: clientes.length >= 40 ? "alta" : "media",
    detalle: perdidos.slice(0, 8).map((c) => ({
      etiqueta: `${c.nombre} · ${c.telefono}`,
      valor: `${c.pedidos} pedidos · ${guaranies(c.gastado)}`,
    })),
  };
}

// --- Clientes fieles ---------------------------------------------------------

function ideaClientesFieles(reales: PedidoAnalisis[]): Idea | null {
  const clientes = agruparClientes(reales);
  if (clientes.length < 15) return null;

  const ordenados = [...clientes].sort((a, b) => b.gastado - a.gastado);
  const totalGastado = clientes.reduce((s, c) => s + c.gastado, 0);
  if (totalGastado <= 0) return null;

  const cuantos = Math.max(1, Math.round(clientes.length * 0.2));
  const top = ordenados.slice(0, cuantos);
  const gastadoTop = top.reduce((s, c) => s + c.gastado, 0);
  const parte = porcentaje(gastadoTop, totalGastado);

  if (parte < 35) return null;

  return {
    clave: "clientes_fieles",
    tipo: "dato",
    titulo: "Una parte chica de tus clientes sostiene el negocio",
    dato: `Tus ${cuantos} mejores clientes (el 20%) explican el ${parte}% de lo que facturás`,
    accion:
      "Vale más cuidar a estos que conseguir dos clientes nuevos. Que el que atiende sepa reconocerlos por el teléfono y les diga el nombre; eso solo ya sostiene la frecuencia.",
    confianza: clientes.length >= 40 ? "alta" : "media",
    detalle: top.slice(0, 6).map((c) => ({
      etiqueta: `${c.nombre} · ${c.telefono}`,
      valor: `${c.pedidos} pedidos · ${guaranies(c.gastado)}`,
    })),
  };
}

// --- Margen ------------------------------------------------------------------

function ideaMargen(
  reales: PedidoAnalisis[],
  productos: ProductoAnalisis[]
): Idea | null {
  const conCosto = productos.filter((p) => p.costo != null && p.costo > 0);
  if (conCosto.length < 3) return null;

  const unidades = new Map<string, number>();
  for (const p of reales) {
    for (const i of p.items) {
      if (!i.productId) continue;
      unidades.set(i.productId, (unidades.get(i.productId) ?? 0) + i.cantidad);
    }
  }

  const filas = conCosto
    .map((pr) => {
      const u = unidades.get(pr.id) ?? 0;
      const margenUnitario = pr.precio - (pr.costo as number);
      return {
        pr,
        unidades: u,
        margenUnitario,
        ingreso: u * pr.precio,
        margenTotal: u * margenUnitario,
      };
    })
    .filter((f) => f.unidades > 0);

  // Alcanza con dos productos vendidos para comparar márgenes: esto es
  // aritmética sobre ventas reales, no la inferencia de un patrón, así que no
  // necesita el respaldo que sí piden las franjas horarias o los combos.
  //
  // Lo que sí hace falta es que el negocio haya cargado el costo de varios
  // productos (el filtro de más arriba): si solo costeó uno, decirle "este es
  // el que más margen deja" sería engañoso, porque es el único medido.
  if (filas.length < 2) return null;

  const porIngreso = [...filas].sort((a, b) => b.ingreso - a.ingreso);
  const porMargen = [...filas].sort((a, b) => b.margenTotal - a.margenTotal);

  const reyIngreso = porIngreso[0];
  const reyMargen = porMargen[0];

  // Lo interesante es cuando NO coinciden: el que más factura no es el que más deja.
  if (reyIngreso.pr.id === reyMargen.pr.id) {
    return {
      clave: "margen",
      tipo: "dato",
      titulo: "Tu producto más fuerte también es el que más deja",
      dato: `${reyMargen.pr.nombre}: ${reyMargen.unidades} unidades, ${guaranies(reyMargen.margenTotal)} de margen`,
      accion:
        "Es la situación cómoda. Cuidá que nunca falte y que la foto sea la mejor de la carta: es el producto que sostiene tu rentabilidad.",
      confianza: "media",
    };
  }

  return {
    clave: "margen",
    tipo: "oportunidad",
    titulo: "El que más facturás no es el que más te deja",
    dato: `${reyIngreso.pr.nombre} factura ${guaranies(reyIngreso.ingreso)} y deja ${guaranies(reyIngreso.margenTotal)}. ${reyMargen.pr.nombre} deja ${guaranies(reyMargen.margenTotal)}`,
    accion: `Poné ${reyMargen.pr.nombre} arriba de la carta y como destacado. Mover clientes de uno al otro te sube la ganancia sin vender un pedido más.`,
    confianza: reales.length >= 100 ? "alta" : "media",
    detalle: porMargen.slice(0, 6).map((f) => ({
      etiqueta: f.pr.nombre,
      valor: `${f.unidades} u · ${guaranies(f.margenTotal)} de margen`,
    })),
  };
}

// --- Delivery contra retiro --------------------------------------------------

function ideaDeliveryVsRetiro(reales: PedidoAnalisis[]): Idea | null {
  const delivery = reales.filter((p) => p.tipoEntrega === "delivery");
  const retiro = reales.filter((p) => p.tipoEntrega === "retiro");
  if (delivery.length < 10 || retiro.length < 10) return null;

  const ticketDelivery =
    delivery.reduce((s, p) => s + p.total - p.costoEnvio, 0) / delivery.length;
  const ticketRetiro = retiro.reduce((s, p) => s + p.total, 0) / retiro.length;

  const diferencia = porcentaje(
    Math.abs(ticketDelivery - ticketRetiro),
    Math.min(ticketDelivery, ticketRetiro)
  );
  if (diferencia < 15) return null;

  const deliveryGana = ticketDelivery > ticketRetiro;

  return {
    clave: "delivery_retiro",
    tipo: "dato",
    titulo: deliveryGana
      ? "Los pedidos con envío gastan más en comida"
      : "Los que retiran gastan más en comida",
    dato: `Sin contar el envío: delivery ${guaranies(ticketDelivery)} contra retiro ${guaranies(ticketRetiro)} — ${diferencia}% de diferencia`,
    accion: deliveryGana
      ? "El delivery te trae pedidos más grandes. Revisá que el costo de envío no esté espantando a los pedidos chicos: un mínimo bien puesto rinde más que cobrar el envío completo."
      : "Los que retiran arman pedidos más grandes. Vale la pena hacer más visible la opción de retiro y darle algún beneficio: te ahorrás el reparto y venden más.",
    confianza: reales.length >= 100 ? "alta" : "media",
  };
}

// ---------------------------------------------------------------------------
//  La idea de la semana
// ---------------------------------------------------------------------------
//  El panel muestra todo lo que encuentra, pero eso sirve para hurgar, no para
//  actuar: diez conclusiones a la vez no producen ninguna decisión. Una vez por
//  semana se elige UNA sola, la que más conviene atacar, y esa es la que se le
//  pone adelante al dueño.
//
//  Quien ejecuta la promoción o llama al cliente es el dueño, no el sistema.
//  Por eso el objetivo es darle una cosa clara por semana, no un tablero.

/** El resumen es contexto, no una acción: nunca puede ser la idea de la semana. */
const NUNCA_ES_IDEA_DE_LA_SEMANA = new Set(["resumen"]);

const PRIORIDAD_TIPO: Record<Idea["tipo"], number> = {
  alerta: 0,
  oportunidad: 1,
  dato: 2,
};

const PRIORIDAD_CONFIANZA: Record<Confianza, number> = {
  alta: 0,
  media: 1,
  baja: 2,
};

/**
 * Elige qué se le muestra al dueño esta semana.
 *
 * Primero las alertas —cuidar lo que ya tenés rinde más que buscar algo
 * nuevo—, después las oportunidades. A igualdad, la mejor respaldada.
 *
 * `clavesRecientes` son las de las últimas semanas. Se evitan para que no le
 * llegue lo mismo cinco lunes seguidos. Pero si TODAS fueron usadas hace poco,
 * igual se elige la más importante: que un problema siga ahí es justamente
 * motivo para volver a mencionarlo, no para callarlo.
 */
export function elegirIdeaDeLaSemana(
  ideas: Idea[],
  clavesRecientes: string[] = []
): Idea | null {
  const candidatas = ideas.filter((i) => !NUNCA_ES_IDEA_DE_LA_SEMANA.has(i.clave));
  if (candidatas.length === 0) return null;

  const ordenar = (a: Idea, b: Idea) => {
    const porTipo = PRIORIDAD_TIPO[a.tipo] - PRIORIDAD_TIPO[b.tipo];
    if (porTipo !== 0) return porTipo;
    const porConfianza =
      PRIORIDAD_CONFIANZA[a.confianza] - PRIORIDAD_CONFIANZA[b.confianza];
    if (porConfianza !== 0) return porConfianza;
    // Desempate estable: sin esto el orden dependería del motor de JavaScript
    // y la "idea de la semana" podría cambiar sola entre dos ejecuciones.
    return a.clave.localeCompare(b.clave);
  };

  const recientes = new Set(clavesRecientes);
  const frescas = candidatas.filter((i) => !recientes.has(i.clave));

  const elegibles = frescas.length > 0 ? frescas : candidatas;
  return [...elegibles].sort(ordenar)[0];
}

/**
 * El lunes de la semana a la que pertenece una fecha, en la zona del negocio.
 *
 * Sirve de identificador de la semana: dos ejecuciones del mismo lunes tienen
 * que caer en la misma semana y no generar dos ideas distintas.
 */
export function lunesDeLaSemana(fecha: Date, zona: string): string {
  const dia = diaLocal(fecha, zona);
  // Domingo (0) pertenece a la semana que empezó el lunes anterior, no a la
  // que empieza al día siguiente.
  const diasDesdeLunes = dia === 0 ? 6 : dia - 1;

  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: zona,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(fecha);
  const y = Number(partes.find((p) => p.type === "year")?.value);
  const m = Number(partes.find((p) => p.type === "month")?.value);
  const d = Number(partes.find((p) => p.type === "day")?.value);

  const enMedianoche = Date.UTC(y, m - 1, d) - diasDesdeLunes * MS_POR_DIA;
  return new Date(enMedianoche).toISOString().slice(0, 10);
}
