import { createMemo, createSignal, onCleanup, onMount } from "solid-js";

type StMonitorRow = {
    name: string;
    displayName: string;
    section: string;
    stType: string;
    atAddressRaw: string;
    address: number | null;
    value: string;
};

export function StVariableMonitorView()
{
    const [rows, setRows] = createSignal<StMonitorRow[]>([]);
    const [isLoading, setIsLoading] = createSignal(false);
    const [filter, setFilter] = createSignal("");

    const filteredRows = createMemo(() =>
    {
        const query = filter().trim().toLowerCase();
        if (!query)
        {
            return rows();
        }

        return rows().filter((row) =>
        {
            return (
                row.displayName.toLowerCase().includes(query) ||
                row.section.toLowerCase().includes(query) ||
                row.stType.toLowerCase().includes(query) ||
                row.atAddressRaw.toLowerCase().includes(query)
            );
        });
    });

    const refreshRows = async () =>
    {
        setIsLoading(true);
        try
        {
            const response = await fetch("/api/st/monitor");
            if (!response.ok)
            {
                return;
            }

            const payload = (await response.json()) as { rows?: StMonitorRow[]; };
            setRows(payload.rows ?? []);
        } finally
        {
            setIsLoading(false);
        }
    };

    onMount(() =>
    {
        void refreshRows();
        const intervalId = window.setInterval(() =>
        {
            void refreshRows();
        }, 1000);

        onCleanup(() => window.clearInterval(intervalId));
    });

    return (
        <section class="st-layout">
            <div class="st-panel">
                <div class="st-panel-header">
                    <span>Monitoreo de Variables ST</span>
                </div>

                <div class="st-monitor-panel">
                    <div class="st-monitor-toolbar">
                        <input type="text" value={filter()} onInput={(event) => setFilter(event.currentTarget.value)} placeholder="Filtrar por nombre, sección, tipo o AT" />
                        <button class="secondary-action" type="button" onClick={() => void refreshRows()}>
                            Actualizar
                        </button>
                    </div>

                    <div class="st-monitor-table-wrap">
                        <table class="st-monitor-table">
                            <thead>
                                <tr>
                                    <th>Variable</th>
                                    <th>Sección</th>
                                    <th>Tipo</th>
                                    <th>AT</th>
                                    <th>Addr</th>
                                    <th>Valor</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRows().map((row) => (
                                    <tr>
                                        <td>{row.displayName}</td>
                                        <td>{row.section}</td>
                                        <td>{row.stType}</td>
                                        <td>{row.atAddressRaw || "-"}</td>
                                        <td>{row.address ?? "-"}</td>
                                        <td>{row.value}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div class="st-monitor-meta">{isLoading() ? "Cargando monitoreo..." : `${filteredRows().length} variables mostradas`}</div>
                </div>
            </div>
        </section>
    );
}
