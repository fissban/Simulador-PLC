import net from "net";
import * as jsmodbus from "jsmodbus";
import type { BufferManager } from "../../memory/BufferManager";

/**
 * Handle de un servidor Modbus en ejecución.
 */
export interface ModbusServerHandle
{
    close(): Promise<void>;
}

/**
 * Inicia un servidor Modbus TCP sobre la memoria de UNA instancia del simulador.
 * Cada instancia levanta el suyo en un puerto propio.
 *
 * Implementado con `jsmodbus`, que es estable como servidor TCP y maneja
 * correctamente múltiples peticiones concurrentes/encadenadas (a diferencia de
 * `modbus-serial`, que cerraba el socket y provocaba cortes intermitentes de
 * calidad en Ignition: BAD_NOTCONNECTED / DISCONNECTED / TIMEOUT).
 *
 * Clave del diseño: `jsmodbus` lee y escribe DIRECTAMENTE sobre los buffers que
 * se le pasan. Compartimos los mismos buffers del `BufferManager` de la instancia, de modo que:
 *  - Lo que escribe el simulador se ve al instante desde el cliente Modbus.
 *  - Lo que escribe el cliente Modbus se ve al instante en el simulador.
 *
 * Mapeo de áreas:
 *  - Holding Registers (FC03/06/16) -> `hrBuffer`
 *  - Input Registers   (FC04)       -> `hrBuffer` (misma memoria)
 *  - Coils             (FC01/05/15) -> `coilsBuffer` (bit-packed)
 *  - Discrete Inputs   (FC02)       -> `coilsBuffer` (misma memoria)
 */
export function startModbusServer(label: string, buffer: BufferManager, host: string, port: number): Promise<ModbusServerHandle>
{
    // Servidor TCP de Node sobre el que corre el servidor Modbus.
    const netServer = new net.Server();

    // Sockets abiertos, para poder cerrarlos al detener el servidor.
    const sockets = new Set<net.Socket>();
    netServer.on("connection", (socket) =>
    {
        sockets.add(socket);
        socket.on("close", () => sockets.delete(socket));
    });

    // Se comparten los buffers de bufferManager (sin copias) para lectura/escritura en vivo.
    const options =
    {
        holding: buffer.hrBuffer,
        input: buffer.hrBuffer,
        coils: buffer.coilsBuffer,
        discrete: buffer.coilsBuffer
    };

    // @ts-ignore: la forma `jsmodbus.server.TCP` existe en runtime.
    const server = new jsmodbus.server.TCP(netServer, options);

    // Log por cliente conectado (ej. Ignition) para diagnosticar cortes.
    server.on("connection", (client: any) =>
    {
        const socket = client?._socket ?? client?.socket;
        const peer = socket?.remoteAddress ? `${socket.remoteAddress}:${socket.remotePort}` : "desconocido";
        console.log(`[Modbus:${label}] Cliente conectado: ${peer}`);

        client?.on?.("error", (err: Error) => console.error(`[Modbus:${label}] Error con ${peer}:`, err.message));
    });

    return new Promise<ModbusServerHandle>((resolve, reject) =>
    {
        // Error al abrir el puerto (ej. EADDRINUSE): se rechaza para que el arranque informe cuál falló.
        const onListenError = (error: Error) =>
            reject(new Error(`[Modbus:${label}] No se pudo abrir ${host}:${port}: ${error.message}`));
        netServer.once("error", onListenError);

        netServer.listen(port, host, () =>
        {
            netServer.off("error", onListenError);

            // Errores posteriores del servidor TCP (no deben tumbar el proceso).
            netServer.on("error", (error: Error) =>
            {
                console.error(`[Modbus:${label}][ERROR] Error del servidor TCP:`, error.message);
            });

            console.log(`[Modbus:${label}] Servidor TCP iniciado en ${host}:${port}`);

            resolve({
                close: () => new Promise<void>((done) =>
                {
                    netServer.close(() => done());
                    // Cierra también las conexiones abiertas para liberar el puerto.
                    for (const socket of sockets) socket.destroy();
                })
            });
        });
    });
}


