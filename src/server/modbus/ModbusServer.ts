import net from "net";
import * as jsmodbus from "jsmodbus";
import { serverConfigManager } from "../../config/ServerConfigManager";
import { bufferManager } from "../../memory/BufferManager";

/**
 * Inicia el servidor Modbus TCP usando la memoria actual del PLC simulado.
 *
 * Implementado con `jsmodbus`, que es estable como servidor TCP y maneja
 * correctamente múltiples peticiones concurrentes/encadenadas (a diferencia de
 * `modbus-serial`, que cerraba el socket y provocaba cortes intermitentes de
 * calidad en Ignition: BAD_NOTCONNECTED / DISCONNECTED / TIMEOUT).
 *
 * Clave del diseño: `jsmodbus` lee y escribe DIRECTAMENTE sobre los buffers que
 * se le pasan. Compartimos los mismos buffers de `bufferManager`, de modo que:
 *  - Lo que escribe el simulador se ve al instante desde el cliente Modbus.
 *  - Lo que escribe el cliente Modbus se ve al instante en el simulador.
 *
 * Mapeo de áreas:
 *  - Holding Registers (FC03/06/16) -> `hrBuffer`
 *  - Input Registers   (FC04)       -> `hrBuffer` (misma memoria)
 *  - Coils             (FC01/05/15) -> `coilsBuffer` (bit-packed)
 *  - Discrete Inputs   (FC02)       -> `coilsBuffer` (misma memoria)
 */
export function startModbusServer(): void
{
    const host = serverConfigManager.getHost() ?? "0.0.0.0";
    const port = serverConfigManager.getPort() ?? 502;

    // Servidor TCP de Node sobre el que corre el servidor Modbus.
    const netServer = new net.Server();

    // Se comparten los buffers de bufferManager (sin copias) para lectura/escritura en vivo.
    const options =
    {
        holding: bufferManager.hrBuffer,
        input: bufferManager.hrBuffer,
        coils: bufferManager.coilsBuffer,
        discrete: bufferManager.coilsBuffer
    };

    // @ts-ignore: la forma `jsmodbus.server.TCP` existe en runtime.
    const server = new jsmodbus.server.TCP(netServer, options);

    // Log por cliente conectado (ej. Ignition) para diagnosticar cortes.
    server.on("connection", (client: any) =>
    {
        const socket = client?._socket ?? client?.socket;
        const peer = socket?.remoteAddress ? `${socket.remoteAddress}:${socket.remotePort}` : "desconocido";
        console.log(`[Modbus] Cliente conectado: ${peer}`);

        client?.on?.("error", (err: Error) => console.error(`[Modbus] Error con ${peer}:`, err.message));
    });

    // Errores a nivel del servidor TCP (no deben tumbar el proceso).
    netServer.on("error", (error: Error) =>
    {
        console.error("[Modbus][ERROR] Error del servidor TCP:", error.message);
    });

    // Inicio de la escucha en el host/puerto configurados.
    netServer.listen(port, host, () =>
    {
        console.log(`[Modbus] Servidor TCP iniciado en ${host}:${port}`);
    });
}


