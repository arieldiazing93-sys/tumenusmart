// Cabeceras de seguridad, en un solo lugar para que Vercel las mande en TODA
// respuesta (páginas, rutas de API, Server Actions).
//
// `script-src` lleva 'unsafe-inline' a propósito, no por descuido: Next.js
// (App Router) inyecta scripts inline propios para hidratar la página —sin
// esto la app directamente no arranca—. La alternativa correcta es un CSP
// con nonce por request, pero requiere generar y propagar el nonce en
// middleware.ts con cuidado, y romperlo a medias es peor que no tenerlo. Se
// deja como mejora futura, documentada, no como un descuido.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  // Supabase Storage (fotos de producto y logos) + los tiles del mapa
  // (Leaflet + OpenStreetMap, usado para marcar la ubicación de entrega).
  "img-src 'self' data: blob: https://*.supabase.co https://*.tile.openstreetmap.org",
  "font-src 'self' data:",
  // wss/ws a localhost: QZ Tray (impresión silenciosa) escucha ahí en la
  // computadora de cada estación — sin esto el navegador corta el
  // WebSocket en silencio y se confunde con "QZ Tray no está instalado".
  "connect-src 'self' wss://localhost:* ws://localhost:*",
  // Nadie puede embeber el panel ni la carta en un <iframe> ajeno —
  // reemplaza y refuerza a X-Frame-Options.
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**" },
    ],
  },
  // La librería qz-tray (impresión silenciosa) trae un `require('lna')`
  // opcional para un paquete que no instalamos a propósito — en el navegador
  // de verdad ese require está en un try/catch y la librería sigue andando
  // sin él, pero el bundler de Next intenta resolverlo en build y el
  // paquete no existe, lo que rompe el build entero. Se le dice a webpack
  // que ignore ese require puntual (queda como un módulo que tira al
  // requerirlo, exactamente el caso que el propio try/catch de qz-tray ya
  // contempla) en vez de intentar resolverlo de verdad.
  webpack: (config, { webpack }) => {
    config.plugins.push(new webpack.IgnorePlugin({ resourceRegExp: /^lna$/ }));
    return config;
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: CSP },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Vercel ya fuerza HTTPS, pero esto le dice al navegador que lo
          // recuerde y no intente nunca HTTP plano con este dominio —
          // preload solo funciona una vez enviado a la lista de Chrome/etc,
          // pero max-age + includeSubDomains ya protegen desde el primer visit.
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          // Se deja "geolocation=(self)" porque el checkout la usa de
          // verdad (marcar la ubicación de entrega en el mapa). El resto,
          // sin motivo para existir en esta app, se corta.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(self), payment=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
