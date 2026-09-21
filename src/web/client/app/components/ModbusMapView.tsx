import { createSignal, onMount } from "solid-js";
import type { RegisterRow, RegistersResponse } from "../types";

export function ModbusMapView()
{
    const [rows, setRows] = createSignal<RegisterRow[]>([]);
    const [isLoading, setIsLoading] = createSignal(true);
    const [error, setError] = createSignal("");

    const loadRows = async () =>
    {
        setIsLoading(true);
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
    });

    return (
        <section class="st-monitor-panel">
            <div class="st-monitor-toolbar">
                <strong>Mapa Modbus</strong>
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
                                <th>Grupo</th>
                                <th>Tipo</th>
                                <th>Config</th>
                                <th>Modbus</th>
                                <th>Descripción</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows().map((row) => (
                                <tr>
                                    <td>{row.formattedAddress}</td>
                                    <td>{row.name}</td>
                                    <td>{row.group}</td>
                                    <td>{row.type}</td>
                                    <td>{row.configValue}</td>
                                    <td>{row.modbusValue}</td>
                                    <td>{row.description}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <div class="st-monitor-meta">
                {isLoading() ? "Cargando registros..." : `${rows().length} registros mostrados`}
            </div>
        </section>
    );
}
