import { serverConfigManager } from "./config/ServerConfigManager";
import { startModbusServer } from "./server/modbus/ModbusServer";
import { startWebServer } from "./server/web/WebServer";
import { simulatorManager } from "./plc/managers/SimulatorManager";

/**
 * Flujo de arranque:
 * 1) Carga configuración del servidor desde JSON.
 * 2) Levanta servidor web para visualizar el estado actual.
 * 3) Levanta servidor Modbus TCP.
 * 4) Arranca el programa de simulación del PLC.
 * 5) Reporta errores de inicialización y termina con código 1.
 */
function main(): void
{
    try
    {
        // Carga de la configuración necesaria para el server.
        serverConfigManager.load();

        // Inicia servidor web para visualizar el estado actual.
        startWebServer();

        // Inicia el servidor Modbus TCP.
        startModbusServer();

        // Inicia el programa de simulación del PLC.
        simulatorManager.startDefault();
    }
    catch (error)
    {
        if (error instanceof Error)
        {
            console.error("[Bootstrap][ERROR] No se pudo iniciar el simulador:", error.message);
            process.exit(1);
        }

        console.error("[Bootstrap][ERROR] Error desconocido al iniciar el simulador.");
        process.exit(1);
    }
}

main();
