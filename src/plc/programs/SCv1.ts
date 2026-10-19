import { AddresType, DataModel } from "../core/DataModel";
import { SC } from "./SC";

interface VSS
{
    activaDemanda: DataModel,
    estado: DataModel,
}

// en el modo manual es fisico
interface Sandtrap
{
    /**
     * Este tiempo de x veces la duración de la purga será el tiempo que se deberá esperar 
     * mientras la presión de purga sea superior al parámetro seteado.
     * EJ: durac de purga = 5"; D1472 = 5; D3170 = 5x5 = 25 segundos
     * -> Si la presión se sostiene por encima del set point por un tiempo mayoy a 25 segundos,
     * se activará el enclavamiento por fuga en santrap 1.
     */


    /**
     * 1 Linea 1 Alta
     * 2 linea 1 Baja
     * 3 Linea 2 Alta
     * 4 Linea 2 Baja
     */
    numero: Number;

    //frecuencia: DataModel,
    //frecuencia_duracion: DataModel,
    frecuencia_habilitacion: DataModel, // habilita la purga automatica
    frecuencia_contador_minuto: DataModel,
    frecuencia_seteo: DataModel,


    duracion: DataModel,
    coeficiente_deteccion: DataModel,
    presion_referencia: DataModel,

    actuador: DataModel,// se envia 1 para el pedido de cierre
    estadoValvula: DataModel,
    fuga: DataModel,// alarma!
    resetManual: DataModel, // para el sistema manual
    automatico_manual: DataModel,


    last_update: number | null,
}

export class SCv1 extends SC
{
    // DIRECTOS =========================================================
    // VSS
    VSS_SIZE = 4;

    readonly D_CONFIG_VSS_1 = 0;
    readonly D_CONFIG_VSS_2 = 1;
    readonly D_CONFIG_VSS_3 = 2;
    readonly D_CONFIG_VSS_4 = 3;
    // VSS 1
    private vss: VSS[] = [];

    condicion_segura_vss: DataModel | null = null;

    handShutDown: DataModel | null = null; // input indicando el cierre manual (1327)

    pozoID_1: DataModel | null = null; // 1380
    pozoID_2: DataModel | null = null; // 1381
    pozoID_3: DataModel | null = null; // 1382
    pozoID_4: DataModel | null = null; // 1383

    diametroOrificioManifold_1: DataModel | null = null; // 1384
    diametroOrificioManifold_2: DataModel | null = null; // 1385
    diametroOrificioManifold_3: DataModel | null = null; // 1386
    diametroOrificioManifold_4: DataModel | null = null; // 1387

    presionReferenciaFuga: DataModel | null = null; // 1448

    volumenPileta_1: DataModel | null = null; // 2848
    volumenPileta_2: DataModel | null = null; // 2850
    volumenPileta_3: DataModel | null = null; // 2852
    volumenPileta_4: DataModel | null = null; // 2854
    volumenPileta_5: DataModel | null = null; // 2856
    volumenPileta_6: DataModel | null = null; // 2858


    constructor(scanIntervalMs: number = 250)
    {
        super(scanIntervalMs);
    }

    init(): void
    {
        super.init();

        for (let i = 1; i <= this.VSS_SIZE; i++)
        {
            const stepHR = i - 1;
            const valve: VSS =
            {
                activaDemanda: this.createAddress(`D_ACTIVA_DEMANDA_VSS_${i}`, 3120 + stepHR, AddresType.HR),
                estado: this.createAddress(`D_ESTADO_VSS_${i}`, 3148 + stepHR, AddresType.HR),
            };
            this.vss.push(valve);
        }

        this.condicion_segura_vss = this.createAddress("D_CONDICION_SEGURA_VSS", 9, AddresType.HR);

    }

    execute(): void
    {
        super.execute();
    }
}
