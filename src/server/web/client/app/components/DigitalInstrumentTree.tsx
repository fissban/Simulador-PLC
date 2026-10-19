import { createMemo, For } from "solid-js";
import type { RegisterRow } from "../types";
import { createInstrumentIndex, RegisterLeaf, TreeBranch } from "./InstrumentTreeParts";

const CONFIG_FLAGS = [
    { key: "habilitado", label: "Habilitado", on: "Habilitado", off: "Deshabilitado" },
    { key: "noAlarma", label: "NoAlarma", on: "Sí", off: "No" }
];
const ALARM_FLAGS = [
    { key: "habilitada", label: "Habilitada", on: "Habilitada", off: "Deshabilitada" },
    ...Array.from({ length: 5 }, (_, index) => ({
        key: `intlk${index + 1}`, label: `Intlk_${index + 1}`, on: "Activo", off: "Inactivo"
    }))
];

function bitState(row: RegisterRow | undefined, key: string): boolean | undefined
{
    const position = row?.instrument?.bits?.[key];
    const value = Number(row?.value);
    if (position === undefined || !Number.isInteger(value))
    {
        return undefined;
    }

    return ((value >> position) & 1) === 1;
}

function bitText(row: RegisterRow | undefined, key: string, on: string, off: string): string
{
    const state = bitState(row, key);
    return state === undefined ? "No disponible" : state ? on : off;
}

export function DigitalInstrumentTree(props: {
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
            const config = fields?.get("config");
            return [
                `Digital ${number} ID ${number}`,
                "Alarma Activada DelayActivacion DelayDesactivacion Config Valor Registro de valor",
                ...Array.from(fields?.values() ?? []).flatMap((row) => [
                    row.name, row.formattedAddress, row.type, row.value, row.description,
                    ...Object.values(row.instrument?.bits ?? {}).map((bit) => `${row.formattedAddress}.${bit}`)
                ]),
                ...CONFIG_FLAGS.concat(ALARM_FLAGS).flatMap((flag) => [
                    flag.label, bitText(config, flag.key, flag.on, flag.off)
                ]),
                bitText(fields?.get("valor"), "activada", "Activa", "Inactiva"),
                bitText(fields?.get("valor"), "activada", "Alarma activa", "Alarma inactiva"),
                bitText(fields?.get("valor"), "valor", "1", "0")
            ].join(" ").toLowerCase().includes(term());
        }));
    });

    return (
        <>
            {missingMetadata() > 0 && (
                <div class="empty-state" role="alert">
                    Hay {missingMetadata()} registros digitales sin datos de instrumento. Actualizá el servidor para mostrar su estructura.
                </div>
            )}
            <div class="analog-tree digital-tree st-monitor-table-wrap" aria-label="Instrumentos digitales">
                <div class="analog-tree-heading" aria-hidden="true">
                    <span>Instrumento / Variable</span>
                    <span>Valor / Estado</span>
                    <span>Dirección</span>
                    <span>Tipo</span>
                </div>
                {!props.isLoading && matchingNumbers().size === 0 && (
                    <div class="empty-state">
                        {props.rows.length === 0
                            ? "No hay instrumentos digitales."
                            : "No hay instrumentos que coincidan con la búsqueda."}
                    </div>
                )}
                <For each={numbers()}>
                    {(number) =>
                    {
                        const row = (field: string) => instruments().get(number)?.get(field);
                        const active = () => bitState(row("valor"), "activada");
                        return (
                            <article class="analog-instrument digital-instrument" hidden={!matchingNumbers().has(number)}>
                                <TreeBranch
                                    forceOpen={!!term()}
                                    label={
                                        <span class="analog-instrument-summary">
                                            <strong>Digital {number}</strong>
                                            <span class="analog-instrument-value">
                                                Valor: {bitText(row("valor"), "valor", "1", "0")}
                                            </span>
                                            <span class="analog-instrument-status" classList={{ "alarm-active": active() === true }}>
                                                {bitText(row("valor"), "activada", "Alarma activa", "Alarma inactiva")}
                                            </span>
                                        </span>
                                    }
                                >
                                    <TreeBranch label="Alarma" forceOpen={!!term()}>
                                        <RegisterLeaf
                                            label="Activada"
                                            row={row("valor")}
                                            bit={row("valor")?.instrument?.bits?.activada}
                                            value={bitText(row("valor"), "activada", "Activa", "Inactiva")}
                                            active={active()}
                                        />
                                        <RegisterLeaf label="DelayActivacion" row={row("delayActivacion")} />
                                        <RegisterLeaf label="DelayDesactivacion" row={row("delayDesactivacion")} />
                                        <For each={ALARM_FLAGS}>
                                            {(flag) => (
                                                <RegisterLeaf
                                                    label={flag.label}
                                                    row={row("config")}
                                                    bit={row("config")?.instrument?.bits?.[flag.key]}
                                                    value={bitText(row("config"), flag.key, flag.on, flag.off)}
                                                    active={flag.key.startsWith("intlk") && bitState(row("config"), flag.key) === true}
                                                />
                                            )}
                                        </For>
                                    </TreeBranch>
                                    <RegisterLeaf label="Config" row={row("config")} />
                                    <For each={CONFIG_FLAGS}>
                                        {(flag) => (
                                            <RegisterLeaf
                                                label={flag.label}
                                                row={row("config")}
                                                bit={row("config")?.instrument?.bits?.[flag.key]}
                                                value={bitText(row("config"), flag.key, flag.on, flag.off)}
                                            />
                                        )}
                                    </For>
                                    <div class="analog-register">
                                        <div class="analog-register-label">
                                            <span>ID</span>
                                            <small>Número de instrumento (sin registro asociado)</small>
                                        </div>
                                        <strong class="analog-register-value">{number}</strong>
                                    </div>
                                    <RegisterLeaf label="Registro de valor" row={row("valor")} />
                                    <RegisterLeaf
                                        label="Valor"
                                        row={row("valor")}
                                        bit={row("valor")?.instrument?.bits?.valor}
                                        value={bitText(row("valor"), "valor", "1", "0")}
                                    />
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
