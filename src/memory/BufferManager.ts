import { AddresType, DataModel } from "../plc/core/DataModel";

/**
 * ============================================================================
 * BufferManager
 * ============================================================================
 *
 * Gestiona la memoria del simulador PLC como una capa unificada basada en
 * `Buffer` de Node.js, emulando el almacenamiento de datos de un dispositivo
 * Modbus. Centraliza toda la lectura y escritura de datos, garantizando que
 * los accesos se realicen dentro de los límites de memoria definidos.
 *
 * Áreas de memoria:
 *  - COILS: salidas digitales booleanas (1 byte por coil para acceso rápido).
 *  - HOLDING REGISTERS (HR): bloque continuo de registros de 16 bits
 *    (2 bytes por registro), sobre el que se interpretan distintos tipos de
 *    datos.
 *
 * Tipos de datos soportados sobre los Holding Registers:
 *  - Int16  : enteros con signo de 16 bits.
 *  - UInt16 : enteros sin signo de 16 bits.
 *  - Bit    : acceso a un bit individual (0-15) dentro de un registro.
 *  - Float32: números en coma flotante IEEE 754 (ocupan 2 registros).
 *
 * Todos los valores se almacenan en formato Big-Endian (BE), coherente con el
 * estándar Modbus. Los métodos helper (get/set) validan el rango de direcciones
 * y devuelven valores seguros por defecto ante accesos fuera de límites.
 *
 * Se exporta una única instancia compartida (`bufferManager`) a modo de
 * singleton para que todos los módulos operen sobre la misma memoria.
 * ============================================================================
 */
class BufferManager
{
    // 1. Memoria unificada mediante Buffers
    COILS_QTY = 100;
    HR_QTY = 11000;

    // Coils empaquetados en bits (8 coils por byte), formato compatible con
    // jsmodbus para poder compartir el mismo Buffer sin copias ni sincronización.
    coilsBuffer = Buffer.alloc(Math.ceil(this.COILS_QTY / 8));
    // Buffer continuo para Holding Registers: 2 bytes por cada registro de 16 bits
    hrBuffer = Buffer.alloc(this.HR_QTY * 2);

    constructor()
    {
        // Constructor vacío
    }

    /**
     * Resetea toda la memoria a cero (coils y holding registers).
     * Útil al cambiar de programa simulado para no arrastrar valores previos.
     */
    public clear(): void
    {
        this.coilsBuffer.fill(0);
        this.hrBuffer.fill(0);
    }

    // ============================================================================
    // MÉTODOS HELPER (GET / SET) PARA EL BUFFER
    // ============================================================================

    /**
     * Lee el valor asociado a una dirección de memoria.
     * - Si `bit` se informa para un `HR`, devuelve el valor del bit solicitado (0/1).
     * - Si no se informa `bit`, devuelve el valor completo según el tipo de dato.
     */
    public read(data: DataModel, bit?: number): number
    {
        const address = data.getAddress();
        const bitIndex = bit ?? 0;

        switch (data.getAddressType())
        {
            case AddresType.C:
                return this.getCoil(address) ? 1 : 0;
            case AddresType.B:
                return this.getBit(address, bitIndex) ? 1 : 0;
            case AddresType.HR:
                if (bit !== undefined) return this.getBit(address, bitIndex) ? 1 : 0;
                return this.getInt16(address);
            case AddresType.HRF:
                return this.getFloat32(address);
            default:
                return 0;
        }
    }

    /**
     * Escribe un valor en la dirección indicada respetando el tipo de dato.
     * Para `B` y `C` cualquier valor mayor a cero se interpreta como activo.
     */
    public write(data: DataModel, value: number)
    {
        const address = data.getAddress();

        switch (data.getAddressType())
        {
            case AddresType.B:
                // TODO sin soporte para escribir bits individuales en HR. Actualmente, cualquier valor mayor a cero activa el bit completo.
                //this.setBit(address, value > 0);
                break;
            case AddresType.C:
                this.setCoil(address, value > 0);
                break;
            case AddresType.HR:
                this.setInt16(address, value);
                break;
            case AddresType.HRF:
                this.setFloat32(address, value);
                break;
        }
    }

    // --- COILS (bit-packed: byte = addr>>3, bit = addr&7) ---
    getCoil(addr: number): boolean
    {
        if (addr < 0 || addr >= this.COILS_QTY) return false;
        const byteIndex = addr >> 3;
        const bitIndex = addr & 7;
        return ((this.coilsBuffer[byteIndex] >> bitIndex) & 1) === 1;
    }

    setCoil(addr: number, value: boolean): void
    {
        if (addr < 0 || addr >= this.COILS_QTY) return;
        const byteIndex = addr >> 3;
        const bitIndex = addr & 7;
        if (value)
        {
            this.coilsBuffer[byteIndex] |= (1 << bitIndex);
        }
        else
        {
            this.coilsBuffer[byteIndex] &= ~(1 << bitIndex);
        }
        //console.log(`[Coil Write] Dir ${addr} -> ${value}`);
    }

    // --- ENTEROS DE 16 BITS ---
    getInt16(addr: number): number
    {
        if (addr < 0 || addr >= this.HR_QTY) return 0;
        return this.hrBuffer.readInt16BE(addr * 2);
    }

    setInt16(addr: number, value: number): void
    {
        if (addr < 0 || addr >= this.HR_QTY) return;
        this.hrBuffer.writeInt16BE(value, addr * 2);
        //console.log(`[Int16 Write] Dir ${addr} -> ${value}`);
    }

    getUInt16(addr: number): number
    {
        if (addr < 0 || addr >= this.HR_QTY) return 0;
        return this.hrBuffer.readUInt16BE(addr * 2);
    }

    setUInt16(addr: number, value: number): void
    {
        if (addr < 0 || addr >= this.HR_QTY) return;
        this.hrBuffer.writeUInt16BE(value & 0xffff, addr * 2);
        //console.log(`[UInt16 Write] Dir ${addr} -> ${value}`);
    }

    // --- BIT INDIVIDUAL DENTRO DE UN HOLDING REGISTER (0-15) ---
    getBit(addr: number, bit: number): boolean
    {
        if (addr < 0 || addr >= this.HR_QTY) return false;
        const word = this.hrBuffer.readUInt16BE(addr * 2);
        return ((word >> bit) & 1) === 1;
    }

    setBit(addr: number, bit: number, value: boolean): void
    {
        if (addr < 0 || addr >= this.HR_QTY) return;
        const word = this.hrBuffer.readUInt16BE(addr * 2);
        const newWord = value ? (word | (1 << bit)) : (word & ~(1 << bit));
        this.hrBuffer.writeUInt16BE(newWord & 0xffff, addr * 2);
        //console.log(`[Bit Write] Dir ${addr}.${bit} -> ${value}`);
    }

    // --- FLOTANTES DE 32 BITS (Float32 / IEEE 754) ---
    getFloat32(addr: number): number
    {
        if (addr < 0 || addr >= this.HR_QTY - 1) return 0.0;
        return this.hrBuffer.readFloatBE(addr * 2);
    }

    setFloat32(addr: number, value: number): void
    {
        if (addr < 0 || addr >= this.HR_QTY - 1) return;
        this.hrBuffer.writeFloatBE(value, addr * 2);
        //console.log(`[Float32 Write] Dir ${addr} (Regs ${addr}-${addr + 1}) -> ${value}`);
    }
}

export const bufferManager = new BufferManager();
