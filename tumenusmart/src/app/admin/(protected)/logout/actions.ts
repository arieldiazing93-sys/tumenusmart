"use server";

import { redirect } from "next/navigation";
import { cerrarSesion as cerrarSesionDeUsuario } from "@/lib/auth";

export async function cerrarSesion() {
  await cerrarSesionDeUsuario();
  redirect("/admin/login");
}
