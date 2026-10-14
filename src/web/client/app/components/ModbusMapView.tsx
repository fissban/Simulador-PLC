import { createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { RegisterRow, RegistersResponse } from "../types";

const REFRESH_INTERVAL_MS = 1000;

export function ModbusMapView()
{
    const [rows, setRows] = createSignal<RegisterRow[]>([]);
    const [isLoading, setIsLoading] = createSignal(true);
    const [error, setError] = createSignal("");
    const [autoRefresh, setAutoRefresh] = createSignal(true);
    const [search, setSearch] = createSignal("");

    // Filtra las filas por el texto de búsqueda (dir., nombre, tipo, valor, desc.).
    const filteredRows = createMemo(() =>
    {
        const term = search().trim().toLowerCase();
        if (!term)
        {
            return rows();
        }

        return rows().filter((row) =>
            row.formattedAddress.toLowerCase().includes(term) ||
            row.name.toLowerCase().includes(term) ||
            row.type.toLowerCase().includes(term) ||
            row.value.toLowerCase().includes(term) ||
            row.description.toLowerCase().includes(term)
        );
    });

    const loadRows = async () =>
    {
        setError("");

        try
        {
            const response = await fetch("/api/registers");
            if (!response.ok)
            {
                throw new Error(`HTTP ${response.status}`);
            }

            const payload = (await response.json()) as RegistersResponse;
            setRows(payload.rows ?? []);
        }
        catch (loadError)
        {
            setError((loadError as Error).message);
        }
        finally
        {
            setIsLoading(false);
        }
    };

    onMount(() =>
    {
        void loadRows();

        let timer: ReturnType<typeof setInterval> | undefined;

        const startTimer = () =>
        {
            timer = setInterval(() =>
            {
                if (autoRefresh())
                {
                    void loadRows();
                }
            }, REFRESH_INTERVAL_MS);
        };

        startTimer();

        onCleanup(() =>
        {
            if (timer)
            {
                clearInterval(timer);
            }
        });
    });

    return (
        <section class="st-monitor-panel">
            <div class="st-monitor-toolbar">
                <strong>Mapa Modbus</strong>
                <input
                    class="st-monitor-search"
                    type="search"
                    placeholder="Buscar por dirección, nombre, tipo, valor..."
                    value={search()}
                    onInput={(event) => setSearch(event.currentTarget.value)}
                />
                <label class="auto-refresh-toggle">
                    <input
                        type="checkbox"
                        checked={autoRefresh()}
                        onChange={(event) => setAutoRefresh(event.currentTarget.checked)}
                    />
                    <span>Tiempo real</span>
                </label>
                <button class="primary-action" type="button" onClick={() => void loadRows()}>
                    Actualizar
                </button>
            </div>

            {error() && <div class="empty-state">Error al cargar registros: {error()}</div>}

            {!error() && (
                <div class="st-monitor-table-wrap">
                    <table class="st-monitor-table">
                        <thead>
                            <tr>
                                <th>Dirección</th>
                                <th>Nombre</th>
                                <th>Tipo</th>
                                <th>Valor</th>
                                <th>Descripción</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredRows().map((row) => (
                                <tr>
                                    <td>{row.formattedAddress}</td>
                                    <td>{row.name}</td>
                                    <td>{row.type}</td>
                                    <td>{row.value}</td>
                                    <td>{row.description}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <div class="st-monitor-meta">
                {isLoading()
                    ? "Cargando registros..."
                    : `${filteredRows().length} de ${rows().length} registros mostrados${autoRefresh() ? " · actualización en tiempo real" : ""}`}
            </div>
        </section>
    );
}
