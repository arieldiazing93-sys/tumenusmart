/**
 * Departamento, distrito y ciudad de un establecimiento, con los códigos y nombres OFICIALES.
 *
 * Fuente: "Código de Referencia Geográfica" que publica la DNIT en e-Kuatia (Tablas y Codificaciones), que a su vez
 * sale del código geográfico del INE. La DNIT valida cuatro cosas de la dirección del emisor (D111 a D116 del Manual
 * Técnico): que el departamento, el distrito y la ciudad estén relacionados, y que el NOMBRE de cada uno sea el de
 * la tabla. Por eso el nombre nunca se escribe a mano: se toma de acá a partir del código.
 *
 * Solo para el servidor (la tabla pesa unos 220 KB): los formularios piden las listas por acción del servidor.
 */

import { DEPARTAMENTOS, type DatosEmisor } from "../emisor-fiscal";
import { CIUDADES_GEO, DEPARTAMENTOS_GEO, DISTRITOS_GEO, GEOGRAFIA_ACTUALIZACION } from "./geografia.generated";

/** El documento admite hasta 30 caracteres en el nombre del distrito y de la ciudad (dDesDisEmi, dDesCiuEmi). */
export const MAX_NOMBRE_UBICACION = 30;

export type OpcionGeografica = { codigo: number; nombre: string };

type Indices = {
  departamentos: Map<number, string>;
  distritos: Map<number, { departamento: number; nombre: string }>;
  ciudades: Map<number, { distrito: number; nombre: string }>;
  distritosPorDepartamento: Map<number, OpcionGeografica[]>;
  ciudadesPorDistrito: Map<number, OpcionGeografica[]>;
};

let cache: Indices | null = null;

function indices(): Indices {
  if (cache) return cache;
  const departamentos = new Map<number, string>(DEPARTAMENTOS_GEO.map(([codigo, nombre]) => [codigo, nombre]));
  const distritos = new Map<number, { departamento: number; nombre: string }>();
  const distritosPorDepartamento = new Map<number, OpcionGeografica[]>();
  for (const [codigo, departamento, nombre] of DISTRITOS_GEO) {
    distritos.set(codigo, { departamento, nombre });
    const lista = distritosPorDepartamento.get(departamento) ?? [];
    lista.push({ codigo, nombre });
    distritosPorDepartamento.set(departamento, lista);
  }
  const ciudades = new Map<number, { distrito: number; nombre: string }>();
  const ciudadesPorDistrito = new Map<number, OpcionGeografica[]>();
  for (const [codigo, distrito, nombre] of CIUDADES_GEO) {
    ciudades.set(codigo, { distrito, nombre });
    const lista = ciudadesPorDistrito.get(distrito) ?? [];
    lista.push({ codigo, nombre });
    ciudadesPorDistrito.set(distrito, lista);
  }
  for (const lista of distritosPorDepartamento.values()) lista.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  for (const lista of ciudadesPorDistrito.values()) lista.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  cache = { departamentos, distritos, ciudades, distritosPorDepartamento, ciudadesPorDistrito };
  return cache;
}

/** Los distritos de un departamento, por orden alfabético. */
export function distritosDelDepartamento(codigoDepartamento: number): OpcionGeografica[] {
  return indices().distritosPorDepartamento.get(codigoDepartamento) ?? [];
}

/**
 * Las ciudades y localidades de un distrito, por orden alfabético. Se dejan afuera las de más de 30 caracteres de
 * nombre (casi todas son comunidades indígenas y asentamientos rurales): el documento no admite un nombre más largo.
 */
export function ciudadesDelDistrito(codigoDistrito: number): OpcionGeografica[] {
  return (indices().ciudadesPorDistrito.get(codigoDistrito) ?? []).filter((c) => c.nombre.length <= MAX_NOMBRE_UBICACION);
}

export type Ubicacion = {
  departamentoCodigo: number;
  departamentoNombre: string;
  distritoCodigo: number;
  distritoNombre: string;
  ciudadCodigo: number;
  ciudadNombre: string;
};

export type ResultadoUbicacion = { ok: true; ubicacion: Ubicacion } | { ok: false; error: string };

/**
 * Completa y controla una dirección a partir de la ciudad. El distrito y el departamento se deducen de ella; si
 * además se informaron, tienen que coincidir. Devuelve los nombres oficiales.
 */
export function resolverUbicacion(entrada: {
  departamentoCodigo: number | null;
  distritoCodigo: number | null;
  ciudadCodigo: number | null;
}): ResultadoUbicacion {
  const { departamentos, distritos, ciudades } = indices();
  if (entrada.ciudadCodigo === null) return { ok: false, error: "Falta elegir la ciudad." };

  const ciudad = ciudades.get(entrada.ciudadCodigo);
  if (!ciudad) {
    return { ok: false, error: `El código de ciudad ${entrada.ciudadCodigo} no existe en la tabla oficial de la DNIT (${GEOGRAFIA_ACTUALIZACION}).` };
  }
  const distrito = distritos.get(ciudad.distrito);
  if (!distrito) return { ok: false, error: `La ciudad ${ciudad.nombre} apunta a un distrito que no existe en la tabla.` };
  const departamentoNombre = departamentos.get(distrito.departamento) ?? "";

  if (entrada.distritoCodigo !== null && entrada.distritoCodigo !== ciudad.distrito) {
    const elegido = distritos.get(entrada.distritoCodigo)?.nombre ?? `código ${entrada.distritoCodigo}`;
    return { ok: false, error: `La ciudad ${ciudad.nombre} pertenece al distrito ${distrito.nombre}, no a ${elegido}.` };
  }
  if (entrada.departamentoCodigo !== null && entrada.departamentoCodigo !== distrito.departamento) {
    const elegido = departamentos.get(entrada.departamentoCodigo) ?? `código ${entrada.departamentoCodigo}`;
    return { ok: false, error: `La ciudad ${ciudad.nombre} (distrito ${distrito.nombre}) está en el departamento ${departamentoNombre}, no en ${elegido}.` };
  }
  if (ciudad.nombre.length > MAX_NOMBRE_UBICACION) {
    return { ok: false, error: `El nombre oficial de ${ciudad.nombre} tiene más de ${MAX_NOMBRE_UBICACION} caracteres y el documento no lo admite: elegí otra ciudad del distrito.` };
  }
  if (distrito.nombre.length > MAX_NOMBRE_UBICACION) {
    return { ok: false, error: `El nombre oficial del distrito ${distrito.nombre} tiene más de ${MAX_NOMBRE_UBICACION} caracteres y el documento no lo admite.` };
  }

  return {
    ok: true,
    ubicacion: {
      departamentoCodigo: distrito.departamento,
      departamentoNombre,
      distritoCodigo: ciudad.distrito,
      distritoNombre: distrito.nombre,
      ciudadCodigo: entrada.ciudadCodigo,
      ciudadNombre: ciudad.nombre,
    },
  };
}

/**
 * Los datos del emisor con la dirección completada desde la tabla oficial: si la ciudad ya estaba cargada (a mano, de
 * antes), se rellenan el departamento y el distrito y se ponen los nombres oficiales. Si la ciudad no existe o no
 * cuadra con lo cargado, se devuelven los datos tal cual (el control lo avisa al armar el documento).
 */
export function completarUbicacionEmisor(emisor: DatosEmisor): DatosEmisor {
  if (emisor.ciudadCodigo === null) return emisor;
  const departamento = DEPARTAMENTOS.find((d) => d.clave === emisor.departamento);
  const r = resolverUbicacion({
    departamentoCodigo: departamento?.codigoSifen ?? null,
    distritoCodigo: emisor.distritoCodigo,
    ciudadCodigo: emisor.ciudadCodigo,
  });
  if (!r.ok) return emisor;
  const u = r.ubicacion;
  return {
    ...emisor,
    departamento: DEPARTAMENTOS.find((d) => d.codigoSifen === u.departamentoCodigo)?.clave ?? emisor.departamento,
    distritoCodigo: u.distritoCodigo,
    distrito: u.distritoNombre,
    ciudadCodigo: u.ciudadCodigo,
    ciudad: u.ciudadNombre,
  };
}
