import { bufferManager } from "../../memory/BufferManager";

export enum AddresType
{
    C= 'C', // Coil - 1 bit
    HR = 'HR', // Holding Register - 16 bits
    HRF = 'HRF', // Holding Register Float - 32 bits
    B = 'B', // Bit - 1 bit
}

export enum Group
{
    NONE = 'None',
    ANALOGICO = 'Analogico',
    DIGITAL = 'Digital',
    DIRECTO = 'Directo'
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
    private name: string;
    private address: number;
    private addressType: AddresType;

    private group: Group = Group.NONE;

    constructor(name: string, address: number, addressType: AddresType)
    {
        this.name = name;
        this.address = address;
        this.addressType = addressType;

        if (this.name.startsWith("IA"))
        {
            this.group = Group.ANALOGICO;
        }
        else if (this.name.startsWith("ID"))
        {
            this.group = Group.DIGITAL;
        }
        else if (this.name.startsWith("D"))
        {
            this.group = Group.DIRECTO;
        }
    }

    public getAddress(): number
    {
        return this.address;
    }

    public getAddressType(): AddresType
    {
        return this.addressType;
    }

    public getName(): string
    {
        return this.name;
    }

    public getGroup(): Group
    {
        return this.group;
    }

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
