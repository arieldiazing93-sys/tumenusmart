// Prueba del cliente que se da de alta al facturar («Nuevo cliente»): el teléfono opcional que deja junto con sus datos fiscales.
//   - src/lib/datos-fiscales.ts: qué teléfono sirve y cuál no (la pantalla avisa y el servidor vuelve a revisar).
//   - src/lib/prisma-local.ts → upsertClienteFiscal REAL contra la base en memoria: el teléfono se guarda en la ficha del cliente, nunca
//     hace fallar la venta (es único por local: si ya es de otra ficha, simplemente no se guarda) y no gasta una Clave nueva.
(async () => {
  const { ok, igual } = window;
  const C = window.Cargador;
  const S = C.simulacros;
  const BF = window.BaseFalsa;

  // =============================================================== la parte pura
  window.log("== Cliente fiscal: el teléfono opcional");
  const df = await C.cargar("src/lib/datos-fiscales");
  igual(df.errorDelTelefono(""), null, "vacío está bien (es opcional)");
  igual(df.errorDelTelefono(undefined), null, "sin valor está bien");
  igual(df.errorDelTelefono("   "), null, "solo espacios está bien");
  igual(df.errorDelTelefono("0981 234 567"), null, "0981 234 567 sirve");
  igual(df.errorDelTelefono("+595 981 234567"), null, "con código de país sirve");
  igual(df.errorDelTelefono("(021) 123-456"), null, "fijo con paréntesis y guion sirve");
  ok(typeof df.errorDelTelefono("123") === "string", "123 es muy corto");
  ok(typeof df.errorDelTelefono("abc") === "string", "letras no sirven");
  ok(typeof df.errorDelTelefono("0981-abc-567") === "string", "letras mezcladas no sirven");
  ok(typeof df.errorDelTelefono("1".repeat(16)) === "string", "16 dígitos son demasiados");
  ok(typeof df.errorDelTelefono("0981 234 567 ".repeat(3)) === "string", "más de 20 caracteres no sirve");
  igual(df.limpiarTelefonoDeCliente("  0981   234  567 "), "0981 234 567", "se guardan los espacios simples, como lo escribió");
  igual(df.limpiarTelefonoDeCliente("abc"), "", "lo que no parece teléfono no se guarda");
  igual(df.limpiarTelefonoDeCliente(null), "", "null no se guarda");
  igual(df.limpiarTelefonoDeCliente("0981234567"), "0981234567", "pegado también sirve");

  // =============================================================== el alta en la base (el código real, base en memoria)
  window.log("== Cliente fiscal: upsertClienteFiscal con teléfono");
  // El módulo real (otras pruebas lo reemplazaron por un simulacro de prismaDelLocal): se carga el verdadero y después se repone.
  BF.instalar(S);
  S["@prisma/client"] = S["@prisma/client"] || {};
  if (!S["@prisma/client"].Prisma) S["@prisma/client"].Prisma = { PrismaClientKnownRequestError: class extends Error {} };
  const simulacroPrevio = S["src/lib/prisma-local"];
  delete S["src/lib/prisma-local"];
  const pl = await C.cargar("src/lib/prisma-local");
  if (simulacroPrevio) S["src/lib/prisma-local"] = simulacroPrevio;
  ok(typeof pl.upsertClienteFiscal === "function", "se cargó el upsertClienteFiscal real");

  const db = BF.db;
  const reiniciar = () => {
    BF.reiniciar();
    BF.tablas.store = [{ id: "s1", contadorClientes: 0 }];
    BF.tablas.customer = [];
  };
  const clientes = () => BF.tablas.customer;
  const de = (numero) => clientes().find((c) => c.numeroIdentificacion === numero && c.storeId === "s1");
  const alta = (extra = {}) =>
    pl.upsertClienteFiscal(db, "s1", { tipoIdentificacion: "ruc", numeroIdentificacion: "80069563-1", razonSocial: "Cliente de Prueba S.A.", email: "", ...extra });

  // 1. cliente nuevo con teléfono libre
  reiniciar();
  await alta({ email: "c@correo.com", telefono: "0981 234 567" });
  ok(clientes().length === 1, "1) se creó un cliente");
  igual(de("80069563-1").telefono, "0981 234 567", "1) con su teléfono");
  igual(de("80069563-1").email, "c@correo.com", "1) y su correo");
  igual(de("80069563-1").numero, 1, "1) con la Clave 1");
  igual(BF.tablas.store[0].contadorClientes, 1, "1) gastó una sola Clave");

  // 2. cliente nuevo sin teléfono
  reiniciar();
  await alta({ telefono: "" });
  igual(de("80069563-1").telefono ?? null, null, "2) sin teléfono queda sin teléfono (null)");

  // 3. el teléfono ya es de otra ficha: no falla y no lo pisa
  reiniciar();
  clientes().push({ id: "otra", storeId: "s1", nombre: "María López", telefono: "0981 234 567", tipoIdentificacion: null, numeroIdentificacion: null, numero: null });
  BF.tablas.store[0].contadorClientes = 5;
  await alta({ telefono: "0981 234 567" });
  igual(clientes().length, 2, "3) se creó el cliente fiscal igual (la venta no se frena)");
  igual(de("80069563-1").telefono ?? null, null, "3) pero sin el teléfono, que ya es de otra ficha");
  igual(clientes().find((c) => c.id === "otra").telefono, "0981 234 567", "3) la ficha de María conserva su teléfono");
  igual(clientes().find((c) => c.id === "otra").nombre, "María López", "3) y su nombre: no se fusionan las fichas");
  igual(de("80069563-1").numero, 6, "3) la Clave nueva sigue la cuenta");

  // 4. cliente que ya existe sin teléfono: se le agrega
  reiniciar();
  clientes().push({ id: "c1", storeId: "s1", nombre: "Cliente de Prueba S.A.", telefono: null, tipoIdentificacion: "ruc", numeroIdentificacion: "80069563-1", numero: 3, email: "viejo@correo.com" });
  BF.tablas.store[0].contadorClientes = 3;
  await alta({ razonSocial: "Cliente de Prueba SA", email: "", telefono: "0982 111 222" });
  igual(clientes().length, 1, "4) no se duplicó");
  igual(de("80069563-1").telefono, "0982 111 222", "4) se le agregó el teléfono");
  igual(de("80069563-1").email, "viejo@correo.com", "4) el correo viejo no se borra si esta vez no se escribió");
  igual(de("80069563-1").nombre, "Cliente de Prueba SA", "4) la razón social se corrige");
  igual(BF.tablas.store[0].contadorClientes, 3, "4) no se gastó otra Clave (es un cliente que ya existía)");

  // 5. cliente que ya tenía teléfono y esta vez no se escribió: lo conserva
  reiniciar();
  clientes().push({ id: "c1", storeId: "s1", nombre: "Cliente de Prueba S.A.", telefono: "0983 000 111", tipoIdentificacion: "ruc", numeroIdentificacion: "80069563-1", numero: 3 });
  await alta({ telefono: "" });
  igual(de("80069563-1").telefono, "0983 000 111", "5) sin teléfono nuevo conserva el que tenía");
  await alta({});
  igual(de("80069563-1").telefono, "0983 000 111", "5) sin el dato también");

  // 6. cliente que existe, teléfono nuevo que es de otra ficha: queda como estaba
  reiniciar();
  clientes().push({ id: "c1", storeId: "s1", nombre: "Cliente de Prueba S.A.", telefono: null, tipoIdentificacion: "ruc", numeroIdentificacion: "80069563-1", numero: 3 });
  clientes().push({ id: "otra", storeId: "s1", nombre: "Pedro", telefono: "0984 555 666", tipoIdentificacion: null, numeroIdentificacion: null, numero: null });
  await alta({ telefono: "0984 555 666" });
  igual(de("80069563-1").telefono ?? null, null, "6) no le quita el teléfono a la otra ficha ni falla");
  igual(clientes().find((c) => c.id === "otra").telefono, "0984 555 666", "6) la otra ficha sigue con el suyo");

  // 7. la misma persona vuelve a facturar con el mismo teléfono
  reiniciar();
  await alta({ telefono: "0981 234 567" });
  await alta({ telefono: "0981 234 567" });
  igual(clientes().length, 1, "7) facturar de nuevo no duplica");
  igual(de("80069563-1").telefono, "0981 234 567", "7) y el teléfono sigue ahí");

  // 8. teléfono con basura: no se guarda y no rompe
  reiniciar();
  await alta({ telefono: "no tengo" });
  igual(de("80069563-1").telefono ?? null, null, "8) algo que no es un teléfono no se guarda");
  igual(clientes().length, 1, "8) pero el cliente se crea igual");

  // 9. el mismo teléfono en OTRO local no estorba
  reiniciar();
  clientes().push({ id: "x", storeId: "s2", nombre: "Otro local", telefono: "0981 234 567", tipoIdentificacion: null, numeroIdentificacion: null, numero: null });
  await alta({ telefono: "0981 234 567" });
  igual(de("80069563-1").telefono, "0981 234 567", "9) el mismo teléfono en otro local no estorba");

  window.log("\naciertos: " + window.__aciertos + " · fallas: " + window.__fallas);
  window.__listo = true;
})().catch((e) => { document.getElementById("salida").textContent += "\nERROR: " + (e && e.stack || e); window.__listo = true; window.__fallas = (window.__fallas || 0) + 1; });
