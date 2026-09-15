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

/**
 * Todo local nuevo arranca con este período de prueba, sin excepción — no
 * se regalan meses. Pasados los 10 días, el dueño del local decide a mano
 * si le registra un pago (lo que le suma meses desde este mismo vencimiento)
 * o lo deja vencer.
 */
const DIAS_PRUEBA_GRATIS = 10;

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
  const asesorId = String(formData.get("asesorId") ?? "").trim() || null;
  // Los cuatro datos del titular son opcionales: se completan si se tienen a
  // mano al dar de alta, o después desde Cartera.
  const titularNombre = String(formData.get("titularNombre") ?? "").trim() || null;
  const titularTelefono = String(formData.get("titularTelefono") ?? "").trim() || null;
  const razonSocial = String(formData.get("razonSocial") ?? "").trim() || null;
  const ruc = String(formData.get("ruc") ?? "").trim() || null;

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

  const vencimiento = new Date(Date.now() + DIAS_PRUEBA_GRATIS * 24 * 60 * 60 * 1000);

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
        asesorId,
        titularNombre,
        titularTelefono,
        razonSocial,
        ruc,
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

export type ResultadoPago = { ok: true } | { ok: false; error: string };

/**
 * Registra un pago y reactiva el local.
 *
 * Guardar el historial y no solo el vencimiento vigente es lo que permite
 * responder "¿cuándo te pagué?" con un dato y no con la memoria de nadie.
 *
 * Devuelve un resultado en vez de lanzar los errores de validación: Next.js
 * oculta en producción el mensaje de cualquier `throw` que salga de una
 * Server Action, así que el motivo real solo llega si viaja en el retorno.
 */
export async function registrarPago(storeId: string, formData: FormData): Promise<ResultadoPago> {
  const sesion = await exigirSuperadmin();

  const meses = Math.max(1, Math.min(24, Number(formData.get("meses") ?? 1)));
  const monto = Number(String(formData.get("monto") ?? "0").replace(/[^\d]/g, ""));
  const nota = String(formData.get("nota") ?? "").trim() || null;

  if (!Number.isFinite(monto) || monto < 0) {
    return { ok: false, error: "El monto no es válido" };
  }

  const local = await prisma.store.findUnique({
    where: { id: storeId },
    select: { id: true, vencimiento: true },
  });
  if (!local) return { ok: false, error: "Ese local no existe" };

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
  return { ok: true };
}

/** Apagar o prender un local a mano, sin tocar su fecha de vencimiento. */
export async function alternarSuspension(
  storeId: string,
  suspender: boolean
): Promise<{ ok: true }> {
  await exigirSuperadmin();

  await prisma.store.update({
    where: { id: storeId },
    data: { estado: suspender ? "suspendido" : "activo" },
  });

  revalidatePath("/admin/super");
  revalidatePath("/[slug]", "layout");
  return { ok: true };
}

export type ResultadoDatosTitular = { ok: true } | { ok: false; error: string };

/**
 * Corrige los datos del titular de un local ya creado — mismos cuatro campos
 * que el alta, todos opcionales, para completarlos o corregirlos cuando no
 * se tenían a mano al crear el local.
 */
export async function actualizarDatosTitular(
  storeId: string,
  formData: FormData
): Promise<ResultadoDatosTitular> {
  await exigirSuperadmin();

  await prisma.store.update({
    where: { id: storeId },
    data: {
      titularNombre: String(formData.get("titularNombre") ?? "").trim() || null,
      titularTelefono: String(formData.get("titularTelefono") ?? "").trim() || null,
      razonSocial: String(formData.get("razonSocial") ?? "").trim() || null,
      ruc: String(formData.get("ruc") ?? "").trim() || null,
    },
  });

  revalidatePath("/admin/super");
  return { ok: true };
}

/** Cambia el plan que figura para un local. Es solo una etiqueta tuya. */
export async function cambiarPlan(storeId: string, plan: string) {
  await exigirSuperadmin();
  const limpio = plan.trim().slice(0, 40) || "basico";
  await prisma.store.update({ where: { id: storeId }, data: { plan: limpio } });
  revalidatePath("/admin/super");
}

export type ResultadoAsesor = { ok: true } | { ok: false; error: string };

/** Da de alta un asesor comercial, para poder asignárselo a los locales que trae. */
export async function crearAsesor(formData: FormData): Promise<ResultadoAsesor> {
  await exigirSuperadmin();

  const nombre = String(formData.get("nombre") ?? "").trim();
  const telefono = String(formData.get("telefono") ?? "").trim();
  const ciudad = String(formData.get("ciudad") ?? "").trim();
  const email = normalizarEmail(String(formData.get("email") ?? ""));

  if (!nombre) return { ok: false, error: "Falta el nombre del asesor" };
  if (!telefono) return { ok: false, error: "Falta el teléfono del asesor" };
  if (!ciudad) return { ok: false, error: "Falta la ciudad del asesor" };
  if (!email.includes("@") || email.length < 5) {
    return { ok: false, error: "Escribí un correo válido para el asesor" };
  }

  await prisma.asesor.create({ data: { nombre, telefono, ciudad, email } });
  revalidatePath("/admin/super/asesores");
  revalidatePath("/admin/super");
  return { ok: true };
}

/**
 * Activa o desactiva un asesor. Nunca se borra: si tiene locales asignados,
 * borrarlo les dejaría la referencia colgando. Uno inactivo desaparece de
 * la lista para asignar en locales nuevos, pero los que ya tiene lo
 * conservan.
 */
export async function alternarActivoAsesor(id: string, activo: boolean) {
  await exigirSuperadmin();
  await prisma.asesor.update({ where: { id }, data: { activo } });
  revalidatePath("/admin/super/asesores");
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
