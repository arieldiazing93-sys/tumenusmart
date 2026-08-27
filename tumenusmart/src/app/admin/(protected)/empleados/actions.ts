"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { idLocalActual } from "@/lib/local-actual";
import { cifrarPassword, exigirPermiso, generarPassword } from "@/lib/auth";

function normalizarEmail(valor: string): string {
  return valor.trim().toLowerCase();
}

/**
 * Da de alta a un empleado del local.
 *
 * Acá está la parte delicada de toda esta función, y conviene que quede
 * dicha: el rol y el local NO se leen del formulario. Se fuerzan.
 *
 * Si el rol viniera del formulario, un dueño podría mandar "superadmin" y
 * crearse un usuario con acceso a la cartera entera. Si el local viniera del
 * formulario, podría crear un usuario dentro del negocio de otro. Las dos
 * cosas se hacen con una herramienta de navegador y treinta segundos, sin
 * saber programar. Por eso el formulario solo aporta el nombre y el correo.
 */
export async function crearEmpleado(formData: FormData): Promise<{ password: string }> {
  const sesion = await exigirPermiso("empleados.gestionar");
  const storeId = await idLocalActual();

  const email = normalizarEmail(String(formData.get("email") ?? ""));
  const nombre = String(formData.get("nombre") ?? "").trim();

  if (!email.includes("@") || email.length < 5) {
    throw new Error("Escribí un correo válido");
  }
  if (!nombre) throw new Error("Poné el nombre de la persona");

  const yaExiste = await prisma.usuario.findUnique({
    where: { email },
    select: { id: true },
  });
  if (yaExiste) throw new Error("Ya hay un usuario con ese correo");

  // La contraseña la genera el sistema. Nadie elige "1234" para el mozo, y
  // como igual va a viajar por WhatsApp, entra obligado a cambiarla.
  const password = generarPassword();

  await prisma.usuario.create({
    data: {
      email,
      nombre,
      rol: "empleado", // forzado, nunca del formulario
      storeId, // forzado al local de quien lo crea
      passwordHash: await cifrarPassword(password),
      debeCambiarPassword: true,
    },
  });

  // El superadmin puede crear empleados desde el local que esté mirando; se
  // deja registrado quién fue en el log del servidor, que es donde se busca
  // cuando alguien pregunta "¿y este usuario de dónde salió?".
  console.log(`[empleados] ${sesion.email} creó a ${email} en el local ${storeId}`);

  revalidatePath("/admin/empleados");
  return { password };
}

/**
 * Apagar o volver a encender a un empleado.
 *
 * No se borra: si se borrara, se perdería quién registró cada pago o cada
 * cambio. Un empleado apagado no puede entrar y listo.
 */
export async function alternarActivoEmpleado(id: string, activo: boolean) {
  await exigirPermiso("empleados.gestionar");
  const storeId = await idLocalActual();

  // El `storeId` en el where NO es decorativo: sin él, alguien podría mandar
  // el id de un empleado de otro local y desactivarlo.
  const resultado = await prisma.usuario.updateMany({
    where: { id, storeId, rol: "empleado" },
    data: { activo },
  });
  if (resultado.count === 0) {
    throw new Error("Ese empleado no es de tu local");
  }

  revalidatePath("/admin/empleados");
}

/** Genera una contraseña nueva cuando el empleado se la olvidó. */
export async function restablecerPasswordEmpleado(id: string): Promise<{ password: string }> {
  await exigirPermiso("empleados.gestionar");
  const storeId = await idLocalActual();

  const empleado = await prisma.usuario.findFirst({
    where: { id, storeId, rol: "empleado" },
    select: { id: true },
  });
  if (!empleado) throw new Error("Ese empleado no es de tu local");

  const password = generarPassword();
  await prisma.usuario.update({
    where: { id: empleado.id },
    data: { passwordHash: await cifrarPassword(password), debeCambiarPassword: true },
  });

  revalidatePath("/admin/empleados");
  return { password };
}
