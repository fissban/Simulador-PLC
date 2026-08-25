import { readFileSync } from 'fs';
import path from 'path';

interface AddressTable
{
    registers: AddressRegister[];
    registerTemplates?: RegisterTemplate[];
}

export enum RegisterTypes
{
    // Bit R/W (FC 1/5/15). Ej: salidas digitales, relés, flags de control.
    COIL = "COIL",
    // Word 16 bits R/W (FC 3/6/16). Sin signo (0–65535) o con signo (−32768–32767) según interprete el cliente. Ej: setpoints, parámetros de configuración.     
    HOLDING_REGISTER = "HOLDING_REGISTER",
    // Float 32 bits IEEE 754 en 2 holding registers consecutivos (word alto + word bajo). Ej: temperaturas, presiones con decimales.
    HOLDING_REGISTER_FLOAT = "HOLDING_REGISTER_FLOAT"
    // Bit solo lectura (FC 2). Ej: entradas digitales, sensores on/off.
    // DISCRETE_INPUT = "DISCRETE_INPUT",    
    // Word 16 bits solo lectura (FC 4). Sin signo (0–65535) o con signo (−32768–32767) según interprete el cliente. Ej: mediciones de sensores.
    // INPUT_REGISTER = "INPUT_REGISTER",
}

export interface AddressRegister
{
    address: number;
    type: RegisterTypes;
    name: string;
    value: number | boolean;
    description?: string;
    writable?: boolean;
    runtimeFunction?: string;
    expression?: string;
}

interface RegisterTemplate
{
    type: RegisterTypes;
    startAddress: number;
    step: number;
    count: number;
    name: string;
    defaultValue: number | boolean;
    description?: string;
    writable?: boolean;
    runtimeFunction?: string;
    expression?: string;
}

class AddressData
{
    private table: Map<string, AddressRegister> = new Map();

    public constructor()
    {
        //
    }

    private parseFileJSON(path: string): AddressTable
    {
        const table = readFileSync(path, 'utf-8');
        return JSON.parse(table);
    }

    public load(): void
    {
        try
        {
            const addressTablePath = path.resolve(__dirname, '../../config/address-table.json');
            const table = this.parseFileJSON(addressTablePath);

            // Cargar registros individuales
            for (const register of table.registers)
            {
                // se valida si el registro ya existe en la tabla antes de agregarlo
                if (this.table.has(register.name))
                {
                    console.warn(`Registro duplicado: ${register.name}. Se omite.`);
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

                    const register: AddressRegister = {
                        address: template.startAddress + i * template.step,
                        type: template.type,
                        name: templateName,
                        value: template.defaultValue,
                        description: templateDescription,
                        writable: template.writable,
                        runtimeFunction: template.runtimeFunction,
                        expression: templateExpression
                    };

                    // se valida si el registro ya existe en la tabla antes de agregarlo
                    if (this.table.has(register.name))
                    {
                        console.warn(`Registro duplicado: ${register.name}. Se omite.`);
                        continue;
                    }
                    this.table.set(register.name, register);
                }
            }

            console.log("AddressData -> Se cargaron registros:", this.table.size);
        }
        catch (error)
        {
            console.error("Error al cargar la tabla de direcciones:", error);
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