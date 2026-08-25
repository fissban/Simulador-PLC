class BufferManager
{
    // 1. Memoria unificada mediante Buffers
    COILS_QTY = 100;
    HR_QTY = 10000;

    // 1 byte por Coil para máxima simplicidad y rapidez de acceso
    coilsBuffer = Buffer.alloc(this.COILS_QTY);
    // Buffer continuo para Holding Registers: 2 bytes por cada registro de 16 bits
    hrBuffer = Buffer.alloc(this.HR_QTY * 2);

    constructor()
    {
        // Constructor vacío
    }

     // ============================================================================
    // MÉTODOS HELPER (GET / SET) PARA EL BUFFER
    // ============================================================================

    // --- COILS ---
    getCoil(addr: number): boolean
    {
        if (addr < 0 || addr >= this.COILS_QTY) return false;
        return Boolean(this.coilsBuffer[addr]);
    }

    setCoil(addr: number, value: boolean): void
    {
        if (addr < 0 || addr >= this.COILS_QTY) return;
        this.coilsBuffer[addr] = value ? 1 : 0;
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

