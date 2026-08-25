import { For, Show, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";

type RegisterRow = {
    address: number;
    formattedAddress: string;
    type: string;
    name: string;
    description: string;
    writable: string;
    runtimeFunction: string;
    expression: string;
    configValue: string;
    modbusValue: string;
};

type RegistersResponse = {
    rows: RegisterRow[];
};

const POLL_INTERVAL_MS = 1000;
const columns: Array<{ key: keyof RegisterRow; label: string }> = [
    { key: "formattedAddress", label: "Address" },
    { key: "type", label: "Type" },
    { key: "name", label: "Name" },
    { key: "description", label: "Description" },
    { key: "writable", label: "Writable" },
    { key: "runtimeFunction", label: "Runtime Function" },
    { key: "expression", label: "Expression" },
    { key: "configValue", label: "Value (JSON)" },
    { key: "modbusValue", label: "Value (Modbus)" }
];

export function App() {
    const [rows, setRows] = createSignal<RegisterRow[]>([]);
    const [status, setStatus] = createSignal("Conectando...");
    const [lastUpdated, setLastUpdated] = createSignal<string | null>(null);

    const totalCount = createMemo(() => rows().length);

    const refreshRows = async (): Promise<void> => {
        try {
            const response = await fetch("/api/registers", { cache: "no-store" });

            if (!response.ok) {
                setStatus(`HTTP ${response.status}`);
                return;
            }

            const contentType = response.headers.get("content-type") ?? "";
            if (!contentType.includes("application/json")) {
                setStatus("API inválida (se recibió HTML)");
                return;
            }

            const payload = (await response.json()) as RegistersResponse;
            setRows(Array.isArray(payload.rows) ? payload.rows : []);
            setStatus("Activo");
            setLastUpdated(new Date().toLocaleTimeString("es-AR"));
        } catch (error) {
            setStatus(error instanceof Error ? error.message : "Error desconocido");
        }
    };

    onMount(() => {
        void refreshRows();
        const timer = window.setInterval(() => void refreshRows(), POLL_INTERVAL_MS);
        onCleanup(() => window.clearInterval(timer));
    });

    createEffect(() => {
        document.title = `Simulador PLC - ${totalCount()} registros`;
    });

    return (
        <main class="app-shell">
            <header class="hero">
                <div>
                    <p class="eyebrow">Simulador PLC</p>
                    <h1>Registros Modbus + AddressData</h1>
                </div>
                <div class="status-card">
                    <span class="status-dot" data-status={status()} />
                    <div>
                        <strong>{status()}</strong>
                        <p>
                            <Show when={lastUpdated()} fallback="Esperando primer refresco...">
                                Última actualización: {lastUpdated()}
                            </Show>
                        </p>
                    </div>
                </div>
            </header>

            <section class="summary-bar">
                <div>
                    <span class="summary-label">Total de registros</span>
                    <strong>{totalCount()}</strong>
                </div>
                <div>
                    <span class="summary-label">Intervalo</span>
                    <strong>{POLL_INTERVAL_MS} ms</strong>
                </div>
            </section>

            <section class="table-card">
                <div class="table-scroll">
                    <table>
                        <thead>
                            <tr>
                                <For each={columns}>
                                    {(column) => <th>{column.label}</th>}
                                </For>
                            </tr>
                        </thead>
                        <tbody>
                            <For each={rows()}>
                                {(row) => (
                                    <tr>
                                        <For each={columns}>
                                            {(column) => <td>{row[column.key]}</td>}
                                        </For>
                                    </tr>
                                )}
                            </For>
                        </tbody>
                    </table>
                </div>
            </section>
        </main>
    );
}
