import ModbusRTU from "modbus-serial";
import { serverConfigData } from "./../data/ServerConfigData";
import { addressData, RegisterTypes } from "./../data/AddressData";
import { bufferManager } from "./managers/BufferManager";
import { expressionManager } from "./managers/ExpressionManager";
import { runtimeFunctionManager } from "./managers/RuntimeFunctionManager";

/**
 * Inicia el servidor Modbus TCP usando la tabla de direcciones del PLC simulado.
 *
 * - Usa `host`, `port` y `unitId` desde el JSON.
 * - Si no vienen definidos, aplica defaults: `0.0.0.0`, `502`, `1`.
 */
export function startModbusServer(): void
{

    // ============================================================================
    // INICIALIZACIÓN DE MEMORIA DESDE ADDRESSDATA
    // ============================================================================
    function initBuffersFromAddressData(): void
    {
        const registers = addressData.getAll();

        for (const reg of registers)
        {
            switch (reg.type)
            {
                case RegisterTypes.COIL:
                    bufferManager.setCoil(reg.address, Boolean(reg.value));
                    break;

                case RegisterTypes.HOLDING_REGISTER:
                    bufferManager.setInt16(reg.address, Number(reg.value));
                    break;

                case RegisterTypes.HOLDING_REGISTER_FLOAT:
                    bufferManager.setFloat32(reg.address, Number(reg.value));
                    break;

                default:
                    console.warn(`[Init] Tipo no soportado o no reconocido (${reg.type}) en dir ${reg.address}`);
            }
        }

        console.log(`[Init] Memoria cargada exitosamente con ${registers.length} registros.`);
    }
    // ============================================================================
    // MÉTODOS HELPER (GET / SET) PARA EL BUFFER
    // ============================================================================

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
        console.error("Error de socket Modbus:", error.message);
    });
    // Error genérico del servidor Modbus.
    server.on("error", (error: Error) =>
    {
        console.error("Error del servidor Modbus:", error.message);
    });

    // Evento de inicialización del servidor Modbus TCP.
    server.on("initialized", function ()
    {
        console.log(`Servidor Modbus TCP iniciado en ${serverData.host}:${serverData.port}`);
        // Cargar la tabla antes de iniciar el servidor
        initBuffersFromAddressData();
        
        setInterval(() =>
        {
            // Ejecutar funciones de runtime para actualizar registros según sus expresiones definidas
            runtimeFunctionManager.execute();
            expressionManager.execute();
            
            // Aquí podrías agregar más lógica si es necesario, como logging o validaciones adicionales

        }, serverConfigData.getUpdateEveryMs());
    });


}


