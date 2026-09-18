declare module "qz-tray" {
  const qz: {
    websocket: {
      connect(opciones?: { retries?: number; delay?: number }): Promise<void>;
      isActive(): boolean;
    };
    security: {
      setSignatureAlgorithm(algoritmo: string): void;
      setSignaturePromise(
        promesa: (
          aFirmar: string
        ) => (resolve: (firma: string) => void, reject: (error: unknown) => void) => void
      ): void;
      setCertificatePromise(
        promesa: (resolve: (cert: string) => void, reject: (error: unknown) => void) => void
      ): void;
    };
    printers: { find(consulta?: string): Promise<string[]> };
    configs: { create(impresora: string, opciones?: Record<string, unknown>): unknown };
    print(config: unknown, data: unknown[]): Promise<void>;
  };
  export default qz;
}
