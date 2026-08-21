"use server";

import { redirect } from "next/navigation";
import { cerrarSesionAdmin } from "@/lib/auth";

export async function cerrarSesion() {
  await cerrarSesionAdmin();
  redirect("/admin/login");
}
