import { serverConfigManager } from "./config/ServerConfigManager";
import { startWebServer } from "./server/web/WebServer";
import { simulatorManager } from "./plc/managers/SimulatorManager";

/**
 * Flujo de arranque:
 * 1) Carga y valida la configuración (`config/server-config.json`).
 * 2) Levanta el servidor web (API + UI) para visualizar todas las instancias.
 * 3) Por cada instancia definida: abre su servidor Modbus TCP y arranca su programa.
 * 4) Ante un error de inicialización informa y termina con código 1.
 */
async function main(): Promise<void>
{
    try
    {
        serverConfigManager.load();
        startWebServer();
        await simulatorManager.startAll();
    }
    catch (error)
    {
        console.error("[Bootstrap][ERROR] No se pudo iniciar el simulador:", error instanceof Error ? error.message : error);
        process.exit(1);
    }
}

// Apagado ordenado: detiene los ciclos y libera los puertos Modbus.
async function shutdown(signal: string): Promise<void>
{
    console.log(`[Bootstrap] ${signal} recibido, deteniendo instancias...`);
    await Promise.all(simulatorManager.getAll().map((instance) => instance.shutdown()));
    process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

void main();
