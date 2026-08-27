import type { Config } from "tailwindcss";

/**
 * Sistema visual de TuMenuSmart.
 *
 * Una sola idea sostiene todo: el naranja no es el color del fondo, es el
 * color del DATO. Aparece en números, reglas y un botón por pantalla. Un
 * acento que se usa poco pesa más que uno repartido por todos lados; el resto
 * es papel, tinta y una línea fina.
 *
 * Los grises están tibios a propósito —tienen una pizca del naranja adentro—
 * para que el conjunto se lea como elegido y no como el gris por defecto.
 */
const config: Config = {
  // OJO con esta lista: Tailwind SOLO genera las clases que encuentra acá.
  // src/lib faltaba, y ahí viven los colores de estado de pedidos y reservas.
  // El resultado no era un error sino algo peor: las clases existían en el
  // código, el build pasaba en verde, y en pantalla los estados salían todos
  // grises porque el CSS nunca se generó.
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--fuente-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--fuente-mono)", "ui-monospace", "monospace"],
      },

      colors: {
        brand: {
          DEFAULT: "#D2501F",
          dark: "#B0401A",
          light: "#FCEDE6",
          // "tinte" es el fondo de las pastillas de estado: más fuerte que
          // "light" para que se distingan de un vistazo en una tabla larga.
          tinte: "#F7D9CB",
          // Para texto de acento sobre fondo claro: más oscuro, mejor contraste.
          texto: "#A33A14",
        },

        /** Papel: los fondos. */
        papel: {
          DEFAULT: "#FFFFFF",
          suave: "#F7F7F6",
          hundido: "#F1F1F0",
        },

        /** Tinta: los textos, de más fuerte a más apagado. */
        tinta: {
          DEFAULT: "#131417",
          media: "#4B4F58",
          suave: "#83878F",
        },

        /** Líneas y separadores. */
        linea: {
          DEFAULT: "#E4E4E6",
          fina: "#EFEFF0",
        },

        /** La banda oscura donde se muestra el producto. */
        noche: {
          DEFAULT: "#131417",
          panel: "#1D1F24",
          linea: "#2C2F36",
          tinta: "#F2F2F3",
          suave: "#A0A4AC",
        },

        /**
         * Azul: navegación. Nada más.
         *
         * El naranja es "avanzar, pedir, gastar plata". Si volver atrás usara
         * el mismo color, el cliente tendría que leer cada botón para saber
         * cuál lo lleva adelante y cuál atrás. Con dos colores lo resuelve de
         * un vistazo. Por eso el azul NUNCA se usa para confirmar un pedido.
         */
        azul: {
          DEFAULT: "#1668C4",
          oscuro: "#12539C",
          luz: "#E9F1FB",
          tinte: "#CFE1F7",
        },

        /**
         * Violeta: el pedido que ya salió del local.
         *
         * Existe solo para eso. Los otros cinco estados ya tienen color propio
         * con significado, y "en despacho" necesitaba uno que no se confundiera
         * con ninguno — sobre todo con el verde de entregado.
         */
        violeta: {
          DEFAULT: "#6D4AA8",
          oscuro: "#553780",
          luz: "#F1ECFA",
          tinte: "#DCD0F2",
        },

        /** Colores con significado: estado, no decoración. */
        exito: { DEFAULT: "#1F6B4F", luz: "#E6F2EC", tinte: "#C9E4D6" },
        // El ámbar se oscureció de #8A6512 a #7A5810: sobre el fondo "tinte"
        // el anterior daba 4.07:1, abajo del mínimo legible para texto chico.
        // Ahora da 4.98:1, y de paso mejoran todos los carteles de aviso.
        aviso: { DEFAULT: "#7A5810", luz: "#FAF2E0", tinte: "#F2E0B4" },
        peligro: { DEFAULT: "#A32F2C", luz: "#FAEAE9", tinte: "#F4D2D0" },
      },

      letterSpacing: {
        titular: "-0.032em",
        rotulo: "0.19em",
      },

      borderRadius: {
        // Esquinas contenidas: lo muy redondeado envejece rápido.
        DEFAULT: "4px",
        lg: "6px",
        xl: "10px",
      },

      boxShadow: {
        // Sombras largas y suaves en vez de halos grises.
        alta: "0 24px 60px -28px rgba(19,20,23,0.30), 0 2px 6px rgba(19,20,23,0.05)",
        media: "0 12px 30px -16px rgba(19,20,23,0.22)",
      },

      keyframes: {
        "destacado-entrada": {
          "0%": { transform: "translateX(-24px)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        subir: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        // La hoja del producto entrando desde abajo.
        subirHoja: {
          "0%": { transform: "translateY(100%)" },
          "100%": { transform: "translateY(0)" },
        },
        // El "+" al agregar: un latido corto, no una fiesta.
        latir: {
          "0%": { transform: "scale(1)" },
          "35%": { transform: "scale(1.28)" },
          "100%": { transform: "scale(1)" },
        },
        // El cajón del menú entrando desde el costado, en el celular.
        entrarIzquierda: {
          "0%": { transform: "translateX(-100%)" },
          "100%": { transform: "translateX(0)" },
        },
        /**
         * La entrada del contenido al cambiar de sección del panel.
         *
         * Corta a propósito: quien lo usa está trabajando, no mirando el
         * sistema.
         *
         * OJO — acá NO puede haber transform, y es por una razón que ya rompió
         * algo. Esta animación termina con `fill-mode: both`, que deja pegado
         * el estado final para siempre. Un ancestro con transform distinto de
         * `none` pasa a ser el bloque contenedor de sus hijos `position:
         * fixed`, así que dejan de medirse contra la pantalla y se miden
         * contra él. La ventana de "Compartir mi carta" terminaba con 3080px
         * de alto —todo el largo de la lista de pedidos— y aparecía centrada
         * al fondo de la página, con el velo oscuro tapando todas las filas.
         * Medido en Chromium: pruebas/fixed-dentro-del-panel.mjs.
         *
         * Con solo opacidad el efecto se mantiene y el transform queda en none.
         */
        entrarPanel: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        // El carrito acusando recibo cuando cambia el total.
        saltito: {
          "0%": { transform: "scale(1)" },
          "40%": { transform: "scale(1.03)" },
          "100%": { transform: "scale(1)" },
        },
      },
      animation: {
        "destacado-entrada": "destacado-entrada 0.5s ease-out",
        subir: "subir 0.62s cubic-bezier(0.22,0.7,0.3,1) both",
        panel: "entrarPanel 0.18s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
