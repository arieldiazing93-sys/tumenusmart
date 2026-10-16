"use client";

import { useEffect, useRef } from "react";
import { crearDetectorDeEscaneo } from "@/lib/lector-codigo";

/**
 * Escucha el lector de códigos de barras en toda la pantalla (ver src/lib/lector-codigo.ts: un lector se comporta como un teclado muy rápido).
 *
 * Cuándo escucha:
 *   · con el foco en cualquier parte que no sea un campo de texto (la pantalla, un botón, un enlace), y
 *   · dentro de los campos que lo permiten con `data-lector="si"` (la cantidad y el buscador del punto de venta).
 * En cualquier otro campo (nombre del cliente, RUC, descuento, importes…) NO interviene: lo que se escanee ahí queda escrito en ese campo,
 * como con cualquier teclado.
 *
 * Qué hace al detectar un escaneo: avisa con el código (`alLeer`), le saca a la pantalla el Enter (para que no «apriete» un botón ni dispare el
 * Enter de un campo) y deja el campo donde estaba el foco como estaba antes de que llegaran los números (si el lector tipeó dentro de «Cantidad»,
 * ese «7790001…» se borra solo).
 *
 * `activo` apaga la escucha (con el cobro abierto, por ejemplo). `alLeer` puede cambiar en cada vuelta: siempre se llama al último.
 */
export function useLectorDeCodigos({ activo, alLeer }: { activo: boolean; alLeer: (codigo: string) => void }) {
  const ultimoAlLeer = useRef(alLeer);
  ultimoAlLeer.current = alLeer;

  useEffect(() => {
    if (!activo) return;
    const detector = crearDetectorDeEscaneo();
    // Cómo estaba el campo con foco justo antes de la primera tecla de la ráfaga: para dejarlo así si resulta ser un escaneo.
    let antes: { campo: HTMLInputElement | HTMLTextAreaElement; valor: string } | null = null;

    function esCampoDeTexto(el: Element | null): el is HTMLInputElement | HTMLTextAreaElement {
      if (!el) return false;
      if (el instanceof HTMLTextAreaElement) return true;
      if (el instanceof HTMLInputElement) {
        // Las casillas, los botones y los archivos no reciben texto: ahí un escaneo no escribe nada.
        return !["checkbox", "radio", "button", "submit", "reset", "file", "range", "color", "image"].includes(el.type);
      }
      return false;
    }

    function campoAdmitido(el: Element | null): boolean {
      if (!el || el === document.body || el === document.documentElement) return true;
      if (esCampoDeTexto(el)) return el.dataset.lector === "si";
      if (el instanceof HTMLSelectElement) return false;
      if (el instanceof HTMLElement && el.isContentEditable) return false;
      return true;
    }

    function restaurarCampo() {
      if (!antes) return;
      const { campo, valor } = antes;
      antes = null;
      if (campo.value === valor) return;
      // Con el «setter» de verdad (no `campo.value = …`) para que React se entere del cambio y vuelva a su estado.
      const proto = campo instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(campo, valor);
      campo.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function alApretarTecla(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      const foco = document.activeElement;
      if (!campoAdmitido(foco)) {
        detector.reiniciar();
        antes = null;
        return;
      }
      const evento = detector.tecla(e.key, performance.now());
      if (evento.tipo === "caracter" && evento.primero) {
        // Todavía no se sabe si es un lector: se anota cómo estaba el campo por si hay que dejarlo como estaba.
        antes = esCampoDeTexto(foco) ? { campo: foco, valor: foco.value } : null;
      } else if (evento.tipo === "escaneo") {
        // Es un lector: el Enter no tiene que llegar a nadie (ni apretar un botón, ni agregar lo que diga el buscador).
        e.preventDefault();
        e.stopImmediatePropagation();
        restaurarCampo();
        // Se avisa DESPUÉS de que la pantalla termine de actualizarse con el campo ya restaurado (si no, `alLeer` vería todavía los números que el
        // lector tipeó adentro de «Cantidad»). `ultimoAlLeer.current` se lee recién ahí: es la versión más nueva de la función.
        const codigo = evento.codigo;
        window.setTimeout(() => ultimoAlLeer.current(codigo), 0);
      } else if (evento.tipo === "enter_comun") {
        antes = null;
      }
    }

    // En la fase de captura y en la ventana: se entera ANTES que los campos y los botones.
    window.addEventListener("keydown", alApretarTecla, true);
    return () => window.removeEventListener("keydown", alApretarTecla, true);
  }, [activo]);
}
