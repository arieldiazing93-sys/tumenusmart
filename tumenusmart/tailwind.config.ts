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
  content: ["./src/app/**/*.{ts,tsx}", "./src/components/**/*.{ts,tsx}"],
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
        },

        /** Colores con significado: estado, no decoración. */
        exito: { DEFAULT: "#1F6B4F", luz: "#E6F2EC" },
        aviso: { DEFAULT: "#8A6512", luz: "#FAF2E0" },
        peligro: { DEFAULT: "#A32F2C", luz: "#FAEAE9" },
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
      },
    },
  },
  plugins: [],
};

export default config;
