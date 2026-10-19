import { createMemo, For } from "solid-js";
import type { RegisterRow } from "../types";
import { createInstrumentIndex, RegisterLeaf, TreeBranch } from "./InstrumentTreeParts";

const SCALE_FIELDS = [
    { field: "rangoMin", label: "Rango mínimo" },
    { field: "rangoMax", label: "Rango máximo" },
    { field: "ingenieriaMin", label: "Ingeniería mínima" },
    { field: "ingenieriaMax", label: "Ingeniería máxima" }
];

const ALARMS = [
    { field: "setPointHh", label: "HH" },
    { field: "setPointH", label: "H" },
    { field: "setPointL", label: "L" },
    { field: "setPointLl", label: "LL" }
];

function alarmState(row: RegisterRow | undefined, label: string): boolean | undefined
{
    const position = row?.instrument?.alarmBits?.[label];
    const value = Number(row?.value);
    if (position === undefined || !Number.isInteger(value))
    {
        return undefined;
    }

    return ((value >> position) & 1) === 1;
}

function alarmText(row: RegisterRow | undefined, label: string, isConfig: boolean): string
{
    const state = alarmState(row, label);
    if (state === undefined) return "No disponible";
    return isConfig ? (state ? "Habilitada" : "Deshabilitada") : (state ? "Activa" : "Inactiva");
}

export function AnalogInstrumentTree(props: {
    rows: RegisterRow[];
    search: string;
    isLoading: boolean;
    autoRefresh: boolean;
})
{
    const { instruments, numbers, missingMetadata } = createInstrumentIndex(() => props.rows);
    const term = createMemo(() => props.search.trim().toLowerCase());
    const matchingNumbers = createMemo(() =>
    {
        if (!term()) return new Set(numbers());

        return new Set(numbers().filter((number) =>
        {
            const fields = instruments().get(number);
            const searchText = [
                `Analógico ${number}`,
                "Configuración Escalado Alarmas Estado Entrada cruda Valor Dead band",
                ...SCALE_FIELDS.map((field) => field.label),
                ...Array.from(fields?.values() ?? []).flatMap((row) => [
                    row.name, row.formattedAddress, row.type, row.value, row.description
                ]),
                ...ALARMS.flatMap((alarm) => [
                    `Alarma ${alarm.label}`,
                    alarmText(fields?.get("config"), alarm.label, true),
                    alarmText(fields?.get("estado"), alarm.label, false)
                ])
            ].join(" ").toLowerCase();
            return searchText.includes(term());
        }));
    });
    return (
        <>
            {missingMetadata() > 0 && (
                <div class="empty-state" role="alert">
                    Hay {missingMetadata()} registros analógicos sin datos de instrumento. Actualizá el servidor para mostrar su estructura.
                </div>
            )}
            <div class="analog-tree st-monitor-table-wrap" aria-label="Instrumentos analógicos">
                <div class="analog-tree-heading" aria-hidden="true">
                    <span>Instrumento / Variable</span>
                    <span>Valor / Estado</span>
                    <span>Dirección</span>
                    <span>Tipo</span>
                </div>
                {!props.isLoading && matchingNumbers().size === 0 && (
                    <div class="empty-state">
                        {props.rows.length === 0
                            ? "No hay instrumentos analógicos."
                            : "No hay instrumentos que coincidan con la búsqueda."}
                    </div>
                )}
                <For each={numbers()}>
                    {(number) =>
                    {
                        const row = (field: string) => instruments().get(number)?.get(field);
                        const activeAlarms = () => ALARMS.filter((alarm) => alarmState(row("estado"), alarm.label) === true);
                        const stateAvailable = () => ALARMS.every((alarm) => alarmState(row("estado"), alarm.label) !== undefined);

                        return (
                            <article class="analog-instrument" hidden={!matchingNumbers().has(number)}>
                                <TreeBranch
                                    forceOpen={!!term()}
                                    label={
                                        <span class="analog-instrument-summary">
                                            <strong>Analógico {number}</strong>
                                            <span class="analog-instrument-value">Valor: {row("valor")?.value ?? "No disponible"}</span>
                                            <span class="analog-instrument-status" classList={{ "alarm-active": activeAlarms().length > 0 }}>
                                                {!stateAvailable() ? "Estado no disponible" : activeAlarms().length > 0
                                                    ? `Alarmas activas: ${activeAlarms().map((alarm) => alarm.label).join(", ")}`
                                                    : "Sin alarmas activas"}
                                            </span>
                                        </span>
                                    }
                                >
                                    <RegisterLeaf label="Valor de ingeniería" row={row("valor")} />
                                    <RegisterLeaf label="Entrada cruda" row={row("input")} />
                                    <TreeBranch label="Configuración" forceOpen={!!term()}>
                                        <RegisterLeaf label="Registro de configuración" row={row("config")} />
                                        <TreeBranch label="Escalado" forceOpen={!!term()}>
                                            <For each={SCALE_FIELDS}>
                                                {(field) => <RegisterLeaf label={field.label} row={row(field.field)} />}
                                            </For>
                                        </TreeBranch>
                                        <TreeBranch label="Alarmas" forceOpen={!!term()}>
                                            <For each={ALARMS}>
                                                {(alarm) => (
                                                    <TreeBranch label={`Alarma ${alarm.label}`} forceOpen={!!term()}>
                                                        <RegisterLeaf
                                                            label="Habilitada"
                                                            row={row("config")}
                                                            bit={row("config")?.instrument?.alarmBits?.[alarm.label]}
                                                            value={alarmText(row("config"), alarm.label, true)}
                                                        />
                                                        <RegisterLeaf label="Set point" row={row(alarm.field)} />
                                                    </TreeBranch>
                                                )}
                                            </For>
                                        </TreeBranch>
                                        <RegisterLeaf label="Dead band" row={row("deadBand")} />
                                    </TreeBranch>
                                    <TreeBranch label="Estado" forceOpen={!!term()}>
                                        <RegisterLeaf label="Registro de estado" row={row("estado")} />
                                        <For each={ALARMS}>
                                            {(alarm) => (
                                                <RegisterLeaf
                                                    label={`Alarma ${alarm.label}`}
                                                    row={row("estado")}
                                                    bit={row("estado")?.instrument?.alarmBits?.[alarm.label]}
                                                    value={alarmText(row("estado"), alarm.label, false)}
                                                    active={alarmState(row("estado"), alarm.label)}
                                                />
                                            )}
                                        </For>
                                    </TreeBranch>
                                </TreeBranch>
                            </article>
                        );
                    }}
                </For>
            </div>
            <div class="st-monitor-meta">
                {props.isLoading ? "Cargando instrumentos..."
                    : `${matchingNumbers().size} de ${numbers().length} instrumentos mostrados${props.autoRefresh ? " · actualización en tiempo real" : ""}`}
            </div>
        </>
    );
}
