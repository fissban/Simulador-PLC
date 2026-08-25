import { readFileSync } from 'fs';
import path from 'path';
import { simulationProfileData } from './SimulationProfileData';

interface AddressTable
{
    registers: AddressRegister[];
    registerTemplates?: RegisterTemplate[];
}

export type RegisterGroup = "analogicos" | "digitales" | "directos";

export enum RegisterTypes
{
    // Bit R/W (FC 1/5/15). Ej: salidas digitales, relés, flags de control.
    COIL = "COIL",
    // Word 16 bits R/W (FC 3/6/16). Sin signo (0–65535) o con signo (−32768–32767) según interprete el cliente. Ej: setpoints, parámetros de configuración.     
    HOLDING_REGISTER = "HOLDING_REGISTER",
    // Float 32 bits IEEE 754 en 2 holding registers consecutivos (word alto + word bajo). Ej: temperaturas, presiones con decimales.
    HOLDING_REGISTER_FLOAT = "HOLDING_REGISTER_FLOAT",
    // Bit individual dentro de un HOLDING_REGISTER (requiere "bit", 0-15). Ej: banderas de alarma empaquetadas en un word de estado.
    HOLDING_REGISTER_BIT = "HOLDING_REGISTER_BIT"
    // Bit solo lectura (FC 2). Ej: entradas digitales, sensores on/off.
    // DISCRETE_INPUT = "DISCRETE_INPUT",    
    // Word 16 bits solo lectura (FC 4). Sin signo (0–65535) o con signo (−32768–32767) según interprete el cliente. Ej: mediciones de sensores.
    // INPUT_REGISTER = "INPUT_REGISTER",
}

export interface AddressRegister
{
    address: number;
    type: RegisterTypes;
    group: RegisterGroup;
    name: string;
    value: number | boolean;
    description?: string;
    writable?: boolean;
    runtimeFunction?: string;
    expression?: string;
    /** Índice de bit (0-15) usado solo cuando type es HOLDING_REGISTER_BIT. */
    bit?: number;
}

interface RegisterTemplate
{
    type: RegisterTypes;
    group: RegisterGroup;
    startAddress: number;
    step: number;
    count: number;
    name: string;
    defaultValue: number | boolean;
    description?: string;
    writable?: boolean;
    runtimeFunction?: string;
    expression?: string;
    /** Índice de bit (0-15) usado solo cuando type es HOLDING_REGISTER_BIT. */
    bit?: number;
}

class AddressData
{
    private table: Map<string, AddressRegister> = new Map();

    public constructor()
    {
        //
    }

    private parseFileJSON<T>(path: string): T
    {
        const table = readFileSync(path, 'utf-8').replace(/^\uFEFF/, '');
        return JSON.parse(table);
    }

    public load(): void
    {
        try
        {
            const addressTablePath = path.resolve(__dirname, '../../config/address-table.json');
            const table = this.parseFileJSON<AddressTable>(addressTablePath);

            // Cargar registros individuales
            for (const register of table.registers)
            {
                // se valida si el registro ya existe en la tabla antes de agregarlo
                if (this.table.has(register.name))
                {
                    console.warn(`[AddressData][WARN] Registro duplicado: ${register.name}. Se omite.`);
                    continue;
                }
                this.table.set(register.name, register);
            }
            // Cargar registros a partir de plantillas
            for (const template of table.registerTemplates || [])
            {
                for (let i = 0; i < template.count; i++)
                {
                    const templateIndex = i + 1;
                    const templateIndexText = String(templateIndex);
                    const templateName = template.name.replaceAll('{n}', templateIndexText);
                    const templateDescription = template.description?.replaceAll('{n}', templateIndexText);
                    const templateExpression = template.expression?.replaceAll('{n}', templateIndexText);

                    // Override puntual por instancia (ej: función de simulación o valor fijo distinto por instrumento)
                    const override = simulationProfileData.getOverride(template.name, templateIndex);

                    const register: AddressRegister = {
                        address: template.startAddress + i * template.step,
                        type: template.type,
                        group: template.group,
                        name: templateName,
                        value: override?.value ?? template.defaultValue,
                        description: templateDescription,
                        writable: template.writable,
                        runtimeFunction: override?.runtimeFunction ?? template.runtimeFunction,
                        expression: templateExpression,
                        bit: template.bit
                    };

                    // se valida si el registro ya existe en la tabla antes de agregarlo
                    if (this.table.has(register.name))
                    {
                        console.warn(`[AddressData][WARN] Registro duplicado: ${register.name}. Se omite.`);
                        continue;
                    }
                    this.table.set(register.name, register);
                }
            }

            console.log(`[AddressData] Registros cargados: ${this.table.size}`);
        }
        catch (error)
        {
            console.error("[AddressData][ERROR] No se pudo cargar la tabla de direcciones:", error);
        }
    }

    public getByName(name: string): AddressRegister | undefined
    {
        return this.table.get(name);
    }

    public getAll(): AddressRegister[]
    {
        return Array.from(this.table.values());
    }
}

export const addressData = new AddressData();