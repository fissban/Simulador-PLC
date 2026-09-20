import { addressData } from "./data/AddressData";
import { serverConfigData } from "./data/ServerConfigData";
import { simulationProfileData } from "./data/SimulationProfileData";
import { stToJavaScriptManager } from "./simulator/managers/StToJavaScriptManager";
import { stVariableAddressManager } from "./simulator/managers/StVariableAddressManager";
import { startModbusServer } from "./simulator/server";
import { startWebServer } from "./web/server";

/**
 * Flujo de arranque:
 * 1) Carga configuración del servidor desde JSON.
 * 2) Carga perfiles de simulación (overrides por instancia) desde JSON.
 * 3) Carga tabla de direcciones desde JSON (usa los perfiles de simulación al expandir templates).
 * 4) Configura funciones de runtime para registros que las tengan definidas.
 * 5) Levanta servidor web para visualizar registros y valores actuales.
 * 6) Levanta servidor Modbus TCP.
 * 7) Reporta errores de inicialización y termina con código 1.
 */
function main(): void
{
    try
    {
        // Carga de la data necesaria para el server
        serverConfigData.load();
        simulationProfileData.load();
        addressData.load();

        // Configura las funciones de runtime para los registros que las tengan definidas
        stVariableAddressManager.load();
        stToJavaScriptManager.configure();

        // Inicia servidor web para visualizar registros y valores actuales.
        startWebServer();

        // Inicia el servidor Modbus TCP con los registros precargados.
        startModbusServer();
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
