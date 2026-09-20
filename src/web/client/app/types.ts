export type RegisterGroup = "analogicos" | "digitales" | "directos";
export type MainView = "modbus" | "st" | "st-monitor";

export type RegisterRow = {
    address: number;
    formattedAddress: string;
    type: string;
    group: RegisterGroup;
    name: string;
    description: string;
    writable: string;
    runtimeFunction: string;
    expression: string;
    configValue: string;
    modbusValue: string;
};

export type RegistersResponse = {
    rows: RegisterRow[];
};