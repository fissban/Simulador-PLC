import { PLC } from "../core/PLC";
import { SCv1 } from "../programs/SCv1";

/**
 * Metadatos de un programa (software) ejecutable sobre el PLC simulado.
 */
export interface ProgramDefinition
{
    /** Identificador único y estable (se usa desde la web/API). */
    id: string;
    /** Nombre legible para mostrar en la interfaz. */
    name: string;
    /** Descripción breve de qué simula el programa. */
    description: string;
    /** Crea una nueva instancia del programa. */
    create: () => PLC;
}

/**
 * ============================================================================
 * ProgramManager
 * ============================================================================
 *
 * Catálogo (registro) de los programas disponibles para ejecutar sobre el PLC
 * simulado. Es un singleton sin estado mutable: solo expone el listado y
 * operaciones de consulta puras.
 *
 * Para agregar un software nuevo:
 *  1) Crear la clase en `plc/programs/` extendiendo `PLC`.
 *  2) Importarla aquí.
 *  3) Añadir una entrada al arreglo `programs`.
 *
 * El resto del sistema (gestor, API y web) lo tomará automáticamente.
 * ============================================================================
 */
class ProgramManager
{
    private readonly programs: ProgramDefinition[] =
    [
        {
            id: "SCv1",
            name: "SCv1 - Señales Analógicas",
            description: "Simula instrumentos analógicos con escalado y alarmas (LOLO/LO/HI/HIHI).",
            create: () => new SCv1()
        }
    ];

    /**
     * Devuelve el catálogo completo de programas disponibles.
     */
    public getAll(): ProgramDefinition[]
    {
        return this.programs;
    }

    /**
     * Devuelve la definición de un programa por su id, o `undefined` si no existe.
     */
    public getById(id: string): ProgramDefinition | undefined
    {
        return this.programs.find((program) => program.id === id);
    }

    /**
     * Devuelve el primer programa del catálogo (el usado por defecto al
     * arrancar), o `undefined` si no hay ninguno registrado.
     */
    public getFirstProgram(): ProgramDefinition | undefined
    {
        return this.programs[0];
    }
}

export const programManager = new ProgramManager();
