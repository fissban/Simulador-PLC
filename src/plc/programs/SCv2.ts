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

export class SCv2 extends SC
{
    // DIRECTOS =========================================================
    // VSS
    VSS_SIZE = 5;
    // Bits de las condiciones seguras
    readonly D_CONFIG_VSS_1 = 0;
    readonly D_CONFIG_VSS_2 = 1;
    readonly D_CONFIG_SDV = 2;
    readonly D_CONFIG_XV_AGUA = 3;
    readonly D_CONFIG_XV_PETROLEO = 4;

    // VSS 1
    private valvulas: VSS[] = [];

    condicion_segura_valvulas: DataModel | null = null;

    handShutDown: DataModel | null = null; // input indicando el cierre manual (1327)

    pozoID_1: DataModel | null = null; // 1380
    pozoID_2: DataModel | null = null; // 1381
    //pozoID_3: DataModel | null = null; // 1382
    //pozoID_4: DataModel | null = null; // 1383

    diametroOrificioManifold_1: DataModel | null = null; // 1384
    diametroOrificioManifold_2: DataModel | null = null; // 1385
    //diametroOrificioManifold_3: DataModel | null = null; // 1386
    //diametroOrificioManifold_4: DataModel | null = null; // 1387

    presionReferenciaFuga: DataModel | null = null; // 1448

    readonly NUMERO_DE_PILETAS_FISICAS = 6;
    piletas: Pileta[] = [];

    constructor(scanIntervalMs: number = 250)
    {
        super(scanIntervalMs);
    }

    init(): void
    {
        super.init();

        // VALVULAS
        for (let i = 1; i <= 2; i++)
        {
            const stepHR = i - 1;
            const valve: VSS =
            {
                activaDemanda: this.createAddress(`D_ACTIVA_DEMANDA_VSS_${i}`, 3120 + stepHR, AddresType.HR),
                estado: this.createAddress(`D_ESTADO_VSS_${i}`, 3148 + stepHR, AddresType.HR),
            };
            this.valvulas.push(valve);
        }

        this.valvulas.push
            ({
                activaDemanda: this.createAddress(`D_ACTIVA_DEMANDA_SDV_${1}`, 3122, AddresType.HR),
                estado: this.createAddress(`D_ESTADO_SDV_${1}`, 3150, AddresType.HR),
            });
        this.valvulas.push
            ({
                activaDemanda: this.createAddress(`D_ACTIVA_DEMANDA_XDV_${1}`, 3123, AddresType.HR),
                estado: this.createAddress(`D_ESTADO_XDV_${1}`, 3151, AddresType.HR),
            });
        this.valvulas.push
            ({
                activaDemanda: this.createAddress(`D_ACTIVA_DEMANDA_XDV_${2}`, 3124, AddresType.HR),
                estado: this.createAddress(`D_ESTADO_XDV_${2}`, 3152, AddresType.HR),
            });

        this.condicion_segura_valvulas = this.createAddress("D_CONDICION_SEGURA_VALVULAS", 9, AddresType.HR);

        this.pozoID_1 = this.createAddress("D_POZO_ID_1", 1380, AddresType.HR);
        this.pozoID_2 = this.createAddress("D_POZO_ID_2", 1381, AddresType.HR);

        this.diametroOrificioManifold_1 = this.createAddress("D_DIAMETRO_ORIFICIO_MANIFOLD_1", 1384, AddresType.HR);
        this.diametroOrificioManifold_2 = this.createAddress("D_DIAMETRO_ORIFICIO_MANIFOLD_2", 1385, AddresType.HR);

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

        this.setRangoIng(1, 0, 430);// Presión de Pozo (kg/cm²)
        this.setRangoIng(2, -20, 150);// Temperatura de Pozo (°C)
        this.setRangoIng(3, 0, 100);// Presión Anular (kg/cm²)

        this.setRangoIng(4, 0, 25);// Presión de Ingreso al Separador (kg/cm²)
        this.setRangoIng(5, 0, 25);// Presión del Separador (kg/cm²)
        this.setRangoIng(6, 0, 25);// Presión de Salida del Separador (kg/cm²)

        // Medición de Agua
        this.setRangoIng(7, 0, 100);// Caudal volumétrico (m³/d)
        this.setRangoIng(8, 950, 1100);// Densidad (kg/m³)
        this.setRangoIng(9, 0, 100);// Temperatura (°C)
        this.setRangoIng(10, 0, 100000);// Volumen acumulado (m³)

        // Medición de Petróleo
        this.setRangoIng(11, 0, 200);// Caudal volumétrico (m³/d)
        this.setRangoIng(12, 700, 1000);// Densidad (kg/m³)
        this.setRangoIng(13, 0, 100);// Temperatura (°C)
        this.setRangoIng(14, 0, 100000);// Volumen acumulado (m³)

        // Medición de Gas
        this.setRangoIng(15, 0, 10000);// Caudal volumétrico (Sm³/d)
        this.setRangoIng(16, 0.6, 1.5);// Densidad a condiciones estándar (kg/m³)
        this.setRangoIng(17, -20, 80);// Temperatura (°C)
        this.setRangoIng(18, 0, 10000000);// Volumen acumulado (Sm³)

        // Niveles de piletas (m)
        this.setRangoIng(19, 0, 2.5);// Pileta 1
        this.setRangoIng(20, 0, 2.5);// Pileta 2
        this.setRangoIng(21, 0, 2.5);// Pileta 3
        this.setRangoIng(22, 0, 2.5);// Pileta 4
        this.setRangoIng(23, 0, 2.5);// Pileta 5
        this.setRangoIng(24, 0, 2.5);// Pileta 6

    }

    setRangoIng(analogicoIndex: number, min: number, max: number)
    {
        this.getAnalogico(analogicoIndex).ingenieriaMin.write(min);
        this.getAnalogico(analogicoIndex).ingenieriaMax.write(max);
    }

    execute(): void
    {
        super.execute();

        // Se calcula el volumen de la pileta
        for (let i = 19; i <= 24; i++)
        {
            const instrumentoNivel = this.getAnalogico(i);
            const pileta = this.getPileta(i - 18);

            pileta.volumen.write(this.calcularVolumenPileta(
                instrumentoNivel.valor.read(),
                instrumentoNivel.ingenieriaMax.read(),
                pileta.area.read()
            ));
        }
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
