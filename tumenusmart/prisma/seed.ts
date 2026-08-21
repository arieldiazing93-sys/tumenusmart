/**
 * Datos de ejemplo: una pizzería ficticia, para que el sistema
 * se pueda probar de punta a punta apenas se despliega.
 * Correr con: npm run db:seed
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.productOption.deleteMany();
  await prisma.product.deleteMany();
  await prisma.category.deleteMany();
  await prisma.deliveryZone.deleteMany();
  await prisma.store.deleteMany();

  await prisma.store.create({
    data: {
      nombre: "Pizzería Don Mario",
      whatsappNumero: "595981234567",
      direccion: "Av. Mariscal López 1234, Asunción",
      mensajeSaludo: "¡Hola! Te paso mi pedido:",
    },
  });

  await prisma.deliveryZone.createMany({
    data: [
      { nombre: "Centro", costoEnvio: 15000 },
      { nombre: "Zona Norte", costoEnvio: 20000 },
      { nombre: "Zona Sur", costoEnvio: 25000 },
    ],
  });

  const pizzas = await prisma.category.create({
    data: { nombre: "Pizzas", orden: 1 },
  });
  const bebidas = await prisma.category.create({
    data: { nombre: "Bebidas", orden: 2 },
  });
  const postres = await prisma.category.create({
    data: { nombre: "Postres", orden: 3 },
  });

  await prisma.product.create({
    data: {
      categoryId: pizzas.id,
      nombre: "Pizza Muzzarella",
      descripcion: "Salsa de tomate, muzzarella y orégano",
      precio: 55000,
      disponible: true,
      orden: 1,
      opciones: {
        create: [
          { nombre: "Chica (25cm)", tipo: "variante", precioExtra: 0, orden: 1 },
          { nombre: "Mediana (30cm)", tipo: "variante", precioExtra: 15000, orden: 2 },
          { nombre: "Grande (35cm)", tipo: "variante", precioExtra: 30000, orden: 3 },
          { nombre: "Extra queso", tipo: "agregado", precioExtra: 10000, orden: 4 },
          { nombre: "Aceitunas", tipo: "agregado", precioExtra: 5000, orden: 5 },
        ],
      },
    },
  });

  await prisma.product.create({
    data: {
      categoryId: pizzas.id,
      nombre: "Pizza Pepperoni",
      descripcion: "Salsa de tomate, muzzarella y pepperoni",
      precio: 65000,
      disponible: true,
      orden: 2,
      opciones: {
        create: [
          { nombre: "Chica (25cm)", tipo: "variante", precioExtra: 0, orden: 1 },
          { nombre: "Mediana (30cm)", tipo: "variante", precioExtra: 15000, orden: 2 },
          { nombre: "Grande (35cm)", tipo: "variante", precioExtra: 30000, orden: 3 },
        ],
      },
    },
  });

  await prisma.product.create({
    data: {
      categoryId: bebidas.id,
      nombre: "Coca-Cola 1.5L",
      precio: 15000,
      disponible: true,
      orden: 1,
    },
  });

  await prisma.product.create({
    data: {
      categoryId: bebidas.id,
      nombre: "Agua sin gas 500ml",
      precio: 8000,
      disponible: true,
      orden: 2,
    },
  });

  await prisma.product.create({
    data: {
      categoryId: postres.id,
      nombre: "Volcán de chocolate",
      precio: 22000,
      disponible: true,
      orden: 1,
    },
  });

  console.log("Seed completo: Pizzería Don Mario con 3 categorías y 5 productos.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
