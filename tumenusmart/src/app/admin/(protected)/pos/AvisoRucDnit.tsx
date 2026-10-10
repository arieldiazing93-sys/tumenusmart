"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pareceRucConDigito, type VerificacionRuc } from "@/lib/sifen/ruc";
import { verificarRucDnit } from "./verificar-ruc";

/**
 * La verificación de un RUC contra la DNIT, para las pantallas donde se carga el cliente de una factura.
 *
 * Es una ayuda que nunca corta nada por sí sola: devuelve el resultado y la pantalla decide. Solo `bloquea` (la DNIT dijo que el
 * RUC no existe o está en un estado que ella rechaza) tiene que impedir facturar con ese RUC. Si la consulta falla por cualquier
 * motivo, queda en `null` y la venta sigue como antes (con el control del dígito verificador del servidor).
 *
 * Una consulta nueva descarta la anterior que no haya vuelto todavía: si el cajero corrige el número mientras se consulta, no
 * aparece el resultado del número viejo.
 */
export function useVerificacionRuc() {
  const [verificacion, setVerificacion] = useState<VerificacionRuc | null>(null);
  const [verificando, setVerificando] = useState(false);
  const pedido = useRef(0);

  const verificar = useCallback(async (numero: string, forzar?: boolean): Promise<VerificacionRuc | null> => {
    const id = ++pedido.current;
    setVerificando(true);
    try {
      const r = await verificarRucDnit(numero, forzar);
      if (id !== pedido.current) return null;
      setVerificacion(r);
      return r;
    } catch {
      if (id === pedido.current) setVerificacion(null);
      return null;
    } finally {
      if (id === pedido.current) setVerificando(false);
    }
  }, []);

  const limpiar = useCallback(() => {
    pedido.current++;
    setVerificacion(null);
    setVerificando(false);
  }, []);

  return { verificacion, verificando, verificar, limpiar };
}

/**
 * Para un formulario donde se escribe el RUC a mano (el cuadro «Nuevo cliente», «Nueva factura»): verifica solo cuando el RUC
 * está completo (80012345-0) y el tipo es RUC, sin molestar mientras se escribe; con la respuesta completa el dígito
 * verificador si faltaba y trae la razón social si el campo está vacío (o si todavía tiene la que se había traído sola).
 */
export function useVerificacionDeCliente({
  tipo,
  numero,
  razonSocial,
  ponerNumero,
  ponerRazonSocial,
}: {
  tipo: string;
  numero: string;
  razonSocial: string;
  ponerNumero: (numero: string) => void;
  ponerRazonSocial: (razonSocial: string) => void;
}) {
  const base = useVerificacionRuc();
  const { verificar, limpiar } = base;
  // Lo más nuevo de cada cosa, para usarlo dentro de una consulta que vuelve más tarde (el estado del cierre estaría viejo).
  const ultimo = useRef({ tipo, razonSocial, ponerNumero, ponerRazonSocial });
  ultimo.current = { tipo, razonSocial, ponerNumero, ponerRazonSocial };
  // La razón social que se completó sola con lo que dice la DNIT: mientras no se la toque, una consulta nueva la puede cambiar.
  const autocompletada = useRef("");
  // «tipo:número» para el que ya se pidió la verificación (así completar el dígito no dispara otra).
  const verificado = useRef("");

  const verificarAhora = useCallback(
    async (n: string, forzar: boolean): Promise<VerificacionRuc | null> => {
      verificado.current = `${ultimo.current.tipo}:${n}`;
      const r = await verificar(n, forzar);
      if (!r || (r.resultado !== "encontrado" && r.resultado !== "no_disponible")) return r;
      // Si se escribió el RUC sin el dígito verificador, se completa (es la cuenta del módulo 11, no hace falta la DNIT).
      if (r.rucCompleto && !n.includes("-")) {
        verificado.current = `${ultimo.current.tipo}:${r.rucCompleto}`;
        ultimo.current.ponerNumero(r.rucCompleto);
      }
      const actual = ultimo.current.razonSocial;
      if (r.resultado === "encontrado" && r.razonSocial && (!actual.trim() || actual === autocompletada.current)) {
        autocompletada.current = r.razonSocial;
        ultimo.current.ponerRazonSocial(r.razonSocial);
      }
      return r;
    },
    [verificar]
  );

  useEffect(() => {
    const n = numero.trim();
    if (verificado.current === `${tipo}:${n}`) return;
    limpiar();
    verificado.current = "";
    if (tipo !== "ruc" || !pareceRucConDigito(n)) return;
    const espera = setTimeout(() => void verificarAhora(n, false), 500);
    return () => clearTimeout(espera);
  }, [numero, tipo, limpiar, verificarAhora]);

  /** Reemplaza la razón social por la que figura en la DNIT (cuando el cajero había escrito otra). */
  const usarNombreDeLaDnit = useCallback(() => {
    const r = base.verificacion?.razonSocial;
    if (!r) return;
    autocompletada.current = r;
    ultimo.current.ponerRazonSocial(r);
  }, [base.verificacion]);

  return { ...base, verificarAhora, usarNombreDeLaDnit };
}

const ESTILO: Record<VerificacionRuc["nivel"], { color: string; icono: string }> = {
  ok: { color: "text-exito", icono: "✓" },
  aviso: { color: "text-aviso", icono: "⚠" },
  error: { color: "text-peligro", icono: "✕" },
  info: { color: "text-tinta-suave", icono: "ℹ" },
};

/**
 * Lo que dijo la DNIT, en una línea de color (verde = verificado, amarillo = revisar, rojo = no se puede facturar así, gris = no se
 * pudo verificar). No dibuja nada si no hay nada que decir (por ejemplo, un local que no factura electrónico).
 */
export function AvisoRucDnit({
  verificacion,
  verificando,
  conRazonSocial = true,
}: {
  verificacion: VerificacionRuc | null;
  verificando: boolean;
  /** Mostrar también el nombre que figura en la DNIT. En los formularios que ya muestran la razón social (la completan solos) sobra. */
  conRazonSocial?: boolean;
}) {
  if (verificando) {
    return (
      <p role="status" className="mt-1.5 text-[0.76rem] text-tinta-suave">
        Verificando el RUC en la DNIT…
      </p>
    );
  }
  if (!verificacion || !verificacion.mensaje) return null;
  const { color, icono } = ESTILO[verificacion.nivel];
  return (
    <div role={verificacion.nivel === "error" ? "alert" : "status"} className={`mt-1.5 text-[0.78rem] leading-snug ${color}`}>
      <p className={verificacion.nivel === "error" || verificacion.nivel === "aviso" ? "font-medium" : ""}>
        <span aria-hidden="true">{icono} </span>
        {verificacion.mensaje}
      </p>
      {conRazonSocial && verificacion.razonSocial && (verificacion.nivel === "ok" || verificacion.nivel === "aviso") && (
        <p className="mt-0.5 font-semibold text-tinta">{verificacion.razonSocial}</p>
      )}
    </div>
  );
}
