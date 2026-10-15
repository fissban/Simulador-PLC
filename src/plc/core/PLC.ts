import { create } from "node:domain";
import { AddresType, DataModel } from "./types";
import { mappingManager } from "../managers/MappingManager";

export abstract class PLC
{
    // Período completo de las ondas simuladas (cuánto tarda un ciclo).
    // Cuanto mayor sea, más progresivo será el cambio entre muestras/refrescos.
    protected WAVE_PERIOD_MS = 120000;

    // Intervalo de escaneo: cada cuánto se ejecuta el ciclo `execute()`.
    // Debe ser mucho menor que `WAVE_PERIOD_MS` para muestrear la onda con
    // suficientes puntos y que se vea suave.
    protected SCAN_INTERVAL_MS = 250;

    private timer: NodeJS.Timeout | null = null;

    constructor(scanIntervalMs: number = 250)
    {
        this.SCAN_INTERVAL_MS = scanIntervalMs;

        //this.init();
    }

    /**
     * Inicializa todo lo necesario para la simulación, como variables, timers, etc.
     */
    abstract init(): void;


    protected abstract execute(): void;

    /**
     * Ejecuta el ciclo de simulación, que puede incluir la lectura de entradas,
     * procesamiento de datos y escritura de salidas.
     */
    public run()
    {
        this.timer = setInterval(() =>
        {
            this.execute();
        }, this.SCAN_INTERVAL_MS);
    }

    /**
     * Detiene la ejecución del ciclo de simulación.
     */
    public stop()
    {
        if (this.timer)
        {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    /**
     * Crea un rango de direcciones de memoria.
     * @param name Nombre base para las variables.
     * @param addressStart Dirección de inicio.
     * @param count Cantidad de direcciones a crear.
     * @param type Tipo de dirección.
     * @returns Array de objetos DataModel con las direcciones y tipos.
     */
    protected createAddressRange(name: string, addressStart: number, count: number, type: AddresType): DataModel[]
    {
        return Array.from({ length: count }, (_, index) =>
        {
            const step = type == AddresType.HRF ? 2 : 1;

            const data = new DataModel(addressStart + (index * step), type);
            // Registrar el mapeo con un nombre único para cada dirección en el rango
            mappingManager.registerMapping(`${name}_${index}`, data);

            return data;
        });
    }

    /**
     * Crea una dirección de memoria.
     * @param name Nombre de la variable.
     * @param address Dirección de memoria.
     * @param type Tipo de dirección.
     * @returns Objeto DataModel con la dirección y el tipo.
     */
    protected createAddress(name: string, address: number, type: AddresType): DataModel
    {
        const data = new DataModel(address, type);
        // Registrar el mapeo con un nombre único para la dirección
        mappingManager.registerMapping(`${name}`, data);

        return data;
    }

    // ==== FUNCIONES PARA LA SIMULACIÓN DE ENTRADAS ====
    protected normalizeBounds(min: number, max: number): { low: number; high: number; }
    {
        return {
            low: Math.min(min, max),
            high: Math.max(min, max)
        };
    }

    /**
     * Onda senoidal: oscila suavemente entre min y max con el período WAVE_PERIOD_MS.
     */
    protected sine(elapsedMs: number, min: number, max: number): number
    {
        const { low, high } = this.normalizeBounds(min, max);
        const amplitude = (high - low) / 2;
        const center = low + amplitude;
        const radians = 2 * Math.PI * ((elapsedMs % this.WAVE_PERIOD_MS) / this.WAVE_PERIOD_MS);
        return center + amplitude * Math.sin(radians);
    }

    /**
     * Onda triangular: sube linealmente de min a max en la primera mitad del período,
     * y baja linealmente de max a min en la segunda mitad.
     */
    protected triangle(elapsedMs: number, min: number, max: number): number
    {
        const { low, high } = this.normalizeBounds(min, max);
        const cycle = (elapsedMs % this.WAVE_PERIOD_MS) / this.WAVE_PERIOD_MS;
        const amplitude = high - low;
        if (cycle < 0.5)
        {
            return low + cycle * 2 * amplitude;
        }
        else
        {
            return high - (cycle - 0.5) * 2 * amplitude;
        }
    }

    /**
     * Onda cuadrada: alterna entre max (primera mitad del período) y min (segunda mitad).
     */
    protected square(elapsedMs: number, min: number, max: number): number
    {
        const { low, high } = this.normalizeBounds(min, max);
        const cycle = (elapsedMs % this.WAVE_PERIOD_MS) / this.WAVE_PERIOD_MS;
        return cycle < 0.5 ? high : low;
    }

    /**
     * Rampa: sube linealmente de min a max a lo largo de un período completo y luego reinicia.
     */
    protected ramp(elapsedMs: number, min: number, max: number): number
    {
        const { low, high } = this.normalizeBounds(min, max);
        const cycle = (elapsedMs % this.WAVE_PERIOD_MS) / this.WAVE_PERIOD_MS;
        const amplitude = high - low;
        return low + cycle * amplitude;
    }

    /**
     * Valor aleatorio: genera un número aleatorio uniforme entre min y max en cada ejecución.
     * No depende del tiempo transcurrido.
     */
    protected random(_elapsedMs: number, min: number, max: number): number
    {
        const { low, high } = this.normalizeBounds(min, max);
        return low + Math.random() * (high - low);
    }

    /**
     * Escalado lineal entre un rango de entrada y un rango de salida.
     * Si el rango de entrada es inválido (`inMin === inMax`), devuelve `outMin`.
     */
    protected mapLinear(value: number, inMin: number, inMax: number, outMin: number, outMax: number): number
    {
        if (inMax === inMin)
        {
            return outMin;
        }

        const ratio = (value - inMin) / (inMax - inMin);
        return outMin + ratio * (outMax - outMin);
    }
}
