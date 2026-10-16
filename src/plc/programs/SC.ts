import { PLC } from "../core/PLC";
import { AddresType, DataModel } from "../core/DataModel";

export abstract class SC extends PLC
{
    readonly OA_SIZE = 50;
    readonly ID_SIZE = 20;

    // ================== ANALOGICOS ================== //
    readonly IA_CONFIG_ALARM_POS_LOLO = 0;
    readonly IA_CONFIG_ALARM_POS_LO = 1;
    readonly IA_CONFIG_ALARM_POS_HI = 2;
    readonly IA_CONFIG_ALARM_POS_HIHI = 3;

    // Señales simuladas de Instrumentos Analógicos (10000, 10002, ...)
    public IA_INPUT: DataModel[] = [];
    // Entradas procesadas (2600, 2602, ...)
    public IA_VALOR: DataModel[] = [];
    // Configuración alarmas (101, 102, ...)
    public IA_CONFIG: DataModel[] = [];
    // Estado alarmas (2372, 2373, ...)
    public IA_ESTADO: DataModel[] = [];
    // Rango de señal cruda
    public IA_RANGO_MIN: DataModel[] = [];
    public IA_RANGO_MAX: DataModel[] = [];
    // Rango de ingeniería
    public IA_INGENIERIA_MIN: DataModel[] = [];
    public IA_INGENIERIA_MAX: DataModel[] = [];
    // Set points de alarmas
    public IA_SET_POINT_HH: DataModel[] = [];
    public IA_SET_POINT_H: DataModel[] = [];
    public IA_SET_POINT_L: DataModel[] = [];
    public IA_SET_POINT_LL: DataModel[] = [];
    // Dead band
    public IA_DEAD_BAND: DataModel[] = [];

    // ================== DIGITALES ================== //
    readonly ID_CONFIG_POS_HABILITADO = 0;
    readonly ID_CONFIG_POS_NO_ALARMA = 1;
    readonly ID_CONFIG_POS_HABILITADA = 2;
    readonly ID_CONFIG_POS_INTERLOCKS = [3, 4, 5, 6, 7];

    // Instrumentos digitales (Numero 1..20, según el parámetro Numero del UDT).
    //public ID_NUMERO: DataModel[] = [];
    public ID_CONFIG: DataModel[] = [];
    // Valor usa bit 0 (Valor) y bit 1 (Activada) en el mismo registro.
    public ID_VALOR: DataModel[] = [];
    public ID_DELAY_ACTIVACION: DataModel[] = [];
    public ID_DELAY_DESACTIVACION: DataModel[] = [];

    private ID_ACTIVACION_PENDIENTE_DESDE: Array<number | null> = [];

    constructor(scanIntervalMs: number = 250)
    {
        super(scanIntervalMs);
    }

    /**
     * Devuelve el valor del bit en la posición solicitada.
     * Ejemplo: `getBitValue(10, 1)` devuelve `1` porque `10 = 1010b`.
     */
    private getBitValue(value: number, bitPos: number): number
    {
        return (value >> bitPos) & 1;
    }

    /**
     * Indica si la alarma está habilitada en el registro de configuración.
     * Cada alarma usa una posición de bit fija dentro de `IA_CONFIG`.
     */
    private isAlarmEnabled(config: number, alarmBitPos: number): boolean
    {
        return this.getBitValue(config, alarmBitPos) === 1;
    }

    /**
     * Alarmas bajas:
     * - Se activan al llegar o bajar del set point.
     * - Si ya estaban activas, solo se limpian al subir por encima de
     *   `setPoint + (deadBand * 2)`.
     * Ejemplo: SP=50 y DB=1 -> entra en 50 y sale al subir a 52.
     */
    private isLowAlarmActive(value: number, setPoint: number, deadBand: number, wasActive: boolean): boolean
    {
        if (wasActive)
        {
            return value < (setPoint + (deadBand * 2));
        }

        return value <= setPoint;
    }

    /**
     * Alarmas altas:
     * - Se activan al llegar o superar el set point.
     * - Si ya estaban activas, solo se limpian al bajar por debajo de
     *   `setPoint - (deadBand * 2)`.
     * Ejemplo: SP=50 y DB=1 -> entra en 50 y sale al bajar a 48.
     */
    private isHighAlarmActive(value: number, setPoint: number, deadBand: number, wasActive: boolean): boolean
    {
        if (wasActive)
        {
            return value > (setPoint - (deadBand * 2));
        }

        return value >= setPoint;
    }

    /**
     * Calcula el word de estado de alarmas para un canal analógico.
     * Usa el valor de ingeniería actual, la configuración del canal,
     * los set points y el estado previo para aplicar histéresis.
     */
    private updateAlarmState(index: number): void
    {
        // Valor de ingeniería actual del canal.
        const value = this.IA_VALOR[index].read();
        // Máscara de habilitación de alarmas para el canal.
        const config = this.IA_CONFIG[index].read();
        // Dead band configurado para evitar oscilación de alarmas.
        const deadBand = this.IA_DEAD_BAND[index].read();
        // Estado previo del word de alarmas; se usa para decidir si la
        // alarma sigue activa o si ya puede limpiarse.
        const prevState = this.IA_ESTADO[index].read();

        // Set points de cada nivel de alarma.
        const setPointLL = this.IA_SET_POINT_LL[index].read();
        const setPointL = this.IA_SET_POINT_L[index].read();
        const setPointH = this.IA_SET_POINT_H[index].read();
        const setPointHH = this.IA_SET_POINT_HH[index].read();

        // Estado previo de cada alarma individual, leído desde el word anterior.
        const wasLoLo = this.getBitValue(prevState, this.IA_CONFIG_ALARM_POS_LOLO) === 1;
        const wasLo = this.getBitValue(prevState, this.IA_CONFIG_ALARM_POS_LO) === 1;
        const wasHi = this.getBitValue(prevState, this.IA_CONFIG_ALARM_POS_HI) === 1;
        const wasHiHi = this.getBitValue(prevState, this.IA_CONFIG_ALARM_POS_HIHI) === 1;

        // Nuevo word de estado a reconstruir en cada ciclo.
        let state = 0;

        // LOLO: alarma muy baja.
        if (this.isAlarmEnabled(config, this.IA_CONFIG_ALARM_POS_LOLO) && this.isLowAlarmActive(value, setPointLL, deadBand, wasLoLo))
        {
            state |= (1 << this.IA_CONFIG_ALARM_POS_LOLO);
        }

        // LO: alarma baja.
        if (this.isAlarmEnabled(config, this.IA_CONFIG_ALARM_POS_LO) && this.isLowAlarmActive(value, setPointL, deadBand, wasLo))
        {
            state |= (1 << this.IA_CONFIG_ALARM_POS_LO);
        }

        // HI: alarma alta.
        if (this.isAlarmEnabled(config, this.IA_CONFIG_ALARM_POS_HI) && this.isHighAlarmActive(value, setPointH, deadBand, wasHi))
        {
            state |= (1 << this.IA_CONFIG_ALARM_POS_HI);
        }

        // HIHI: alarma muy alta.
        if (this.isAlarmEnabled(config, this.IA_CONFIG_ALARM_POS_HIHI) && this.isHighAlarmActive(value, setPointHH, deadBand, wasHiHi))
        {
            state |= (1 << this.IA_CONFIG_ALARM_POS_HIHI);
        }

        // Se persiste el nuevo estado para el próximo ciclo y para consulta externa.
        this.IA_ESTADO[index].write(state);
    }

    private writeRegisterBit(register: DataModel, bitPos: number, value: boolean): void
    {
        const currentValue = register.read();
        const bitMask = 1 << bitPos;
        const newValue = value ? currentValue | bitMask : currentValue & ~bitMask;

        register.write(newValue);
    }

    /**
     * Calcula la alarma digital desde Valor (bit 0) y actualiza Activada (bit 1),
     * aplicando la configuración y los delays sin modificar la señal simulada.
     */
    private updateDigitalAlarmState(index: number, elapsedMs: number): void
    {
        const config = this.ID_CONFIG[index].read();
        const value = this.ID_VALOR[index].read(0) === 1;

        const enabled = this.getBitValue(config, this.ID_CONFIG_POS_HABILITADO) === 1;
        const alarmEnabled = this.getBitValue(config, this.ID_CONFIG_POS_HABILITADA) === 1;
        const alarmSuppressed = this.getBitValue(config, this.ID_CONFIG_POS_NO_ALARMA) === 1;
        const hasActiveInterlock = this.ID_CONFIG_POS_INTERLOCKS.some((bitPos) => this.getBitValue(config, bitPos) === 1);
        const shouldBeActive = value && enabled && alarmEnabled && !alarmSuppressed && !hasActiveInterlock;
        const isActive = this.ID_VALOR[index].read(1) === 1;

        if (shouldBeActive === isActive)
        {
            this.ID_ACTIVACION_PENDIENTE_DESDE[index] = null;
            return;
        }

        const pendingSince = this.ID_ACTIVACION_PENDIENTE_DESDE[index];
        if (pendingSince === null)
        {
            this.ID_ACTIVACION_PENDIENTE_DESDE[index] = elapsedMs;
        }

        const delay = shouldBeActive ? this.ID_DELAY_ACTIVACION[index].read() : this.ID_DELAY_DESACTIVACION[index].read();
        const transitionStartedAt = this.ID_ACTIVACION_PENDIENTE_DESDE[index] ?? elapsedMs;

        if (elapsedMs - transitionStartedAt >= Math.max(0, delay))
        {
            this.writeRegisterBit(this.ID_VALOR[index], 1, shouldBeActive);
            this.ID_ACTIVACION_PENDIENTE_DESDE[index] = null;
        }
    }

    init(): void
    {
        // ================== ANALOGICOS ================== //

        // Mapa de direcciones por grupo funcional de variables analógicas.
        this.IA_INPUT = this.createAddressRange('IA_INPUT', 10000, this.OA_SIZE, AddresType.HRF);
        this.IA_VALOR = this.createAddressRange('IA_VALOR', 2600, this.OA_SIZE, AddresType.HRF);// 5000
        this.IA_CONFIG = this.createAddressRange('IA_CONFIG', 101, this.OA_SIZE, AddresType.HR);
        this.IA_ESTADO = this.createAddressRange('IA_ESTADO', 2372, this.OA_SIZE, AddresType.HR);
        this.IA_RANGO_MIN = this.createAddressRange('IA_RANGO_MIN', 340, this.OA_SIZE, AddresType.HRF);
        this.IA_RANGO_MAX = this.createAddressRange('IA_RANGO_MAX', 440, this.OA_SIZE, AddresType.HRF);
        this.IA_INGENIERIA_MIN = this.createAddressRange('IA_INGENIERIA_MIN', 540, this.OA_SIZE, AddresType.HRF);
        this.IA_INGENIERIA_MAX = this.createAddressRange('IA_INGENIERIA_MAX', 640, this.OA_SIZE, AddresType.HRF);
        this.IA_SET_POINT_HH = this.createAddressRange('IA_SET_POINT_HH', 740, this.OA_SIZE, AddresType.HRF);
        this.IA_SET_POINT_H = this.createAddressRange('IA_SET_POINT_H', 840, this.OA_SIZE, AddresType.HRF);
        this.IA_SET_POINT_L = this.createAddressRange('IA_SET_POINT_L', 940, this.OA_SIZE, AddresType.HRF);
        this.IA_SET_POINT_LL = this.createAddressRange('IA_SET_POINT_LL', 1040, this.OA_SIZE, AddresType.HRF);
        this.IA_DEAD_BAND = this.createAddressRange('IA_DEAD_BAND', 1140, this.OA_SIZE, AddresType.HRF);

        // Valores por defecto para escalar señal cruda (0..600) a ingeniería (0..100)
        this.IA_RANGO_MIN.forEach((item) => item.write(0));
        this.IA_RANGO_MAX.forEach((item) => item.write(600));
        this.IA_INGENIERIA_MIN.forEach((item) => item.write(0));
        this.IA_INGENIERIA_MAX.forEach((item) => item.write(100));

        // ================== DIGITALES ================== //

        // Mapa UDT Objeto_Digital: las direcciones se calculan desde Numero (1..20).
        //this.ID_NUMERO = this.createAddressRange("ID_NUMERO", 1310, this.ID_SIZE, AddresType.HR, 1);
        this.ID_CONFIG = this.createAddressRange("ID_CONFIG", 152, this.ID_SIZE, AddresType.HR, 1);
        this.ID_VALOR = this.createAddressRange("ID_VALOR", 2422, this.ID_SIZE, AddresType.HR, 1);
        this.ID_DELAY_ACTIVACION = this.createAddressRange("ID_DELAY_ACTIVACION", 242, this.ID_SIZE, AddresType.HR, 1);
        this.ID_DELAY_DESACTIVACION = this.createAddressRange("ID_DELAY_DESACTIVACION", 262, this.ID_SIZE, AddresType.HR, 1);

        //this.ID_NUMERO.forEach((item, index) => item.write(index + 1));
        this.ID_DELAY_ACTIVACION.forEach((item) => item.write(0));
        this.ID_DELAY_DESACTIVACION.forEach((item) => item.write(0));
        this.ID_ACTIVACION_PENDIENTE_DESDE = Array(this.ID_SIZE).fill(null);


    }

    execute(): void
    {
        // ================== ANALOGICOS ================== //

        // ETAPA 1: Generación de señal cruda en direcciones IA_INPUT.
        // Cada canal recibe una señal simulada independiente que representa
        // la medición bruta llegada desde el instrumento/campo, oscilando
        // dentro del rango crudo configurado para el canal.
        const elapsedMs = Date.now();
        this.IA_INPUT.forEach((input, index) =>
        {
            // Límites del rango crudo del instrumento (ej. 0..600).
            const rawMin = this.IA_RANGO_MIN[index].read();
            const rawMax = this.IA_RANGO_MAX[index].read();
            // Onda senoidal que oscila dentro del rango crudo del canal.
            const value = this.sine(elapsedMs, rawMin, rawMax);
            input.write(value);
        });

        // ETAPA 2: Escalado de señal cruda a valor de ingeniería en IA_VALOR.
        // Convierte el valor leído en campo al rango físico configurado
        // para cada instrumento (por ejemplo, 0..600 -> 0..100).
        this.IA_VALOR.forEach((output, index) =>
        {
            // Valor medido por el instrumento (señal cruda)
            const value = this.IA_INPUT[index].read();
            // Rango crudo configurado para el canal
            const rawMin = this.IA_RANGO_MIN[index].read();
            const rawMax = this.IA_RANGO_MAX[index].read();
            // Rango de ingeniería configurado para el canal
            const engMin = this.IA_INGENIERIA_MIN[index].read();
            const engMax = this.IA_INGENIERIA_MAX[index].read();

            // Conversión lineal: crudo -> ingeniería
            const scaledValue = this.mapLinear(value, rawMin, rawMax, engMin, engMax);
            output.write(scaledValue);
        });

        // ETAPA 3: Cálculo del estado de alarmas (LOLO/LO/HI/HIHI) en IA_ESTADO.
        // Se usa `IA_CONFIG` para saber qué alarmas están habilitadas y
        // `IA_ESTADO` previo para aplicar histéresis en la desactivación.
        this.IA_VALOR.forEach((_valor, index) =>
        {
            this.updateAlarmState(index);
        });

        // ================== DIGITALES ================== //
        
        // ETAPA 4: Generación de señal digital en el bit 0 (Valor) del registro.
        // Cada canal usa una onda cuadrada desfasada, conservando el bit de alarma.
        this.ID_VALOR.forEach((output, index) =>
        {
            const value = this.square(elapsedMs + (index * this.WAVE_PERIOD_MS / this.ID_SIZE), 0, 1) >= 0.5;
            this.writeRegisterBit(output, 0, value);
        });

        // ETAPA 5: Cálculo de alarma digital en el bit 1 (Activada) del registro.
        // Lee la señal generada y aplica habilitaciones, interlocks y delays.
        this.ID_VALOR.forEach((_valor, index) =>
        {
            this.updateDigitalAlarmState(index, elapsedMs);
        });

    }
}