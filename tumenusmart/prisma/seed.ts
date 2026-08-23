/**
 * Datos de ejemplo: una pizzería ficticia, para que el sistema
 * se pueda probar de punta a punta apenas se despliega.
 * Correr con: npm run db:seed
 *
 * CUIDADO: esto BORRA todo lo que haya cargado. Por eso se niega a correr
 * si encuentra pedidos reales, salvo que se lo fuerce a propósito:
 *
 *     npm run db:seed -- --forzar
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const FORZAR = process.argv.includes("--forzar");

async function main() {
  // Freno de mano: con pedidos cargados, casi siempre esto es un accidente.
  const pedidosExistentes = await prisma.order.count();
  if (pedidosExistentes > 0 && !FORZAR) {
    console.error(
      `\nHay ${pedidosExistentes} pedido(s) cargados en esta base.\n` +
        `El sembrador borra TODO antes de cargar los datos de ejemplo.\n\n` +
        `Si de verdad querés borrarlos, corré:  npm run db:seed -- --forzar\n`
    );
    process.exit(1);
  }

  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.productOption.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.deliveryZone.deleteMany();
  await prisma.horarioReserva.deleteMany();
  await prisma.horarioAtencion.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.store.deleteMany();

  // El local primero: todo lo demás cuelga de él.
  const local = await prisma.store.create({
    data: {
      slug: "donmario",
      nombre: "Pizzería Don Mario",
      whatsappNumero: "595981234567",
      direccion: "Av. Mariscal López 1234, Asunción",
      mensajeSaludo: "¡Hola! Te paso mi pedido:",
      lat: -25.2867,
      lng: -57.6349,
      envioModo: "zonas",
    },
  });
  const storeId = local.id;

  await prisma.deliveryZone.createMany({
    data: [
      { storeId, nombre: "Zona 1", radioKm: 3, costoEnvio: 15000 },
      { storeId, nombre: "Zona 2", radioKm: 6, costoEnvio: 20000 },
      { storeId, nombre: "Zona 3", radioKm: 10, costoEnvio: 25000 },
    ],
  });

  const pizzas = await prisma.category.create({
    data: { storeId, nombre: "Pizzas", orden: 1 },
  });
  const bebidas = await prisma.category.create({
    data: { storeId, nombre: "Bebidas", orden: 2 },
  });
  const postres = await prisma.category.create({
    data: { storeId, nombre: "Postres", orden: 3 },
  });

  await prisma.product.create({
    data: {
      storeId,
      categoryId: pizzas.id,
      nombre: "Pizza Muzzarella",
      descripcion: "Salsa de tomate, muzzarella y orégano",
      precio: 55000,
      disponible: true,
      orden: 1,
      opciones: {
        create: [
          { storeId, nombre: "Chica (25cm)", tipo: "variante", precioExtra: 0, orden: 1 },
          { storeId, nombre: "Mediana (30cm)", tipo: "variante", precioExtra: 15000, orden: 2 },
          { storeId, nombre: "Grande (35cm)", tipo: "variante", precioExtra: 30000, orden: 3 },
          { storeId, nombre: "Extra queso", tipo: "agregado", precioExtra: 10000, orden: 4 },
          { storeId, nombre: "Aceitunas", tipo: "agregado", precioExtra: 5000, orden: 5 },
        ],
      },
    },
  });

  await prisma.product.create({
    data: {
      storeId,
      categoryId: pizzas.id,
      nombre: "Pizza Pepperoni",
      descripcion: "Salsa de tomate, muzzarella y pepperoni",
      precio: 65000,
      disponible: true,
      orden: 2,
      opciones: {
        create: [
          { storeId, nombre: "Chica (25cm)", tipo: "variante", precioExtra: 0, orden: 1 },
          { storeId, nombre: "Mediana (30cm)", tipo: "variante", precioExtra: 15000, orden: 2 },
          { storeId, nombre: "Grande (35cm)", tipo: "variante", precioExtra: 30000, orden: 3 },
        ],
      },
    },
  });

  await prisma.product.create({
    data: {
      storeId,
      categoryId: bebidas.id,
      nombre: "Coca-Cola 1.5L",
      precio: 15000,
      disponible: true,
      orden: 1,
    },
  });

  await prisma.product.create({
    data: {
      storeId,
      categoryId: bebidas.id,
      nombre: "Agua sin gas 500ml",
      precio: 8000,
      disponible: true,
      orden: 2,
    },
  });

  await prisma.product.create({
    data: {
      storeId,
      categoryId: postres.id,
      nombre: "Volcán de chocolate",
      precio: 22000,
      disponible: true,
      orden: 1,
    },
  });

  console.log(
    `Seed completo: ${local.nombre} (/${local.slug}) con 3 categorías y 5 productos.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
