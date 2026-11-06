import { PLC } from "../core/PLC";
import { programManager } from "./ProgramManager";
import { MappingManager, MappingSnapshot } from "../../memory/MappingManager";
import { BufferManager } from "../../memory/BufferManager";
import { startModbusServer, ModbusServerHandle } from "../../server/modbus/ModbusServer";
import type { InstanceConfig } from "../../config/ServerConfigManager";

/**
 * Estado del ciclo de una instancia.
 * - `running`: el ciclo está ejecutándose.
 * - `paused` : ciclo detenido, pero la memoria conserva los últimos valores.
 * - `stopped`: ciclo detenido y memoria reseteada a cero.
 */
export type SimulatorState = "running" | "paused" | "stopped";

/**
 * Estado de un programa tal como se expone hacia la web/API.
 */
export interface ProgramStatus
{
    id: string;
    name: string;
    description: string;
    /** Si es el programa actualmente seleccionado/cargado en la instancia. */
    selected: boolean;
    /** Si el programa seleccionado está corriendo (ciclo activo). */
    running: boolean;
}

/**
 * Snapshot del estado completo de una instancia.
 */
export interface InstanceStatus
{
    /** Identificador de la instancia. */
    id: string;
    /** Nombre legible de la instancia. */
    name: string;
    /** Puerto Modbus TCP de la instancia. */
    port: number;
    /** Id del programa seleccionado, o null si no hay ninguno. */
    activeId: string | null;
    /** Nombre legible del programa seleccionado, o null. */
    activeName: string | null;
    /** Si el programa seleccionado está corriendo. */
    running: boolean;
    /** Estado detallado del ciclo: running / paused / stopped. */
    state: SimulatorState;
    /** Catálogo completo de programas con su estado en esta instancia. */
    programs: ProgramStatus[];
}

/**
 * ============================================================================
 * SimulatorInstance
 * ============================================================================
 *
 * Un "PLC simulado" completo: memoria propia (`BufferManager`), mapa de
 * direcciones propio (`MappingManager`), un programa en ejecución y un servidor
 * Modbus TCP en su propio puerto. Varias instancias conviven en el mismo
 * proceso sin compartir estado.
 *
 * El programa inicial lo define la configuración, pero se puede cambiar en
 * caliente con `select()`.
 * ============================================================================
 */
export class SimulatorInstance
{
    public readonly id: string;
    public readonly name: string;
    public readonly port: number;

    private readonly buffer = new BufferManager();
    private readonly mapping = new MappingManager();

    private readonly config: InstanceConfig;
    private activeProgramId: string | null = null;
    private activeInstance: PLC | null = null;
    private state: SimulatorState = "stopped";
    private modbus: ModbusServerHandle | null = null;

    constructor(config: InstanceConfig)
    {
        this.config = config;
        this.id = config.id;
        this.name = config.name ?? config.id;
        this.port = config.port;
    }

    /**
     * Abre el servidor Modbus de la instancia. Rechaza si el puerto no está disponible.
     */
    public async startModbus(host: string): Promise<void>
    {
        if (this.modbus) return;
        this.modbus = await startModbusServer(this.id, this.buffer, host, this.port);
    }

    /**
     * Detiene el ciclo y cierra el servidor Modbus.
     */
    public async shutdown(): Promise<void>
    {
        this.activeInstance?.stop();
        await this.modbus?.close();
        this.modbus = null;
    }

    /**
     * Selecciona (carga) un programa por su id. Detiene y descarta el programa
     * anterior, limpia memoria y mapeos, instancia el nuevo y ejecuta su `init()`.
     * No lo arranca automáticamente: usar `start()` para iniciar el ciclo.
     */
    public select(programId: string): InstanceStatus
    {
        const definition = programManager.getById(programId);
        if (!definition)
        {
            throw new Error(`Programa desconocido: "${programId}"`);
        }

        this.activeInstance?.stop();

        // Limpiar el estado de ESTA instancia para empezar desde cero.
        this.mapping.clear();
        this.buffer.clear();

        this.activeProgramId = definition.id;
        this.activeInstance = definition.create({ buffer: this.buffer, mapping: this.mapping }, this.config.scanIntervalMs);
        this.activeInstance.init();
        this.state = "stopped";

        console.log(`[Simulator:${this.id}] Programa seleccionado: ${definition.id}`);
        return this.getStatus();
    }

    /**
     * Arranca (o reanuda) el ciclo del programa seleccionado.
     */
    public start(): InstanceStatus
    {
        if (!this.activeInstance)
        {
            throw new Error("No hay ningún programa seleccionado para arrancar.");
        }

        this.activeInstance.run();
        this.state = "running";
        console.log(`[Simulator:${this.id}] Programa en ejecución: ${this.activeProgramId}`);
        return this.getStatus();
    }

    /**
     * Pausa el ciclo: detiene la ejecución pero CONSERVA los valores en memoria.
     */
    public pause(): InstanceStatus
    {
        if (this.activeInstance?.isRunning())
        {
            this.activeInstance.stop();
            console.log(`[Simulator:${this.id}] Programa pausado: ${this.activeProgramId}`);
        }
        this.state = "paused";
        return this.getStatus();
    }

    /**
     * Detiene el ciclo y RESETEA la memoria. Reinicializa el programa para dejarlo
     * listo para un nuevo arranque.
     */
    public stop(): InstanceStatus
    {
        this.activeInstance?.stop();

        this.buffer.clear();
        if (this.activeInstance)
        {
            this.mapping.clear();
            this.activeInstance.init();
        }

        this.state = "stopped";
        console.log(`[Simulator:${this.id}] Programa detenido (memoria reseteada): ${this.activeProgramId}`);
        return this.getStatus();
    }

    public selectAndStart(programId: string): InstanceStatus
    {
        this.select(programId);
        return this.start();
    }

    /**
     * Carga el programa definido en la configuración y lo arranca si `autoStart`.
     */
    public startConfigured(): InstanceStatus
    {
        return this.config.autoStart
            ? this.selectAndStart(this.config.program)
            : this.select(this.config.program);
    }

    /**
     * Mapeos registrados con su valor actual leído de la memoria de la instancia.
     */
    public getMappings(): MappingSnapshot[]
    {
        return this.mapping.getAll();
    }

    public getStatus(): InstanceStatus
    {
        const running = this.activeInstance?.isRunning() ?? false;
        const activeDefinition = this.activeProgramId ? programManager.getById(this.activeProgramId) : undefined;

        const programs: ProgramStatus[] = programManager.getAll().map((definition) => ({
            id: definition.id,
            name: definition.name,
            description: definition.description,
            selected: definition.id === this.activeProgramId,
            running: definition.id === this.activeProgramId && running
        }));

        return {
            id: this.id,
            name: this.name,
            port: this.port,
            activeId: this.activeProgramId,
            activeName: activeDefinition?.name ?? null,
            running,
            state: this.state,
            programs
        };
    }
}
