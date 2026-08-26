"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  cifrarPassword,
  exigirSuperadmin,
  generarPassword,
  normalizarEmail,
} from "@/lib/auth";
import { normalizarSlug, SLUGS_RESERVADOS } from "@/lib/alcance-local";
import { plantillaPorClave } from "@/lib/plantillas-menu";
import { calcularNuevoVencimiento } from "@/lib/suscripcion";

// Todo lo de este archivo es exclusivo del superadmin, y cada acción lo exige
// por su cuenta: que la pantalla no muestre el botón no alcanza, porque una
// acción de servidor se puede invocar sin pasar por la pantalla.

export type ResultadoAlta = {
  ok: boolean;
  error?: string;
  /** Solo cuando salió bien. La contraseña se muestra UNA vez y no se guarda. */
  local?: { nombre: string; slug: string; url: string };
  acceso?: { email: string; password: string };
};

/**
 * Da de alta un local completo: el negocio, su carta de arranque y el usuario
 * del dueño.
 *
 * Antes esto eran tres archivos SQL escritos a mano. El objetivo es que sumar
 * un cliente deje de depender de que alguien escriba consultas.
 */
export async function crearLocal(formData: FormData): Promise<ResultadoAlta> {
  await exigirSuperadmin();

  const nombre = String(formData.get("nombre") ?? "").trim();
  const slugPedido = String(formData.get("slug") ?? "").trim();
  const whatsappCrudo = String(formData.get("whatsapp") ?? "");
  const email = normalizarEmail(String(formData.get("email") ?? ""));
  const plantillaClave = String(formData.get("plantilla") ?? "vacio");
  const plan = String(formData.get("plan") ?? "basico").trim() || "basico";
  const mesesGratis = Number(formData.get("mesesGratis") ?? 0);

  if (!nombre) return { ok: false, error: "Falta el nombre del negocio" };

  const slug = normalizarSlug(slugPedido || nombre);
  if (!slug) return { ok: false, error: "No pude armar una URL con ese nombre" };
  if (SLUGS_RESERVADOS.has(slug)) {
    return { ok: false, error: `"${slug}" es una palabra reservada del sistema. Elegí otra.` };
  }

  const yaExisteSlug = await prisma.store.findUnique({ where: { slug }, select: { id: true } });
  if (yaExisteSlug) {
    return { ok: false, error: `Ya hay un local usando la URL /${slug}` };
  }

  // Se guarda en formato internacional sin el signo +, que es lo que necesita
  // el enlace de WhatsApp.
  const whatsapp = normalizarWhatsapp(whatsappCrudo);
  if (!whatsapp) {
    return { ok: false, error: "El número de WhatsApp no parece válido" };
  }

  if (!email.includes("@") || email.length < 5) {
    return { ok: false, error: "Escribí un correo válido para el dueño" };
  }
  const yaExisteEmail = await prisma.usuario.findUnique({
    where: { email },
    select: { id: true },
  });
  if (yaExisteEmail) {
    return { ok: false, error: "Ya hay un usuario con ese correo" };
  }

  const password = generarPassword();
  const plantilla = plantillaPorClave(plantillaClave);

  const vencimiento =
    mesesGratis > 0 ? calcularNuevoVencimiento(null, mesesGratis) : null;

  // Todo junto: si algo falla, no queda un local a medio crear con un usuario
  // colgando o una carta a medias.
  await prisma.$transaction(async (tx) => {
    const local = await tx.store.create({
      data: {
        nombre,
        slug,
        whatsappNumero: whatsapp,
        mensajeSaludo: "¡Hola! Te paso mi pedido:",
        mensajeSaludoReserva: "¡Hola! Te paso mi reserva:",
        envioModo: "coordinar",
        estado: "activo",
        plan,
        vencimiento,
      },
      select: { id: true },
    });

    await tx.usuario.create({
      data: {
        email,
        passwordHash: await cifrarPassword(password),
        nombre: nombre,
        rol: "local",
        storeId: local.id,
        // La contraseña se la pasás por WhatsApp: hasta que la cambie, el
        // panel se lo va a recordar en cada pantalla.
        debeCambiarPassword: true,
      },
    });

    if (plantilla) {
      let ordenCategoria = 1;
      for (const categoria of plantilla.categorias) {
        const cat = await tx.category.create({
          data: { storeId: local.id, nombre: categoria.nombre, orden: ordenCategoria++ },
          select: { id: true },
        });

        let ordenProducto = 1;
        for (const p of categoria.productos) {
          await tx.product.create({
            data: {
              storeId: local.id,
              categoryId: cat.id,
              nombre: p.nombre,
              descripcion: p.descripcion ?? null,
              precio: p.precio,
              destacado: p.destacado ?? false,
              mitadYMitadGrupo: p.mitadYMitadGrupo ?? null,
              orden: ordenProducto++,
            },
          });
        }
      }
    }
  });

  revalidatePath("/admin/super");
  revalidatePath("/admin", "layout");

  return {
    ok: true,
    local: { nombre, slug, url: `/${slug}` },
    acceso: { email, password },
  };
}

/**
 * Registra un pago y reactiva el local.
 *
 * Guardar el historial y no solo el vencimiento vigente es lo que permite
 * responder "¿cuándo te pagué?" con un dato y no con la memoria de nadie.
 */
export async function registrarPago(storeId: string, formData: FormData) {
  const sesion = await exigirSuperadmin();

  const meses = Math.max(1, Math.min(24, Number(formData.get("meses") ?? 1)));
  const monto = Number(String(formData.get("monto") ?? "0").replace(/[^\d]/g, ""));
  const nota = String(formData.get("nota") ?? "").trim() || null;

  if (!Number.isFinite(monto) || monto < 0) {
    throw new Error("El monto no es válido");
  }

  const local = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true, vencimiento: true },
  });
  if (!local) throw new Error("Ese local no existe");

  const cubreHasta = calcularNuevoVencimiento(local.vencimiento, meses);

  await prisma.$transaction([
    prisma.pago.create({
      data: {
        storeId,
        monto,
        meses,
        cubreHasta,
        nota,
        registradoPor: sesion.email,
      },
    }),
    prisma.store.update({
      where: { id: storeId },
      // Registrar el pago reactiva: si estaba apagado por falta de pago, tiene
      // que volver a atender en el acto y no esperar a que alguien lo prenda.
      data: { vencimiento: cubreHasta, estado: "activo" },
    }),
  ]);

  revalidatePath("/admin/super");
  revalidatePath("/[slug]", "layout");
}

/** Apagar o prender un local a mano, sin tocar su fecha de vencimiento. */
export async function alternarSuspension(storeId: string, suspender: boolean) {
  await exigirSuperadmin();

  await prisma.store.update({
    where: { id: storeId },
    data: { estado: suspender ? "suspendido" : "activo" },
  });

  revalidatePath("/admin/super");
  revalidatePath("/[slug]", "layout");
}

/** Cambia el plan que figura para un local. Es solo una etiqueta tuya. */
export async function cambiarPlan(storeId: string, plan: string) {
  await exigirSuperadmin();
  const limpio = plan.trim().slice(0, 40) || "basico";
  await prisma.store.update({ where: { id: storeId }, data: { plan: limpio } });
  revalidatePath("/admin/super");
}

/**
 * Deja el número como lo necesita el enlace de WhatsApp: solo dígitos, con
 * código de país y sin el cero inicial.
 *
 * En Paraguay la gente escribe 0982 951807; WhatsApp necesita 595982951807.
 */
function normalizarWhatsapp(crudo: string): string | null {
  let digitos = crudo.replace(/[^\d]/g, "");
  if (!digitos) return null;

  if (digitos.startsWith("595")) {
    // ya viene con código de país
  } else if (digitos.startsWith("0")) {
    digitos = "595" + digitos.slice(1);
  } else if (digitos.length === 9) {
    // 982951807 -> le falta el país
    digitos = "595" + digitos;
  }

  if (digitos.length < 10 || digitos.length > 15) return null;
  return digitos;
}
