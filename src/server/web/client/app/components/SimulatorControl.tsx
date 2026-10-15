import { createSignal, For, onCleanup, onMount } from "solid-js";
import type { SimulatorStatus } from "../types";

const REFRESH_INTERVAL_MS = 2000;

/**
 * Panel de control del simulador: permite seleccionar qué programa (software)
 * ejecutar y arrancarlo/pararlo en caliente contra la API `/api/simulator`.
 */
export function SimulatorControl()
{
    const [status, setStatus] = createSignal<SimulatorStatus | null>(null);
    const [selectedId, setSelectedId] = createSignal<string>("");
    const [error, setError] = createSignal("");
    const [busy, setBusy] = createSignal(false);

    const applyStatus = (next: SimulatorStatus) =>
    {
        setStatus(next);
        // Si el usuario no eligió nada aún, reflejar el programa activo.
        if (!selectedId() && next.activeId)
        {
            setSelectedId(next.activeId);
        }
    };

    const loadStatus = async () =>
    {
        try
        {
            const response = await fetch("/api/simulator");
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            applyStatus((await response.json()) as SimulatorStatus);
            setError("");
        }
        catch (loadError)
        {
            setError((loadError as Error).message);
        }
    };

    const sendAction = async (action: string, id?: string) =>
    {
        setBusy(true);
        setError("");
        try
        {
            const response = await fetch("/api/simulator", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action, id })
            });
            const payload = await response.json();
            if (!response.ok) throw new Error(payload.error ?? `HTTP ${response.status}`);
            applyStatus(payload as SimulatorStatus);
        }
        catch (actionError)
        {
            setError((actionError as Error).message);
        }
        finally
        {
            setBusy(false);
        }
    };

    onMount(() =>
    {
        void loadStatus();
        const timer = setInterval(() => void loadStatus(), REFRESH_INTERVAL_MS);
        onCleanup(() => clearInterval(timer));
    });

    const isRunning = () => status()?.running ?? false;
    const state = () => status()?.state ?? "stopped";
    const activeId = () => status()?.activeId ?? null;
    const activeName = () => status()?.activeName ?? null;
    const selectionChanged = () => selectedId() !== activeId();

    const stateLabel = () =>
    {
        switch (state())
        {
            case "running": return "● En ejecución";
            case "paused": return "⏸ Pausado";
            default: return "■ Detenido";
        }
    };

    return (
        <section class="simulator-control">
            <div class="simulator-control-header">
                <h2>Programa del PLC</h2>
                <span
                    class="simulator-state"
                    classList={{
                        running: state() === "running",
                        paused: state() === "paused",
                        stopped: state() === "stopped"
                    }}
                >
                    {stateLabel()}
                </span>
            </div>

            <p class="simulator-active">
                Software en ejecución:{" "}
                <strong>{activeName() ?? "ninguno"}</strong>
                {activeId() && <span class="simulator-active-id"> ({activeId()})</span>}
            </p>

            <div class="simulator-control-row">
                <select
                    class="simulator-select"
                    value={selectedId()}
                    disabled={busy()}
                    onChange={(e) => setSelectedId(e.currentTarget.value)}
                >
                    <For each={status()?.programs ?? []}>
                        {(program) => (
                            <option value={program.id}>
                                {program.name}{program.id === activeId() ? " (cargado)" : ""}
                            </option>
                        )}
                    </For>
                </select>

                <button
                    type="button"
                    class="btn btn-primary"
                    disabled={busy() || !selectedId() || (isRunning() && !selectionChanged())}
                    onClick={() => void sendAction(selectionChanged() ? "selectAndStart" : "start", selectedId())}
                >
                    {selectionChanged() ? "Cargar y arrancar" : (state() === "paused" ? "Reanudar" : "Arrancar")}
                </button>

                <button
                    type="button"
                    class="btn"
                    disabled={busy() || !isRunning()}
                    onClick={() => void sendAction("pause")}
                >
                    Pausar
                </button>

                <button
                    type="button"
                    class="btn btn-danger"
                    disabled={busy() || (state() === "stopped")}
                    onClick={() => void sendAction("stop")}
                >
                    Detener
                </button>
            </div>

            {error() && <p class="simulator-error">⚠ {error()}</p>}
        </section>
    );
}
