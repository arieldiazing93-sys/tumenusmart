"use server";

import { redirect } from "next/navigation";
import { crearSesionAdmin, validarPassword } from "@/lib/auth";

export async function iniciarSesionAdmin(formData: FormData) {
  const password = String(formData.get("password") ?? "");

  if (!validarPassword(password)) {
    redirect("/admin/login?error=1");
  }

  await crearSesionAdmin();
  redirect("/admin/pedidos");
}
