import { createMemo, createSignal, type JSX } from "solid-js";
import type { RegisterRow } from "../types";

export function createInstrumentIndex(rows: () => RegisterRow[])
{
    const instruments = createMemo(() =>
    {
        const result = new Map<number, Map<string, RegisterRow>>();
        for (const row of rows())
        {
            if (!row.instrument) continue;
            let fields = result.get(row.instrument.number);
            if (!fields)
            {
                fields = new Map();
                result.set(row.instrument.number, fields);
            }
            fields.set(row.instrument.field, row);
        }
        return result;
    });

    return {
        instruments,
        numbers: createMemo(() => Array.from(instruments().keys()).sort((a, b) => a - b)),
        missingMetadata: createMemo(() => rows().filter((row) => !row.instrument).length)
    };
}

export function TreeBranch(props: { label: JSX.Element; forceOpen: boolean; children: JSX.Element })
{
    const [expanded, setExpanded] = createSignal(false);

    return (
        <details class="analog-branch" open={props.forceOpen || expanded()}>
            <summary onClick={(event) =>
            {
                event.preventDefault();
                setExpanded(!expanded());
            }}>
                {props.label}
            </summary>
            <div class="analog-children">{props.children}</div>
        </details>
    );
}

export function RegisterLeaf(props: {
    label: string;
    row: RegisterRow | undefined;
    value?: string;
    bit?: number;
    active?: boolean;
})
{
    return (
        <div class="analog-register">
            <div class="analog-register-label">
                <span>{props.label}</span>
                <small>{props.row?.name ?? "Sin mapeo"}</small>
            </div>
            <strong class="analog-register-value" classList={{ "alarm-active": props.active === true }}>
                {props.value ?? props.row?.value ?? "No disponible"}
            </strong>
            <code class="analog-register-address">
                {props.row ? `${props.row.formattedAddress}${props.bit === undefined ? "" : `.${props.bit}`}` : "—"}
            </code>
            <span class="analog-register-type">{props.bit === undefined ? props.row?.type : "Bit"}</span>
        </div>
    );
}
