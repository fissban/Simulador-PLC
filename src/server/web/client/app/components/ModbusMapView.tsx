import { createMemo, createSignal, onCleanup, onMount } from "solid-js";
import type { RegisterRow, RegistersResponse } from "../types";

const REFRESH_INTERVAL_MS = 1000;
const MAPPING_GROUPS = [
    { value: "Analogico", label: "Analógicos" },
    { value: "Digital", label: "Digitales" },
    { value: "Directo", label: "Directos" }
] as const;
type MappingGroup = typeof MAPPING_GROUPS[number]["value"];

export function ModbusMapView()
{
    const [rows, setRows] = createSignal<RegisterRow[]>([]);
    const [isLoading, setIsLoading] = createSignal(true);
    const [error, setError] = createSignal("");
    const [autoRefresh, setAutoRefresh] = createSignal(true);
    const [search, setSearch] = createSignal("");
    const [activeGroup, setActiveGroup] = createSignal<MappingGroup>("Analogico");
    const groupRows = createMemo(() => rows().filter((row) => row.group === activeGroup()));

    const filteredRows = createMemo(() =>
    {
        const term = search().trim().toLowerCase();
        if (!term)
        {
            return groupRows();
        }

        return groupRows().filter((row) =>
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

            <div class="group-tabs" role="tablist" aria-label="Grupos de mapeos">
                {MAPPING_GROUPS.map((group, index) => (
                    <button
                        id={`mapping-tab-${group.value}`}
                        class="group-tab"
                        classList={{ active: activeGroup() === group.value }}
                        type="button"
                        role="tab"
                        aria-selected={activeGroup() === group.value}
                        aria-controls="mapping-group-panel"
                        tabIndex={activeGroup() === group.value ? 0 : -1}
                        onClick={() => setActiveGroup(group.value)}
                        onKeyDown={(event) =>
                        {
                            let nextIndex: number;
                            switch (event.key)
                            {
                                case "ArrowDown":
                                case "ArrowRight": nextIndex = (index + 1) % MAPPING_GROUPS.length; break;
                                case "ArrowUp":
                                case "ArrowLeft": nextIndex = (index + MAPPING_GROUPS.length - 1) % MAPPING_GROUPS.length; break;
                                case "Home": nextIndex = 0; break;
                                case "End": nextIndex = MAPPING_GROUPS.length - 1; break;
                                default: return;
                            }

                            event.preventDefault();
                            const nextGroup = MAPPING_GROUPS[nextIndex];
                            setActiveGroup(nextGroup.value);
                            event.currentTarget.parentElement
                                ?.querySelector<HTMLButtonElement>(`#mapping-tab-${nextGroup.value}`)?.focus();
                        }}
                    >
                        <span>{group.label}</span>
                        <strong>{rows().filter((row) => row.group === group.value).length}</strong>
                    </button>
                ))}
            </div>

            <div
                id="mapping-group-panel"
                role="tabpanel"
                aria-labelledby={`mapping-tab-${activeGroup()}`}
                tabIndex={0}
            >
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
                                {!isLoading() && filteredRows().length === 0 && (
                                    <tr>
                                        <td colSpan={5} class="empty-state">
                                            {groupRows().length === 0
                                                ? "No hay registros en este grupo."
                                                : "No hay registros que coincidan con la búsqueda."}
                                        </td>
                                    </tr>
                                )}
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
                        : `${filteredRows().length} de ${groupRows().length} registros del grupo mostrados${autoRefresh() ? " · actualización en tiempo real" : ""}`}
                </div>
            </div>
        </section>
    );
}
