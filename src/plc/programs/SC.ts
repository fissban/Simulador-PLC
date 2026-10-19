import { PLC } from "../core/PLC";
import { AddresType, DataModel } from "../core/DataModel";

export interface Analogico
{
    input: DataModel,
    valor: DataModel,
    config: DataModel,
    estado: DataModel,
    rangoMin: DataModel,
    rangoMax: DataModel,
    ingenieriaMin: DataModel,
    ingenieriaMax: DataModel,
    setPointHh: DataModel,
    setPointH: DataModel,
    setPointL: DataModel,
    setPointLl: DataModel,
    deadBand: DataModel;
}

export interface Digital
{
    valor: DataModel,
    config: DataModel,
    delayActivacion: DataModel,
    delayDesactivacion: DataModel,
    activacionPendienteDesde: number | null,
}

export abstract class SC extends PLC
{
    readonly IA_SIZE = 50;
    readonly ID_SIZE = 20;

    // =================== DIRECTOS =================== //
    public estadoEnsayo: DataModel | null = null;
    public tensionBateria: DataModel | null = null;
    // ================== ANALOGICOS ================== //
    readonly IA_CONFIG_ALARM_POS_LOLO = 0;
    readonly IA_CONFIG_ALARM_POS_LO = 1;
    readonly IA_CONFIG_ALARM_POS_HI = 2;
    readonly IA_CONFIG_ALARM_POS_HIHI = 3;

    private readonly analogicos: Analogico[] = [];


    // ================== DIGITALES ================== //
    readonly ID_CONFIG_POS_HABILITADO = 0;
    readonly ID_CONFIG_POS_NO_ALARMA = 1;
    readonly ID_CONFIG_POS_HABILITADA = 2;
    readonly ID_CONFIG_POS_INTERLOCKS = [3, 4, 5, 6, 7];

    private readonly digitales: Digital[] = [];

    constructor(scanIntervalMs: number = 250)
    {
        super(scanIntervalMs);
    }

    init(): void
    {

        this.estadoEnsayo = this.createAddress("D_ESTADO_ENSAYO", 312, AddresType.HR);
        this.tensionBateria = this.createAddress("D_TENSION_BATERIA", 2886, AddresType.HR);
        // ================== ANALOGICOS ================== //
        this.analogicos.length = 0;
        for (let i = 1; i <= this.IA_SIZE; i++)
        {
            const stepHRF = (i - 1) * 2;
            const stepHR = (i - 1);

            const instrumento: Analogico =
            {
                input: this.createAddress(`IA_INPUT_${i}`, 10000 + stepHRF, AddresType.HRF),
                valor: this.createAddress(`IA_VALOR_${i}`, 2600 + stepHRF, AddresType.HRF),
                config: this.createAddress(`IA_CONFIG_${i}`, 101 + stepHR, AddresType.HR),
                estado: this.createAddress(`IA_ESTADO_${i}`, 2372 + stepHR, AddresType.HR),
                rangoMin: this.createAddress(`IA_RANGO_MIN_${i}`, 340 + stepHRF, AddresType.HRF),
                rangoMax: this.createAddress(`IA_RANGO_MAX_${i}`, 440 + stepHRF, AddresType.HRF),
                ingenieriaMin: this.createAddress(`IA_INGENIERIA_MIN_${i}`, 540 + stepHRF, AddresType.HRF),
                ingenieriaMax: this.createAddress(`IA_INGENIERIA_MAX_${i}`, 640 + stepHRF, AddresType.HRF),
                setPointHh: this.createAddress(`IA_SET_POINT_HH_${i}`, 740 + stepHRF, AddresType.HRF),
                setPointH: this.createAddress(`IA_SET_POINT_H_${i}`, 840 + stepHRF, AddresType.HRF),
                setPointL: this.createAddress(`IA_SET_POINT_L_${i}`, 940 + stepHRF, AddresType.HRF),
                setPointLl: this.createAddress(`IA_SET_POINT_LL_${i}`, 1040 + stepHRF, AddresType.HRF),
                deadBand: this.createAddress(`IA_DEAD_BAND_${i}`, 1140 + stepHRF, AddresType.HRF)
            };
            instrumento.rangoMin.write(0);
            instrumento.rangoMax.write(Math.floor(Math.random() * 4000));
            instrumento.ingenieriaMin.write(0);
            instrumento.ingenieriaMax.write(Math.floor(Math.random() * 2000));
            this.analogicos.push(instrumento);
        }

        this.digitales.length = 0;
        for (let i = 1; i <= this.ID_SIZE; i++)
        {
            const stepHR = i - 1;

            const digital: Digital =
            {
                config: this.createAddress(`ID_CONFIG_${i}`, 152 + stepHR, AddresType.HR),
                valor: this.createAddress(`ID_VALOR_${i}`, 2422 + stepHR, AddresType.HR),
                delayActivacion: this.createAddress(`ID_DELAY_ACTIVACION_${i}`, 2522 + stepHR, AddresType.HR),
                delayDesactivacion: this.createAddress(`ID_DELAY_DESACTIVACION_${i}`, 2622 + stepHR, AddresType.HR),
                activacionPendienteDesde: null,
            };
            digital.delayActivacion.write(0);
            digital.delayDesactivacion.write(0);
            this.digitales.push(digital);
        }
    }

    execute(): void
    {
        // ================== ANALOGICOS ================== //

        // ETAPA 1: Generación de señal cruda en direcciones IA_INPUT.
        // Cada canal recibe una señal simulada independiente que representa
        // la medición bruta llegada desde el instrumento/campo, oscilando
        // dentro del rango crudo configurado para el canal.
        const elapsedMs = Date.now();
        this.analogicos.forEach((analogico) =>
        {
            // Límites del rango crudo del instrumento (ej. 0..600).
            const rawMin = analogico.rangoMin.read();
            const rawMax = analogico.rangoMax.read();
            // Onda senoidal que oscila dentro del rango crudo del canal.
            const value = this.sine(elapsedMs, rawMin, rawMax);
            analogico.input.write(value);
        });

        // ETAPA 2: Escalado de señal cruda a valor de ingeniería en IA_VALOR.
        // Convierte el valor leído en campo al rango físico configurado
        // para cada instrumento (por ejemplo, 0..600 -> 0..100).
        this.analogicos.forEach((analogico) =>
        {
            // Valor medido por el instrumento (señal cruda)
            const value = analogico.input.read();
            // Rango crudo configurado para el canal
            const rawMin = analogico.rangoMin.read();
            const rawMax = analogico.rangoMax.read();
            // Rango de ingeniería configurado para el canal
            const engMin = analogico.ingenieriaMin.read();
            const engMax = analogico.ingenieriaMax.read();

            // Conversión lineal: crudo -> ingeniería
            const scaledValue = this.mapLinear(value, rawMin, rawMax, engMin, engMax);
            analogico.valor.write(scaledValue);
        });

        // ETAPA 3: Cálculo del estado de alarmas (LOLO/LO/HI/HIHI) en IA_ESTADO.
        // Se usa `IA_CONFIG` para saber qué alarmas están habilitadas y
        // `IA_ESTADO` previo para aplicar histéresis en la desactivación.
        this.analogicos.forEach((analogico) =>
        {
            this.updateAlarmState(analogico);
        });

        // ================== DIGITALES ================== //

        // ETAPA 4: Generación de señal digital en el bit 0 (Valor) del registro.
        // Cada canal usa una onda cuadrada desfasada, conservando el bit de alarma.
        this.digitales.forEach((digital, index) =>
        {
            const value = this.square(elapsedMs + (index * this.WAVE_PERIOD_MS / this.ID_SIZE), 0, 1) >= 0.5;
            this.writeRegisterBit(digital.valor, 0, value);
        });

        // ETAPA 5: Cálculo de alarma digital en el bit 1 (Activada) del registro.
        // Lee la señal generada y aplica habilitaciones, interlocks y delays.
        this.digitales.forEach((digital) =>
        {
            this.updateDigitalAlarmState(digital, elapsedMs);
        });

    }

    public getAnalogico(numero: number): Analogico
    {
        const analogico = Number.isInteger(numero) ? this.analogicos[numero - 1] : undefined;
        if (!analogico)
        {
            throw new RangeError(`Número de instrumento analógico fuera de rango: ${numero}`);
        }

        return analogico;
    }

    public getDigital(numero: number): Digital
    {
        const digital = Number.isInteger(numero) ? this.digitales[numero - 1] : undefined;
        if (!digital)
        {
            throw new RangeError(`Número de instrumento digital fuera de rango: ${numero}`);
        }

        return digital;
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
    private updateAlarmState(analogico: Analogico): void
    {
        // Valor de ingeniería actual del canal.
        const value = analogico.valor.read();
        // Máscara de habilitación de alarmas para el canal.
        const config = analogico.config.read();
        // Dead band configurado para evitar oscilación de alarmas.
        const deadBand = analogico.deadBand.read();
        // Estado previo del word de alarmas; se usa para decidir si la
        // alarma sigue activa o si ya puede limpiarse.
        const prevState = analogico.estado.read();

        // Set points de cada nivel de alarma.
        const setPointLL = analogico.setPointLl.read();
        const setPointL = analogico.setPointL.read();
        const setPointH = analogico.setPointH.read();
        const setPointHH = analogico.setPointHh.read();

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
        analogico.estado.write(state);
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
    private updateDigitalAlarmState(digital: Digital, elapsedMs: number): void
    {
        const config = digital.config.read();
        const value = digital.valor.read(0) === 1;

        const enabled = this.getBitValue(config, this.ID_CONFIG_POS_HABILITADO) === 1;
        const alarmEnabled = this.getBitValue(config, this.ID_CONFIG_POS_HABILITADA) === 1;
        const alarmSuppressed = this.getBitValue(config, this.ID_CONFIG_POS_NO_ALARMA) === 1;
        const hasActiveInterlock = this.ID_CONFIG_POS_INTERLOCKS.some((bitPos) => this.getBitValue(config, bitPos) === 1);
        const shouldBeActive = value && enabled && alarmEnabled && !alarmSuppressed && !hasActiveInterlock;
        const isActive = digital.valor.read(1) === 1;

        if (shouldBeActive === isActive)
        {
            digital.activacionPendienteDesde = null;
            return;
        }

        const pendingSince = digital.activacionPendienteDesde;
        if (pendingSince === null)
        {
            digital.activacionPendienteDesde = elapsedMs;
        }

        const delay = shouldBeActive ? digital.delayActivacion.read() : digital.delayDesactivacion.read();
        const transitionStartedAt = digital.activacionPendienteDesde ?? elapsedMs;

        if (elapsedMs - transitionStartedAt >= Math.max(0, delay))
        {
            this.writeRegisterBit(digital.valor, 1, shouldBeActive);
            digital.activacionPendienteDesde = null;
        }
    }
}