import { AddresType, DataModel } from "../core/DataModel";
import { SC } from "./SC";

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
    D_ACTIVA_DEMANDA_VSS: DataModel[] = [];
    D_ESTADO_VSS: DataModel[] = [];

    D_VSS_CONDICION_SEGURA: DataModel | null = null;

    constructor(scanIntervalMs: number = 250)
    {
        super(scanIntervalMs);
    }

    init(): void
    {
        super.init();

        this.D_ACTIVA_DEMANDA_VSS = this.createAddressRange('D_ACTIVA_DEMANDA_VSS', 3120, this.VSS_SIZE, AddresType.HR);
        this.D_ESTADO_VSS = this.createAddressRange('D_ESTADO_VSS', 3148, this.VSS_SIZE, AddresType.HR);
        
        this.D_VSS_CONDICION_SEGURA = this.createAddress("D_VSS_CONDICION_SEGURA", 9, AddresType.HR);
        
    }

    execute(): void
    {
        super.execute();
    }
}
