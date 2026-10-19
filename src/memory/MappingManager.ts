import { AddresType, DataModel } from "../plc/core/DataModel";
import { bufferManager } from "./BufferManager";



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
}

class MappingManager
{
    /**
     *  Map<Nombre, Address>
     */
    private mapping: Map<string, DataModel> = new Map();

    /**
     * Agrega un mapeo entre un nombre y una dirección.
     * @param name Nombre de la variable.
     * @param address Dirección asociada.
     */
    public registerMapping(name: string, data: DataModel): void
    {
        this.mapping.set(name, data);
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
        const data = this.mapping.get(name);
        return data ? data.getAddress() : undefined;
    }

    public getValueByName(name: string): number | undefined
    {
        const data = this.mapping.get(name);
        if (!data) return undefined;
        return bufferManager.read(data);
    }

    /**
     * Devuelve un snapshot de todos los mapeos registrados junto con su valor
     * actual leído desde la memoria. Útil para exponer el estado en tiempo real.
     */
    public getAll(): MappingSnapshot[]
    {
        return Array.from(this.mapping.entries()).map(([name, data]) => ({
            name,
            address: data.getAddress(),
            addressType: data.getAddressType(),
            value: data.read(),
            group: data.getGroup()
        }));
    }
}

export const mappingManager = new MappingManager();