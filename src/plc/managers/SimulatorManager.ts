import { serverConfigManager } from "../../config/ServerConfigManager";
import { SimulatorInstance, InstanceStatus } from "./SimulatorInstance";
import { programManager } from "./ProgramManager";

/**
 * ============================================================================
 * SimulatorManager
 * ============================================================================
 *
 * Registro de las instancias del simulador definidas en `server-config.json`.
 * Cada instancia tiene su propio programa, memoria y servidor Modbus. Las
 * instancias son fijas: se crean al iniciar el proceso a partir de la
 * configuración.
 * ============================================================================
 */
class SimulatorManager
{
    private readonly instances = new Map<string, SimulatorInstance>();

    /**
     * Crea las instancias de la configuración, abre su servidor Modbus y carga
     * (y arranca, si `autoStart`) su programa. Falla si el programa no existe o
     * algún puerto no puede abrirse.
     */
    public async startAll(): Promise<void>
    {
        const host = serverConfigManager.getHost();

        for (const config of serverConfigManager.getInstances())
        {
            if (!programManager.getById(config.program))
            {
                throw new Error(`La instancia "${config.id}" usa un programa desconocido: "${config.program}"`);
            }

            const instance = new SimulatorInstance(config);
            this.instances.set(instance.id, instance);

            await instance.startModbus(host);
            instance.startConfigured();
        }
    }

    public get(id: string): SimulatorInstance | undefined
    {
        return this.instances.get(id);
    }

    public getAll(): SimulatorInstance[]
    {
        return Array.from(this.instances.values());
    }

    public getAllStatus(): InstanceStatus[]
    {
        return this.getAll().map((instance) => instance.getStatus());
    }
}

export const simulatorManager = new SimulatorManager();
