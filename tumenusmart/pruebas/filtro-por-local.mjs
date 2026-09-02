import { aplicarLocal, normalizarSlug, slugDisponible } from "../src/lib/alcance-local.ts";

const A = "local_fogata";
const B = "local_donmario";
let ok = true;
const chequear = (nombre, condicion, detalle="") => {
  if (!condicion) ok = false;
  console.log(`${condicion ? "OK " : "MAL"} | ${nombre}${detalle ? "  -> " + detalle : ""}`);
};

console.log("=== 1. Lecturas: siempre se filtran ===");
for (const op of ["findMany","findFirst","findUnique","count","aggregate","groupBy"]) {
  const r = aplicarLocal("Order", op, { where: { estado: "pendiente" } }, A);
  chequear(`${op} conserva el filtro propio y agrega el local`,
    r.where.storeId === A && r.where.estado === "pendiente");
}
// sin where previo
const sinWhere = aplicarLocal("Order", "findMany", {}, A);
chequear("findMany sin where igual queda filtrado", sinWhere.where.storeId === A);
const sinArgs = aplicarLocal("Order", "findMany", undefined, A);
chequear("findMany sin argumentos igual queda filtrado", sinArgs.where.storeId === A);

console.log("\n=== 2. Intento de fuga: pedir explícitamente otro local ===");
const fuga = aplicarLocal("Order", "findMany", { where: { storeId: B } }, A);
chequear("un where que apunta a OTRO local queda pisado por el propio",
  fuga.where.storeId === A, `pidió ${B}, quedó ${fuga.where.storeId}`);

const fugaPorId = aplicarLocal("Order", "findUnique", { where: { id: "pedido_de_otro" } }, A);
chequear("buscar por id ajeno suma el local, así no lo encuentra",
  fugaPorId.where.storeId === A && fugaPorId.where.id === "pedido_de_otro");

console.log("\n=== 3. Modificaciones y borrados ===");
const upd = aplicarLocal("Order", "update", { where: { id: "x" }, data: { estado: "entregado" } }, A);
chequear("update filtra por local y respeta los datos",
  upd.where.storeId === A && upd.data.estado === "entregado");
const del = aplicarLocal("Product", "delete", { where: { id: "y" } }, A);
chequear("delete filtra por local", del.where.storeId === A);
const delMany = aplicarLocal("Product", "deleteMany", { where: { disponible: false } }, A);
chequear("deleteMany filtra por local", delMany.where.storeId === A && delMany.where.disponible === false);

console.log("\n=== 4. Creación: el local se completa solo ===");
const crear = aplicarLocal("Product", "create", { data: { nombre: "Pizza" } }, A);
chequear("create completa el local", crear.data.storeId === A && crear.data.nombre === "Pizza");
const crearMuchos = aplicarLocal("Product", "createMany", { data: [{ nombre: "A" }, { nombre: "B" }] }, A);
chequear("createMany completa el local en cada fila",
  crearMuchos.data.every(f => f.storeId === A) && crearMuchos.data.length === 2);
const crearFuga = aplicarLocal("Product", "create", { data: { nombre: "X", storeId: B } }, A);
chequear("crear declarando OTRO local queda pisado", crearFuga.data.storeId === A);

console.log("\n=== 5. upsert ===");
const up = aplicarLocal("HorarioReserva", "upsert", {
  where: { turno_hora: { turno: "noche", hora: "20:00" } },
  create: { turno: "noche", hora: "20:00" },
  update: { activo: true },
}, A);
chequear("upsert filtra el where y completa el create",
  up.where.storeId === A && up.create.storeId === A && up.update.activo === true);

console.log("\n=== 6. Store queda afuera (es el local mismo) ===");
const store = aplicarLocal("Store", "findMany", { where: { slug: "lafogata" } }, A);
chequear("Store no se filtra por storeId", store.where.storeId === undefined && store.where.slug === "lafogata");

console.log("\n=== 7. Sin local no se consulta ===");
let lanzo = false;
try { aplicarLocal("Order", "findMany", {}, ""); } catch { lanzo = true; }
chequear("una consulta sin local lanza error en vez de traer todo", lanzo);

console.log("\n=== 8. Todas las tablas del sistema quedan cubiertas ===");
const tablas = ["Category","Product","ProductOption","DeliveryZone","Customer","Repartidor","Order","OrderItem","Reservation","HorarioReserva","HorarioAtencion","IdeaSemanal","Pago","Rendicion"];
const cubiertas = tablas.filter(t => aplicarLocal(t, "findMany", {}, A).where?.storeId === A);
chequear(`las ${tablas.length} tablas se filtran`, cubiertas.length === tablas.length,
  cubiertas.length < tablas.length ? "faltan: " + tablas.filter(t=>!cubiertas.includes(t)).join(", ") : "");

console.log("\n=== 9. Nombres para la URL ===");
chequear('"La Fogata Ñemby" -> la-fogata-nemby', normalizarSlug("La Fogata Ñemby") === "la-fogata-nemby", normalizarSlug("La Fogata Ñemby"));
chequear('"Pizzería Don Mario" -> pizzeria-don-mario', normalizarSlug("Pizzería Don Mario") === "pizzeria-don-mario", normalizarSlug("Pizzería Don Mario"));
chequear('"  Café  del  Sur " sin bordes sueltos', normalizarSlug("  Café  del  Sur ") === "cafe-del-sur", normalizarSlug("  Café  del  Sur "));
chequear("admin queda rechazado", !slugDisponible("admin"));
chequear("checkout queda rechazado", !slugDisponible("checkout"));
chequear("lafogata queda aceptado", slugDisponible("lafogata"));
chequear("un nombre de una sola letra queda rechazado", !slugDisponible("a"));

console.log(ok ? "\n>>> EL FILTRO POR LOCAL PASA TODAS LAS PRUEBAS" : "\n>>> HAY FALLAS");
process.exit(ok ? 0 : 1);
