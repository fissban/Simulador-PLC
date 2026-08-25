import { addressData, RegisterTypes } from "../../data/AddressData";
import { serverConfigData } from "../../data/ServerConfigData";
import { bufferManager } from "./BufferManager";

/**
 * Firma de todas las funciones de simulación en tiempo de ejecución.
 * Reciben el tiempo transcurrido en milisegundos y un conjunto variable de argumentos numéricos.
 * Devuelven un valor numérico que se escribirá en el registro Modbus correspondiente.
 */
type RuntimeFunctionWithTime = (elapsedMs: number, ...args: number[]) => number;

/** Período de onda en milisegundos (200 segundos). Todas las funciones periódicas comparten este período. */
const WAVE_PERIOD_MS = 200000;

/**
 * Catálogo de funciones de simulación disponibles.
 * Cada función acepta (elapsedMs, min, max) y devuelve un valor dentro del rango [min, max].
 * Se referencian desde la configuración de registros mediante su nombre (ej: "sine(0,100)").
 */
const funciones: Record<string, RuntimeFunctionWithTime> =
{
    /**
     * Onda senoidal: oscila suavemente entre min y max con el período WAVE_PERIOD_MS.
     */
    sine: (elapsedMs: number, min: number, max: number): number =>
    {
        const low = Math.min(min, max);
        const high = Math.max(min, max);
        const amplitude = (high - low) / 2;
        const center = low + amplitude;
        // Calcula el ángulo en radianes para el instante actual dentro del período
        const radians = 2 * Math.PI * ((elapsedMs % WAVE_PERIOD_MS) / WAVE_PERIOD_MS);

        return center + amplitude * Math.sin(radians);
    },

    /**
     * Onda triangular: sube linealmente de min a max en la primera mitad del período,
     * y baja linealmente de max a min en la segunda mitad.
     */
    triangle: (elapsedMs: number, min: number, max: number): number =>
    {
        const low = Math.min(min, max);
        const high = Math.max(min, max);
        // cycle va de 0 a 1 a lo largo de un período completo
        const cycle = (elapsedMs % WAVE_PERIOD_MS) / WAVE_PERIOD_MS;
        const amplitude = high - low;

        if (cycle < 0.5)
        {
            // Primera mitad: rampa ascendente
            return low + cycle * 2 * amplitude;
        }
        else
        {
            // Segunda mitad: rampa descendente
            return high - (cycle - 0.5) * 2 * amplitude;
        }
    },

    /**
     * Onda cuadrada: alterna entre max (primera mitad del período) y min (segunda mitad).
     */
    square: (elapsedMs: number, min: number, max: number): number =>
    {
        const low = Math.min(min, max);
        const high = Math.max(min, max);
        const cycle = (elapsedMs % WAVE_PERIOD_MS) / WAVE_PERIOD_MS;

        return cycle < 0.5 ? high : low;
    },

    /**
     * Rampa: sube linealmente de min a max a lo largo de un período completo y luego reinicia.
     */
    ramp: (elapsedMs: number, min: number, max: number): number =>
    {
        const low = Math.min(min, max);
        const high = Math.max(min, max);
        const cycle = (elapsedMs % WAVE_PERIOD_MS) / WAVE_PERIOD_MS;
        const amplitude = high - low;

        return low + cycle * amplitude;
    },

    /**
     * Valor aleatorio: genera un número aleatorio uniforme entre min y max en cada ejecución.
     * No depende del tiempo transcurrido.
     */
    random: (_elapsedMs: number, min: number, max: number): number =>
    {
        const low = Math.min(min, max);
        const high = Math.max(min, max);

        return low + Math.random() * (high - low);
    }
};

/**
 * Representa la asociación entre un registro Modbus y la expresión de función
 * que calculará su valor en cada ciclo de simulación.
 */
interface RuntimeBinding
{
    /** Nombre descriptivo del registro (para logging y diagnóstico). */
    registerName: string;
    /** Tipo de registro Modbus (coil, holding register, float, etc.). */
    registerType: RegisterTypes;
    /** Dirección Modbus del registro. */
    registerAddress: number;
    /** Expresión de función tal como aparece en la configuración, ej: "sine(0,100)". */
    expression: string;
}

/**
 * RuntimeFunctionManager
 *
 * Se encarga de leer la configuración de registros, detectar aquellos que tienen
 * asignada una función de simulación (`runtimeFunction`), y ejecutarlas periódicamente
 * para actualizar los buffers Modbus con valores dinámicos.
 *
 * Flujo de uso:
 *  1. `configure()` se llama al iniciar o recargar la configuración. Construye la lista
 *     de bindings a partir de los registros que tienen `runtimeFunction` definida.
 *  2. `execute()` se llama en cada tick del simulador. Avanza el tiempo interno y evalúa
 *     cada expresión, escribiendo el resultado en el buffer correspondiente.
 */
class RuntimeFunctionManager
{
    /** Lista de registros con función de simulación activa. */
    private bindings: RuntimeBinding[] = [];
    /** Tiempo acumulado en milisegundos desde que se configuró el manager. */
    private elapsedMs = 0;

    /**
     * Lee todos los registros de `addressData` y registra como bindings
     * aquellos que tengan una propiedad `runtimeFunction` de tipo string.
     * Reinicia el contador de tiempo a cero.
     */
    public configure(): void
    {
        this.bindings = [];
        this.elapsedMs = 0;

        for (const register of addressData.getAll())
        {
            // Solo se procesan registros con función de simulación configurada
            if (!register.runtimeFunction || typeof register.runtimeFunction !== "string")
            {
                continue;
            }

            this.bindings.push({
                registerName: register.name,
                registerType: register.type,
                registerAddress: register.address,
                expression: register.runtimeFunction
            });
        }

        console.log(`[RuntimeFn] Funciones activas: ${this.bindings.length}`);
    }

    /**
     * Ejecuta un ciclo de simulación:
     * - Incrementa el tiempo interno según el intervalo de actualización configurado.
     * - Evalúa la expresión de cada binding y escribe el resultado en el buffer Modbus.
     * - Los errores de evaluación se registran como advertencias sin detener la ejecución.
     */
    public execute(): void
    {
        if (this.bindings.length === 0)
        {
            return;
        }

        // Avanza el reloj interno en cada tick
        this.elapsedMs += serverConfigData.getUpdateEveryMs();

        for (const binding of this.bindings)
        {
            try
            {
                // Evalúa la expresión y obtiene el valor numérico resultante
                const rawValue = this.evaluarExpresion(binding.expression, this.elapsedMs);

                // Escribe el valor en el buffer según el tipo de registro
                switch (binding.registerType)
                {
                    case RegisterTypes.COIL:
                        // Los coils son booleanos: se considera true si el valor es >= 0.5
                        bufferManager.setCoil(binding.registerAddress, rawValue >= 0.5);
                        break;

                    case RegisterTypes.HOLDING_REGISTER:
                        // Registros enteros de 16 bits: se redondea el valor
                        bufferManager.setInt16(binding.registerAddress, Math.round(rawValue));
                        break;

                    case RegisterTypes.HOLDING_REGISTER_FLOAT:
                        // Registros de punto flotante de 32 bits: se escribe directamente
                        bufferManager.setFloat32(binding.registerAddress, rawValue);
                        break;

                    default:
                        break;
                }
            }
            catch (error)
            {
                const message = error instanceof Error ? error.message : String(error);
                console.warn(`[RuntimeFn] Error en ${binding.registerName}: ${message}`);
            }
        }
    }

    /**
     * Parsea y evalúa una expresión del tipo `nombreFuncion(arg1, arg2, ...)`.
     * Extrae el nombre de la función y sus argumentos, los valida y delega
     * la ejecución al catálogo `funciones`.
     *
     * @param cadena   Expresión de texto, ej: "sine(0, 100)"
     * @param elapsedMs Tiempo transcurrido en milisegundos para la función
     * @returns Valor numérico calculado por la función
     * @throws Error si la expresión no tiene el formato esperado o la función no existe
     */
    private evaluarExpresion(cadena: string, elapsedMs: number): number
    {
        // La expresión debe tener el formato: nombreFuncion(argumentos)
        const match = cadena.match(/^(\w+)\((.*)\)$/);

        if (!match)
        {
            throw new Error(`Expresión inválida: ${cadena}`);
        }

        const [, nombreFn, argsTexto] = match;
        const args = this.parseArgs(argsTexto);
        const fn = funciones[nombreFn];

        if (!fn)
        {
            throw new Error(`Función ${nombreFn} no registrada.`);
        }

        return fn(elapsedMs, ...args);
    }

    /**
     * Convierte la cadena de argumentos separados por comas en un array de números.
     * Utiliza `JSON.parse` para soportar enteros, decimales y notación científica.
     *
     * @param argsTexto Cadena con los argumentos, ej: "0, 100"
     * @returns Array de valores numéricos
     */
    private parseArgs(argsTexto: string): number[]
    {
        if (argsTexto.trim() === "")
        {
            return [];
        }

        return argsTexto.split(",").map((arg) => JSON.parse(arg.trim()));
    }
}

/** Instancia singleton del manager */
export const runtimeFunctionManager = new RuntimeFunctionManager();
