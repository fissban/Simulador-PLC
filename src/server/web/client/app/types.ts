export type MainView = "modbus";

export type RegisterRow = {
    address: number;
    formattedAddress: string;
    type: string;
    name: string;
    description: string;
    writable: string;
    runtimeFunction: string;
    expression: string;
    value: string;
};

export type RegistersResponse = {
    rows: RegisterRow[];
};