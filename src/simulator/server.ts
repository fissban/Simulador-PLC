import ModbusRTU from "modbus-serial";
import { serverConfigData } from "./../data/ServerConfigData";
import { bufferManager } from "./managers/BufferManager";

/**
 * Inicia el servidor Modbus TCP usando la memoria actual del PLC simulado.
 *
 * - Usa `host`, `port` y `unitId` desde el JSON.
 * - Si no vienen definidos, aplica defaults: `0.0.0.0`, `502`, `1`.
 */
export function startModbusServer(): void
{

    // "vector" define los handlers que el servidor Modbus invoca en lecturas/escrituras.
    const vector =
    {
        getCoil: (addr: number): boolean => { return bufferManager.getCoil(addr); },
        setCoil: (addr: number, value: boolean): void => { bufferManager.setCoil(addr, value); },
        getHoldingRegister: (addr: number): number => { return bufferManager.getInt16(addr); },
        setRegister: (addr: number, value: number): void => { bufferManager.setInt16(addr, value); }
    };

    const serverData =
    {
        host: serverConfigData.getHost() ?? "0.0.0.0",
        port: serverConfigData.getPort() ?? 502,
        unitID: serverConfigData.getUnitId() ?? 1,
        debug: false
    };

    // @ts-ignore: Ignorar error de tipado al instanciar ServerTCP
    // Runtime sí expone ServerTCP en modbus-serial; este comentario evita falso positivo de typings.
    const server = new ModbusRTU.ServerTCP(vector, serverData);

    // Error de red a nivel socket TCP.
    server.on("socketError", (error: Error) =>
    {
        console.error("[Modbus][ERROR] Error de socket:", error.message);
    });
    // Error genérico del servidor Modbus.
    server.on("error", (error: Error) =>
    {
        console.error("[Modbus][ERROR] Error del servidor:", error.message);
    });

    // Evento de inicialización del servidor Modbus TCP.
    server.on("initialized", function ()
    {
        console.log(`[Modbus] Servidor TCP iniciado en ${serverData.host}:${serverData.port}`);
    });


}


