import { PLC } from "../core/PLC";
import { programManager, ProgramDefinition } from "./ProgramManager";
import { mappingManager } from "../../memory/MappingManager";
import { bufferManager } from "../../memory/BufferManager";

/**
 * Estado del ciclo del simulador.
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
    /** Si es el programa actualmente seleccionado/cargado. */
    selected: boolean;
    /** Si el programa seleccionado está corriendo (ciclo activo). */
    running: boolean;
}

/**
 * Snapshot del estado completo del simulador.
 */
export interface SimulatorStatus
{
    /** Id del programa seleccionado, o null si no hay ninguno. */
    activeId: string | null;
    /** Nombre legible del programa seleccionado, o null. */
    activeName: string | null;
    /** Si el programa seleccionado está corriendo. */
    running: boolean;
    /** Estado detallado del ciclo: running / paused / stopped. */
    state: SimulatorState;
    /** Catálogo completo de programas con su estado. */
    programs: ProgramStatus[];
}

/**
 * ============================================================================
 * SimulatorManager
 * ============================================================================
 *
 * Gestiona el ciclo de vida del programa (software) que corre sobre el PLC
 * simulado. Permite seleccionar qué programa ejecutar, arrancarlo y pararlo en
 * caliente desde la web/API, manteniendo una única instancia activa a la vez.
 *
 * Al cambiar de programa se limpia la memoria (`bufferManager`) y el mapa de
 * direcciones (`mappingManager`) para no arrastrar estado del programa anterior.
 * ============================================================================
 */
class SimulatorManager
{
    private activeDefinition: ProgramDefinition | null = null;
    private activeInstance: PLC | null = null;
    private state: SimulatorState = "stopped";

    /**
     * Selecciona (carga) un programa por su id. Detiene y descarta el programa
     * anterior, limpia memoria y mapeos, instancia el nuevo y ejecuta su `init()`.
     * No lo arranca automáticamente: usar `start()` para iniciar el ciclo.
     */
    public select(id: string): SimulatorStatus
    {
        const definition = programManager.getById(id);
        if (!definition)
        {
            throw new Error(`Programa desconocido: "${id}"`);
        }

        // Detener el ciclo del programa actual, si lo hay.
        if (this.activeInstance && this.activeInstance.isRunning())
        {
            this.activeInstance.stop();
        }

        // Limpiar estado compartido para empezar desde cero.
        mappingManager.clear();
        bufferManager.clear();

        // Instanciar e inicializar el nuevo programa.
        this.activeDefinition = definition;
        this.activeInstance = definition.create();
        this.activeInstance.init();
        this.state = "stopped";

        console.log(`[Simulator] Programa seleccionado: ${definition.id}`);
        return this.getStatus();
    }

    /**
     * Arranca (o reanuda) el ciclo del programa seleccionado.
     * Lanza error si no hay ninguno.
     */
    public start(): SimulatorStatus
    {
        if (!this.activeInstance)
        {
            throw new Error("No hay ningún programa seleccionado para arrancar.");
        }

        this.activeInstance.run();
        this.state = "running";
        console.log(`[Simulator] Programa en ejecución: ${this.activeDefinition?.id}`);
        return this.getStatus();
    }

    /**
     * Pausa el ciclo del programa: detiene la ejecución pero CONSERVA los
     * valores actuales en memoria (el cliente Modbus los sigue leyendo).
     */
    public pause(): SimulatorStatus
    {
        if (this.activeInstance && this.activeInstance.isRunning())
        {
            this.activeInstance.stop();
            console.log(`[Simulator] Programa pausado: ${this.activeDefinition?.id}`);
        }
        this.state = "paused";
        return this.getStatus();
    }

    /**
     * Detiene por completo el ciclo del programa y RESETEA la memoria a cero.
     * Reinicializa el programa para dejarlo listo para un nuevo arranque.
     */
    public stop(): SimulatorStatus
    {
        if (this.activeInstance && this.activeInstance.isRunning())
        {
            this.activeInstance.stop();
        }

        // Resetear la memoria y re-inicializar el programa activo (si lo hay).
        bufferManager.clear();
        if (this.activeInstance)
        {
            mappingManager.clear();
            this.activeInstance.init();
        }

        this.state = "stopped";
        console.log(`[Simulator] Programa detenido (memoria reseteada): ${this.activeDefinition?.id}`);
        return this.getStatus();
    }

    /**
     * Atajo: selecciona un programa y lo arranca en un solo paso.
     */
    public selectAndStart(id: string): SimulatorStatus
    {
        this.select(id);
        return this.start();
    }

    /**
     * Arranca el programa por defecto (el primero del registro), dejándolo en
     * ejecución. Pensado para el bootstrap del proceso. Si no hay programas
     * registrados, no hace nada y lo registra por consola.
     */
    public startDefault(): SimulatorStatus
    {
        const firstProgram = programManager.getFirstProgram();
        if (!firstProgram)
        {
            console.warn("[Simulator] No hay programas registrados para arrancar.");
            return this.getStatus();
        }

        return this.selectAndStart(firstProgram.id);
    }

    /**
     * Devuelve el estado actual del simulador y el catálogo de programas.
     */
    public getStatus(): SimulatorStatus
    {
        const activeId = this.activeDefinition?.id ?? null;
        const activeName = this.activeDefinition?.name ?? null;
        const running = this.activeInstance?.isRunning() ?? false;

        const programs: ProgramStatus[] = programManager.getAll().map((definition) => ({
            id: definition.id,
            name: definition.name,
            description: definition.description,
            selected: definition.id === activeId,
            running: definition.id === activeId && running
        }));

        return { activeId, activeName, running, state: this.state, programs };
    }
}

export const simulatorManager = new SimulatorManager();
