const POLL_INTERVAL_MS = 1000;
const fields = [
    "formattedAddress",
    "type",
    "name",
    "description",
    "writable",
    "runtimeFunction",
    "expression",
    "configValue",
    "modbusValue"
];

const rowsBody = document.getElementById("rows-body");
const totalCount = document.getElementById("total-count");

function createRowElement(address)
{
    const rowElement = document.createElement("tr");
    rowElement.dataset.address = String(address);

    for (const field of fields)
    {
        const cell = document.createElement("td");
        cell.dataset.key = field;
        rowElement.appendChild(cell);
    }

    return rowElement;
}

function updateRowElement(rowElement, row)
{
    for (const field of fields)
    {
        const cell = rowElement.querySelector(`[data-key="${field}"]`);
        if (!cell)
        {
            continue;
        }

        const nextValue = String(row[field] ?? "");
        if (cell.textContent !== nextValue)
        {
            cell.textContent = nextValue;
        }
    }
}

function applyRows(rows)
{
    const existingRows = new Map(
        Array.from(rowsBody.querySelectorAll("tr[data-address]")).map((rowElement) => [rowElement.dataset.address, rowElement])
    );

    for (const row of rows)
    {
        const addressKey = String(row.address);
        let rowElement = existingRows.get(addressKey);

        if (!rowElement)
        {
            rowElement = createRowElement(addressKey);
        }        

        updateRowElement(rowElement, row);
        rowsBody.appendChild(rowElement);
        existingRows.delete(addressKey);
    }

    for (const staleRow of existingRows.values())
    {
        staleRow.remove();
    }

    totalCount.textContent = String(rows.length);
}

async function refreshRows()
{
    try
    {
        const response = await fetch("/api/registers", { cache: "no-store" });
        if (!response.ok)
        {
            return;
        }

        const payload = await response.json();
        const rows = Array.isArray(payload.rows) ? payload.rows : [];
        applyRows(rows);
    }
    catch (_error)
    {
    }
}

refreshRows();
setInterval(refreshRows, POLL_INTERVAL_MS);
