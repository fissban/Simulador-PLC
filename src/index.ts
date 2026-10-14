import { serverConfigData } from "./data/ServerConfigData";
import { startModbusServer } from "./simulator/server";
import { startWebServer } from "./web/server";
import { SCv1 } from "./simulator/scripts/softs/SCv1";

/**
 * Flujo de arranque:
 * 1) Carga configuración del servidor desde JSON.
 * 2) Levanta servidor web para visualizar el estado actual.
 * 3) Levanta servidor Modbus TCP.
 * 4) Reporta errores de inicialización y termina con código 1.
 */
function main(): void
{
    try
    {
        // Carga de la configuración necesaria para el server.
        serverConfigData.load();

        // Inicia servidor web para visualizar el estado actual.
        startWebServer();

        // Inicia el servidor Modbus TCP.
        startModbusServer();

        let soft = new SCv1();
        soft.init();
        soft.run();
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
