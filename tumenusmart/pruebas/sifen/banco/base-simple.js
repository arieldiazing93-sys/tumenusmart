// Ayudas mínimas para pruebas sin React: ok / igual / log y un contador de aciertos.
(function () {
  const salida = document.getElementById("salida");
  window.__fallas = 0; window.__aciertos = 0; window.__log = [];
  window.log = (t) => { window.__log.push(t); if (salida) salida.textContent += "\n" + t; };
  window.ok = (cond, msg) => { if (cond) { window.__aciertos++; return; } window.__fallas++; window.log("FALLA: " + msg); };
  window.igual = (a, b, msg) => window.ok(JSON.stringify(a) === JSON.stringify(b), msg + " -> esperado " + JSON.stringify(b) + " y salio " + JSON.stringify(a));
  window.pausa = (ms) => new Promise((r) => setTimeout(r, ms));
})();
