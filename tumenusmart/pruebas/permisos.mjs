// Pruebas de quién puede hacer qué.
//
// Los permisos son la clase de regla donde un error NO se nota: la pantalla
// anda igual, y el problema aparece cuando alguien hace algo que no debía.
// Por eso se prueban a mano, uno por uno, contra el archivo compilado.
//
//   node pruebas/permisos.mjs

import { puede, permisosDe, normalizarRol, etiquetaRol } from "./compilado/permisos.mjs";

let ok = 0;
const fallas = [];
function esperar(descripcion, real, esperado) {
  if (real === esperado) ok++;
  else fallas.push(`${descripcion}\n     esperaba ${esperado}, obtuve ${real}`);
}
const SI = (rol, p) => esperar(`${rol} SÍ puede ${p}`, puede(rol, p), true);
const NO = (rol, p) => esperar(`${rol} NO puede ${p}`, puede(rol, p), false);

console.log("\n— el empleado —");
SI("empleado", "pedidos.ver");
SI("empleado", "pedidos.cambiarEstado");
SI("empleado", "pedidos.asignarRepartidor");
SI("empleado", "reservas.ver");
SI("empleado", "reservas.gestionar");
SI("empleado", "repartidores.ver");
SI("empleado", "productos.ver");
SI("empleado", "productos.disponibilidad");
SI("empleado", "categorias.ver");

// Lo que NO puede es lo que importa: acá es donde un error cuesta plata.
NO("empleado", "productos.editar");
NO("empleado", "categorias.editar");
NO("empleado", "repartidores.gestionar");
NO("empleado", "estadisticas.ver");
NO("empleado", "ideas.ver");
NO("empleado", "configuracion.editar");
NO("empleado", "empleados.gestionar");
NO("empleado", "cartera.gestionar");
NO("empleado", "usuarios.gestionar");

console.log("— el dueño del local —");
SI("local", "productos.editar");
SI("local", "categorias.editar");
SI("local", "estadisticas.ver");
SI("local", "configuracion.editar");
SI("local", "empleados.gestionar");
SI("local", "repartidores.gestionar");
// Un dueño NO administra la cartera ni los usuarios de otros locales.
NO("local", "cartera.gestionar");
NO("local", "usuarios.gestionar");

console.log("— el superadmin —");
SI("superadmin", "cartera.gestionar");
SI("superadmin", "usuarios.gestionar");
SI("superadmin", "configuracion.editar");
SI("superadmin", "pedidos.ver");

console.log("— el empleado nunca puede más que el dueño —");
for (const p of permisosDe("empleado")) {
  esperar(`el dueño también puede ${p}`, puede("local", p), true);
}
for (const p of permisosDe("local")) {
  esperar(`el superadmin también puede ${p}`, puede("superadmin", p), true);
}

console.log("— valores raros caen del lado seguro —");
// La columna es texto libre: puede llegar cualquier cosa.
for (const raro of ["", null, undefined, "administrador", "LOCAL", "empleado ", "root", "0"]) {
  esperar(`"${raro}" se normaliza a empleado`, normalizarRol(raro), "empleado");
  esperar(`"${raro}" NO puede editar productos`, puede(raro, "productos.editar"), false);
  esperar(`"${raro}" NO puede ver estadísticas`, puede(raro, "estadisticas.ver"), false);
}
// Ojo: mayúsculas NO valen. Si algún día se guarda "Local", ese usuario queda
// como empleado y alguien se va a quejar — mejor eso que al revés.
esperar('"local" exacto sí vale', normalizarRol("local"), "local");

console.log("— nadie puede modificar la tabla desde afuera —");
const copia = permisosDe("empleado");
copia.push("configuracion.editar");
esperar("permisosDe devuelve una copia", puede("empleado", "configuracion.editar"), false);

console.log("— etiquetas —");
esperar("etiqueta empleado", etiquetaRol("empleado"), "Empleado");
esperar("etiqueta local", etiquetaRol("local"), "Dueño del local");
esperar("etiqueta desconocida", etiquetaRol("xxx"), "Empleado");

console.log(`\n${fallas.length === 0 ? "✓" : "✗"} ${ok} comprobaciones, ${fallas.length} fallaron`);
for (const f of fallas) console.log("   ✗ " + f);
process.exit(fallas.length === 0 ? 0 : 1);
