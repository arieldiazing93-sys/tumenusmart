// Un `node:crypto` mínimo y SÍNCRONO para el banco de pruebas (el navegador no tiene createHmac). Solo lo que usa la app:
// createHmac/createHash("sha256") con update().digest("hex"), randomBytes, timingSafeEqual y un `Buffer.from(texto)` mínimo.
// Se comprueba contra los vectores oficiales (SHA-256 de "abc" y el caso 1 del RFC 4231) antes de usarse: si fallara, la prueba lo dice.
(() => {
  const primos = []; for (let n = 2; primos.length < 64; n++) if (primos.every((p) => n % p !== 0)) primos.push(n);
  const fraccion = (x) => Math.floor((x - Math.floor(x)) * 4294967296) >>> 0;
  const K = primos.map((p) => fraccion(Math.cbrt(p)));
  const H0 = primos.slice(0, 8).map((p) => fraccion(Math.sqrt(p)));
  const rotd = (x, n) => (x >>> n) | (x << (32 - n));

  function sha256(bytes) {
    const largo = bytes.length, bits = largo * 8;
    const total = (((largo + 9 + 63) >> 6) << 6);
    const m = new Uint8Array(total); m.set(bytes); m[largo] = 0x80;
    const dv = new DataView(m.buffer); dv.setUint32(total - 4, bits >>> 0); dv.setUint32(total - 8, Math.floor(bits / 4294967296));
    const h = Uint32Array.from(H0), w = new Uint32Array(64);
    for (let i = 0; i < total; i += 64) {
      for (let t = 0; t < 16; t++) w[t] = dv.getUint32(i + t * 4);
      for (let t = 16; t < 64; t++) {
        const s0 = rotd(w[t - 15], 7) ^ rotd(w[t - 15], 18) ^ (w[t - 15] >>> 3), s1 = rotd(w[t - 2], 17) ^ rotd(w[t - 2], 19) ^ (w[t - 2] >>> 10);
        w[t] = (w[t - 16] + s0 + w[t - 7] + s1) >>> 0;
      }
      let [a, b, c, d, e, f, g, hh] = h;
      for (let t = 0; t < 64; t++) {
        const S1 = rotd(e, 6) ^ rotd(e, 11) ^ rotd(e, 25), ch = (e & f) ^ (~e & g), t1 = (hh + S1 + ch + K[t] + w[t]) >>> 0;
        const S0 = rotd(a, 2) ^ rotd(a, 13) ^ rotd(a, 22), mj = (a & b) ^ (a & c) ^ (b & c), t2 = (S0 + mj) >>> 0;
        hh = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
      }
      h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
    }
    const sal = new Uint8Array(32); const o = new DataView(sal.buffer); h.forEach((v, i) => o.setUint32(i * 4, v >>> 0));
    return sal;
  }
  const aBytes = (x) => (typeof x === "string" ? new TextEncoder().encode(x) : Uint8Array.from(x));
  const aHex = (u) => Array.from(u, (b) => b.toString(16).padStart(2, "0")).join("");
  const unir = (a, b) => { const r = new Uint8Array(a.length + b.length); r.set(a); r.set(b, a.length); return r; };

  function hmac(clave, mensaje) {
    let k = aBytes(clave); if (k.length > 64) k = sha256(k);
    const kk = new Uint8Array(64); kk.set(k);
    const ipad = kk.map((b) => b ^ 0x36), opad = kk.map((b) => b ^ 0x5c);
    return sha256(unir(opad, sha256(unir(ipad, aBytes(mensaje)))));
  }
  const salida = (u, codificacion) => (codificacion === "hex" ? aHex(u) : codificacion === "base64url" ? btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "") : u);
  const acumulador = (alFinal) => { let datos = new Uint8Array(0); const o = { update(x) { datos = unir(datos, aBytes(x)); return o; }, digest(c) { return salida(alFinal(datos), c); } }; return o; };

  const cripto = {
    createHmac: (_alg, clave) => acumulador((d) => hmac(clave, d)),
    createHash: () => acumulador((d) => sha256(d)),
    randomBytes: (n) => { const u = new Uint8Array(n); crypto.getRandomValues(u); u.toString = function (c) { return c === "base64url" ? salida(this, "base64url") : aHex(this); }; return u; },
    timingSafeEqual: (a, b) => { if (a.length !== b.length) throw new RangeError("largos distintos"); let d = 0; for (let i = 0; i < a.length; i++) d |= a[i] ^ b[i]; return d === 0; },
  };
  // Lo mínimo de Buffer que usa el código del servidor: Buffer.from(texto[, "hex"]) → bytes, con toString("hex"|"utf8").
  const aBuffer = (u) => { u.toString = function (c) { return c === "hex" ? aHex(this) : c === "base64url" ? salida(this, "base64url") : new TextDecoder().decode(this); }; return u; };
  window.Buffer = { from: (x, enc) => aBuffer(enc === "hex" ? Uint8Array.from(String(x).match(/../g) || [], (h) => parseInt(h, 16)) : typeof x === "string" ? new TextEncoder().encode(x) : Uint8Array.from(x)) };
  cripto.randomBytes = (n) => aBuffer(crypto.getRandomValues(new Uint8Array(n)));

  // scrypt de mentira: determinista (dos sha256 encadenados) y LENTO a propósito (setTimeout) para que los pedidos simultáneos se
  // crucen como en el servidor real. Cuenta cuántas veces se calculó: es lo que mide cuántas contraseñas se llegaron a probar.
  const estadoScrypt = { llamadas: 0, demoraMs: 5 };
  cripto.scrypt = (password, sal, largo, cb) => {
    estadoScrypt.llamadas++;
    const base = unir(aBytes(sal), aBytes(password));
    const parte = (n) => sha256(unir(base, Uint8Array.of(n)));
    const derivada = aBuffer(unir(parte(0), parte(1)).slice(0, largo));
    setTimeout(() => cb(null, derivada), estadoScrypt.demoraMs);
  };
  const util = { promisify: (f) => (...a) => new Promise((res, rej) => f(...a, (e, v) => (e ? rej(e) : res(v)))) };

  window.CriptoBanco = {
    cripto,
    estadoScrypt,
    /** Instala el simulacro y comprueba contra los vectores oficiales. Devuelve true si la implementación es correcta. */
    instalar(simulacros) {
      simulacros["node:crypto"] = cripto; simulacros["crypto"] = cripto; simulacros["util"] = util; simulacros["node:util"] = util;
      const abc = cripto.createHash("sha256").update("abc").digest("hex") === "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
      const clave = new Uint8Array(20).fill(0x0b);
      const rfc = cripto.createHmac("sha256", clave).update("Hi There").digest("hex") === "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7";
      const largo = cripto.createHash("sha256").update("a".repeat(1000)).digest("hex") === "41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3";
      return abc && rfc && largo;
    },
  };
})();
