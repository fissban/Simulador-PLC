import { addressData } from "./data/AddressData";
import { serverConfigData } from "./data/ServerConfigData";
import { expressionManager } from "./simulator/managers/ExpressionManager";
import { runtimeFunctionManager } from "./simulator/managers/RuntimeFunctionManager";
import { startModbusServer } from "./simulator/server";
import { startWebServer } from "./web/server";

/**
 * Flujo de arranque:
 * 1) Carga tabla de direcciones desde JSON.
 * 2) Carga configuración del servidor desde JSON.
 * 3) Configura funciones de runtime para registros que las tengan definidas.
 * 4) Levanta servidor web para visualizar registros y valores actuales.
 * 5) Levanta servidor Modbus TCP.
 * 6) Reporta errores de inicialización y termina con código 1.
 */
function main(): void
{
    try
    {
        // Carga de la data necesaria para el server
        addressData.load();
        serverConfigData.load();

        // Configura las funciones de runtime para los registros que las tengan definidas
        runtimeFunctionManager.configure();
        expressionManager.configure();

        // Inicia servidor web para visualizar registros y valores actuales.
        startWebServer();

        // Inicia el servidor Modbus TCP con los registros precargados.
        startModbusServer();
    }
    catch (error)
    {
        if (error instanceof Error)
        {
            console.error("No se pudo iniciar el simulador:", error.message);
            process.exit(1);
        }

        console.error("Error desconocido al iniciar el simulador.");
        process.exit(1);
    }
}

main();
