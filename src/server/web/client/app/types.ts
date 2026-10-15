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

export type ProgramStatus = {
    id: string;
    name: string;
    description: string;
    selected: boolean;
    running: boolean;
};

export type SimulatorState = "running" | "paused" | "stopped";

export type SimulatorStatus = {
    activeId: string | null;
    activeName: string | null;
    running: boolean;
    state: SimulatorState;
    programs: ProgramStatus[];
};