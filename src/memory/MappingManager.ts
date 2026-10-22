import { AddresType, DataModel } from "../plc/core/DataModel";
import { bufferManager } from "./BufferManager";

export interface InstrumentMapping
{
    number: number;
    field: string;
    alarmBits?: Record<string, number>;
    bits?: Record<string, number>;
}

/**
 * Snapshot de un mapeo registrado, pensado para exponerlo hacia la web.
 */
export interface MappingSnapshot
{
    name: string;
    address: number;
    addressType: AddresType;
    value: number;
    group: string;
    instrument?: InstrumentMapping;
}

class MappingManager
{
    /**
     * Mapeos y metadatos registrados por nombre.
     */
    private mapping: Map<string, { data: DataModel; instrument?: InstrumentMapping }> = new Map();

    /**
     * Agrega un mapeo entre un nombre y una dirección.
     * @param name Nombre de la variable.
     * @param data Dirección asociada.
     * @param instrument Instrumento y campo representados por el mapeo.
     */
    public registerMapping(name: string, data: DataModel, instrument?: InstrumentMapping): void
    {
        this.mapping.set(data.getName(), { data, instrument });
    }

    /**
     * Elimina todos los mapeos registrados.
     * Útil al cambiar de programa simulado para empezar con un mapa limpio.
     */
    public clear(): void
    {
        this.mapping.clear();
    }

    /**
     * Obtiene la dirección asociada a un nombre.
     * @param name Nombre de la variable.
     * @returns Dirección asociada o `undefined` si no existe.
     */
    public getAddressByName(name: string): number | undefined
    {
        return this.mapping.get(name)?.data.getAddress();
    }

    public getValueByName(name: string): number | undefined
    {
        const entry = this.mapping.get(name);
        if (!entry) return undefined;
        return bufferManager.read(entry.data);
    }

    /**
     * Devuelve un snapshot de todos los mapeos registrados junto con su valor
     * actual leído desde la memoria. Útil para exponer el estado en tiempo real.
     */
    public getAll(): MappingSnapshot[]
    {
        return Array.from(this.mapping.entries()).map(([name, { data, instrument }]) => ({
            name,
            address: data.getAddress(),
            addressType: data.getAddressType(),
            value: data.read(),
            group: data.getGroup(),
            instrument
        }));
    }
}

export const mappingManager = new MappingManager();