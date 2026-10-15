import { bufferManager } from "../../memory/BufferManager";

export enum AddresType
{
    C, // Coil - 1 bit
    HR, // Holding Register - 16 bits
    HRF, // Holding Register Float - 32 bits
    B, // Bit - 1 bit
}

/**
 * Representa una dirección de memoria del simulador junto con su tipo de dato.
 *
 * Además de almacenar la dirección y el tipo, expone métodos de alto nivel
 * `read()` / `write()` que delegan en el singleton `bufferManager` para acceder
 * a la memoria real. De esta forma, el acceso a datos queda orientado a objetos
 * (`variable.read()` / `variable.write(valor)`), mientras que la lógica de
 * lectura/escritura sobre los buffers sigue centralizada en `BufferManager`.
 */
export class DataModel
{
    constructor(
        public address: number,
        public type: AddresType
    ) { }

    /**
     * Lee el valor asociado a esta dirección de memoria.
     * - Si `bit` se informa para un `HR`, devuelve el valor del bit solicitado (0/1).
     * - Si no se informa `bit`, devuelve el valor completo según el tipo de dato.
     */
    public read(bit?: number): number
    {
        return bufferManager.read(this, bit);
    }

    /**
     * Escribe un valor en esta dirección respetando el tipo de dato.
     * Para `B` y `C` cualquier valor mayor a cero se interpreta como activo.
     */
    public write(value: number): void
    {
        bufferManager.write(this, value);
    }
}
