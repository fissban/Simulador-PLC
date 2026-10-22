import { AddresType, DataModel } from "../core/DataModel";
import { SC } from "./SC";

interface VSS
{
    activaDemanda: DataModel,
    estado: DataModel,
}

interface Pileta
{
    area: DataModel,
    numeroDePiletasFisicas: DataModel,
    volumen: DataModel,
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
    // Bits de las condiciones seguras
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

    readonly NUMERO_DE_PILETAS_FISICAS = 1;
    piletas: Pileta[] = [];

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

        this.pozoID_1 = this.createAddress("D_POZO_ID_1", 1380, AddresType.HR);
        this.pozoID_2 = this.createAddress("D_POZO_ID_2", 1381, AddresType.HR);
        this.pozoID_3 = this.createAddress("D_POZO_ID_3", 1382, AddresType.HR);
        this.pozoID_4 = this.createAddress("D_POZO_ID_4", 1383, AddresType.HR);

        this.diametroOrificioManifold_1 = this.createAddress("D_DIAMETRO_ORIFICIO_MANIFOLD_1", 1384, AddresType.HR);
        this.diametroOrificioManifold_2 = this.createAddress("D_DIAMETRO_ORIFICIO_MANIFOLD_2", 1385, AddresType.HR);
        this.diametroOrificioManifold_3 = this.createAddress("D_DIAMETRO_ORIFICIO_MANIFOLD_3", 1386, AddresType.HR);
        this.diametroOrificioManifold_4 = this.createAddress("D_DIAMETRO_ORIFICIO_MANIFOLD_4", 1387, AddresType.HR);

        this.presionReferenciaFuga = this.createAddress("D_PRESION_REFERENCIA_FUGA", 1448, AddresType.HR);

        for (let i = 1; i <= this.NUMERO_DE_PILETAS_FISICAS; i++)
        {
            const stepHRF = (i - 1) * 2;
            const stepHR = (i - 1);

            const pileta: Pileta =
            {
                area: this.createAddress(`D_AREA_PILETA_${i}`, 294 + stepHRF, AddresType.HRF),
                volumen: this.createAddress(`D_VOLUMEN_PILETA_${i}`, 2848 + stepHRF, AddresType.HRF),
                numeroDePiletasFisicas: this.createAddress(`D_NUMERO_DE_PILETAS_FISICAS`, 2866 + stepHR, AddresType.HR),
            };
            this.piletas.push(pileta);
        }

        // se inicializan las piletas con valores default
        this.piletas.forEach((pileta) =>
        {
            pileta.area.write(27);
            pileta.numeroDePiletasFisicas.write(1);
        });

        // Se habilita el IA 
        this.getAnalogicos().forEach((analogico, index) =>
        {
            analogico.config.write(1);
        });
        // se definen los IDS de los analogicos q se posterior se usaran para definir el nombre en el SCADA
        this.getAnalogico(1).id.write(4); // Presión de Pozo 1
        this.getAnalogico(2).id.write(5); // Presión de Pozo 2
        this.getAnalogico(3).id.write(6); // Presión de Pozo 3
        this.getAnalogico(4).id.write(7); // Presión de Pozo 4

        this.getAnalogico(5).id.write(8); // Presión Anular 1
        this.getAnalogico(6).id.write(9); // Presión Anular 2
        this.getAnalogico(7).id.write(10); // Presión Anular 3
        this.getAnalogico(8).id.write(11); // Presión Anular 4

        this.getAnalogico(9).id.write(12); // Temperatura de Pozo 1
        this.getAnalogico(10).id.write(13); // Temperatura de Pozo 2
        this.getAnalogico(11).id.write(14); // Temperatura de Pozo 3
        this.getAnalogico(12).id.write(15); // Temperatura de Pozo 4

        this.getAnalogico(13).id.write(16); // Presion de ST 1 Alta
        this.getAnalogico(14).id.write(17); // Presion de ST 2 Alta
        this.getAnalogico(15).id.write(18); // Presion de ST 3 Alta
        this.getAnalogico(16).id.write(19); // Presion de ST 4 Alta

        this.getAnalogico(17).id.write(20); // Presion de purga de ST 1 Alta
        this.getAnalogico(18).id.write(21); // Presion de purga de ST 2 Alta
        this.getAnalogico(19).id.write(22); // Presion de purga de ST 3 Alta
        this.getAnalogico(20).id.write(23); // Presion de purga de ST 4 Alta

        this.getAnalogico(40).id.write(36); // Presion de ST 1 Baja
        this.getAnalogico(41).id.write(37); // Presion de ST 2 Baja
        this.getAnalogico(42).id.write(38); // Presion de ST 3 Baja
        this.getAnalogico(43).id.write(39); // Presion de ST 4 Baja

        this.getAnalogico(44).id.write(40); // Presion de purga de ST 1 Baja
        this.getAnalogico(45).id.write(41); // Presion de purga de ST 2 Baja
        this.getAnalogico(46).id.write(42); // Presion de purga de ST 3 Baja
        this.getAnalogico(47).id.write(43); // Presion de purga de ST 4 Baja

        this.getAnalogico(29).id.write(28); // Presion de DH de Baja 1
        this.getAnalogico(30).id.write(29); // Presion de DH de Baja 2
        this.getAnalogico(31).id.write(30); // Presion de DH de Baja 3
        this.getAnalogico(32).id.write(31); // Presion de DH de Baja 4

        this.getAnalogico(33).id.write(24); // Presion de ST 1 Manifold
        this.getAnalogico(34).id.write(25); // Presion de ST 2 Manifold
        this.getAnalogico(35).id.write(26); // Presion de ST 3 Manifold
        this.getAnalogico(36).id.write(27); // Presion de ST 4 Manifold

        this.getAnalogico(37).id.write(32); // Temperatura de DH de Baja 1
        this.getAnalogico(38).id.write(33); // Temperatura de DH de Baja 2
        this.getAnalogico(39).id.write(34); // Temperatura de DH de Baja 3
        this.getAnalogico(40).id.write(35); // Temperatura de DH de Baja 4

        this.getAnalogico(25).id.write(66); // Mezcla Explosiva
        this.getAnalogico(49).id.write(46); // Presion Gas Instrumento
        this.getAnalogico(50).id.write(52); // Nivel Pileta 1
    }


    execute(): void
    {
        super.execute();

        // Se calcula el volumen de la pileta
        const instrumentoNivel = this.getAnalogico(50);
        const pileta = this.getPileta(1);

        pileta.volumen.write(this.calcularVolumenPileta(
            instrumentoNivel.valor.read(),
            instrumentoNivel.ingenieriaMax.read(),
            pileta.area.read()
        ));
    }

    private calcularVolumenPileta(nivel: number, alturaMaxima: number, area: number): number
    {
        if (!Number.isFinite(nivel) || !Number.isFinite(alturaMaxima) || alturaMaxima <= 0 ||
            !Number.isFinite(area) || area < 0)
        {
            throw new RangeError("Configuración de pileta inválida: el nivel debe ser finito, la altura máxima positiva y el área no negativa.");
        }

        const fraccionLlenado = Math.min(1, Math.max(0, nivel / alturaMaxima));
        const volumenMaximo = area * alturaMaxima;
        return volumenMaximo * fraccionLlenado;
    }

    private getPileta(index: number)
    {
        return this.piletas[index - 1];
    }
}
