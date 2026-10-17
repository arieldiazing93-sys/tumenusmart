import type { FormEvent } from "react";

/**
 * Para los formularios que mandan sus datos al servidor desde un componente de pantalla: `<form onSubmit={alEnviar(guardar)}>`.
 *
 * Por qué no `<form action={guardar}>`: con `action`, React 19 VACÍA los campos cuando termina el envío, aunque el servidor haya
 * contestado con un error («Elegí en qué almacén queda el stock inicial», «El rendimiento tiene que ser mayor a cero», un corte de
 * internet…). Quien llenó diez campos los perdía todos. Medido con React 19 real: con `action` el campo queda vacío al final; con
 * `onSubmit` conserva lo escrito. La validación del navegador (`required`, `min`…) sigue andando igual: corre antes de `onSubmit`.
 *
 * Consecuencia: ya no se vacía solo después de guardar. Los formularios de alta que quieren quedar limpios lo hacen ellos
 * (`formRef.current?.reset()` al salir bien), y los de edición simplemente siguen mostrando lo guardado.
 */
export function alEnviar(procesar: (datos: FormData) => void) {
  return (evento: FormEvent<HTMLFormElement>) => {
    evento.preventDefault();
    procesar(new FormData(evento.currentTarget));
  };
}
