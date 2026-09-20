import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { addressData, RegisterGroup, RegisterTypes } from "../data/AddressData";
import { serverConfigData } from "../data/ServerConfigData";
import { bufferManager } from "../simulator/managers/BufferManager";
import { stToJavaScriptManager } from "../simulator/managers/StToJavaScriptManager";
import { StVariableAddressEntry, stVariableAddressManager } from "../simulator/managers/StVariableAddressManager";

interface RegisterRow
{
    address: number;
    formattedAddress: string;
    type: RegisterTypes;
    group: RegisterGroup;
    name: string;
    description: string;
    writable: string;
    runtimeFunction: string;
    expression: string;
    configValue: string;
    modbusValue: string;
}

interface StMonitorRow
{
    name: string;
    displayName: string;
    section: string;
    stType: string;
    atAddressRaw: string;
    address: number | null;
    value: string;
}

const PUBLIC_DIR = path.join(__dirname, "public");
const INDEX_FILE = path.join(PUBLIC_DIR, "index.html");
const ST_PROGRAM_FILE = path.resolve(__dirname, "../../config/st-program.st");

function readStProgram(): string
{
    try
    {
        if (fs.existsSync(ST_PROGRAM_FILE))
        {
            return fs.readFileSync(ST_PROGRAM_FILE, "utf8");
        }
    }
    catch (error)
    {
        console.error("[Web][ERROR] No se pudo leer st-program.st:", (error as Error).message);
    }

    return "";
}

function writeStProgram(source: string): void
{
    const directory = path.dirname(ST_PROGRAM_FILE);
    if (!fs.existsSync(directory))
    {
        fs.mkdirSync(directory, { recursive: true });
    }

    fs.writeFileSync(ST_PROGRAM_FILE, source, "utf8");
}

function readRequestBody(req: http.IncomingMessage, limitBytes = 1024 * 1024): Promise<string>
{
    return new Promise((resolve, reject) =>
    {
        let received = 0;
        const chunks: Buffer[] = [];

        req.on("data", (chunk: Buffer) =>
        {
            received += chunk.length;
            if (received > limitBytes)
            {
                reject(new Error("Payload demasiado grande"));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
        req.on("error", reject);
    });
}

const MIME_TYPES: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".txt": "text/plain; charset=utf-8"
};

function getModbusValue(address: number, type: RegisterTypes, bit?: number): string
{
    switch (type)
    {
        case RegisterTypes.COIL:
            return String(bufferManager.getCoil(address));

        case RegisterTypes.HOLDING_REGISTER:
            return String(bufferManager.getInt16(address));

        case RegisterTypes.HOLDING_REGISTER_FLOAT:
            return bufferManager.getFloat32(address).toFixed(4);

        case RegisterTypes.HOLDING_REGISTER_BIT:
            return String(bufferManager.getBit(address, bit ?? 0));

        default:
            return "N/A";
    }
}

function formatAddress(address: number, type: RegisterTypes, bit?: number): string
{
    const paddedAddress = String(address).padStart(4, "0");

    switch (type)
    {
        case RegisterTypes.COIL:
            return `C${paddedAddress}`;

        case RegisterTypes.HOLDING_REGISTER:
            return `HR${paddedAddress}`;

        case RegisterTypes.HOLDING_REGISTER_FLOAT:
            return `HRF${paddedAddress}`;

        case RegisterTypes.HOLDING_REGISTER_BIT:
            return `HR${paddedAddress}.${bit ?? 0}`;

        default:
            return paddedAddress;
    }
}

function buildRows(): RegisterRow[]
{
    return addressData.getAll()
        .map((register) => ({
            address: register.address,
            formattedAddress: formatAddress(register.address, register.type, register.bit),
            type: register.type,
            group: register.group,
            name: register.name,
            description: register.description ?? "",
            writable: String(register.writable ?? false),
            runtimeFunction: register.runtimeFunction ?? "",
            expression: register.expression ?? "",
            configValue: String(register.value),
            modbusValue: getModbusValue(register.address, register.type, register.bit)
        }))
        .sort((a, b) => a.address - b.address);
}

function getStTypeBase(stType: string): string
{
    const arrayTypeMatch = stType.match(/ARRAY\s*\[[^\]]+\]\s*OF\s+(.+)$/i);
    const normalized = (arrayTypeMatch ? arrayTypeMatch[1] : stType).trim().toUpperCase();

    if (normalized.includes("BOOL"))
    {
        return "BOOL";
    }

    if (normalized.includes("REAL"))
    {
        return "REAL";
    }

    if (normalized.includes("INT"))
    {
        return "INT";
    }

    return normalized;
}

function formatUnknownValue(value: unknown): string
{
    if (typeof value === "undefined")
    {
        return "N/A";
    }

    if (typeof value === "number")
    {
        return Number.isFinite(value) ? String(value) : "N/A";
    }

    if (typeof value === "boolean")
    {
        return String(value);
    }

    if (typeof value === "string")
    {
        return value;
    }

    return JSON.stringify(value);
}

function getMonitorValue(
    variable: StVariableAddressEntry,
    runtimeContext: Record<string, unknown>,
    stIndex?: number,
    arrayOffset = 0
): string
{
    if (typeof variable.numericAddress !== "number")
    {
        const runtimeValue = runtimeContext[variable.name];

        if (typeof stIndex === "number" && runtimeValue && typeof runtimeValue === "object")
        {
            const arrayContainer = runtimeValue as Record<number, unknown>;
            return formatUnknownValue(arrayContainer[stIndex]);
        }

        return formatUnknownValue(runtimeValue);
    }

    const baseType = getStTypeBase(variable.stType);
    const kind = variable.addressKind ?? "UNKNOWN";
    const baseAddress = variable.numericAddress + arrayOffset;

    if (baseType === "REAL" || kind === "DWORD")
    {
        // `numericAddress` for %MD in ST is MD index; convert to HR index (MD * 2)
        const hrAddress = baseAddress * 2;
        return bufferManager.getFloat32(hrAddress).toFixed(4);
    }

    if (baseType === "BOOL")
    {
        if (typeof variable.bitIndex === "number")
        {
            return String(bufferManager.getBit(baseAddress, variable.bitIndex));
        }

        if (variable.memoryArea === "I" || variable.memoryArea === "Q")
        {
            return String(bufferManager.getCoil(baseAddress));
        }

        return String(bufferManager.getInt16(baseAddress) !== 0);
    }

    return String(bufferManager.getInt16(baseAddress));
}

function buildStMonitorRows(): StMonitorRow[]
{
    const rows: StMonitorRow[] = [];
    const runtimeContext = stToJavaScriptManager.getRuntimeContextSnapshot();

    for (const variable of stVariableAddressManager.getAll())
    {
        const atAddressRaw = variable.atAddressRaw ?? "";

        if (variable.isArray)
        {
            const length = variable.arrayLength ?? 0;
            const startIndex = variable.arrayStartIndex ?? 0;
            for (let index = 0; index < length; index += 1)
            {
                const stIndex = startIndex + index;
                const displayName = `${variable.name}[${stIndex}]`;
                rows.push({
                    name: variable.name,
                    displayName,
                    section: variable.section,
                    stType: variable.stType,
                    atAddressRaw,
                    address: typeof variable.numericAddress === "number" ? variable.numericAddress + index : null,
                    value: getMonitorValue(variable, runtimeContext, stIndex, index)
                });
            }

            continue;
        }

        rows.push({
            name: variable.name,
            displayName: variable.name,
            section: variable.section,
            stType: variable.stType,
            atAddressRaw,
            address: variable.numericAddress ?? null,
            value: getMonitorValue(variable, runtimeContext, undefined, 0)
        });
    }

    return rows;
}

function getSafePublicFilePath(requestPath: string): string | null
{
    const normalizedPath = requestPath === "/" ? "/index.html" : requestPath;
    const filePath = path.resolve(PUBLIC_DIR, `.${normalizedPath}`);

    if (!filePath.startsWith(PUBLIC_DIR))
    {
        return null;
    }

    return filePath;
}

function serveStaticFile(requestPath: string, res: http.ServerResponse): void
{
    const safeFilePath = getSafePublicFilePath(requestPath);

    if (!safeFilePath)
    {
        res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Bad Request");
        return;
    }

    if (!fs.existsSync(safeFilePath) || !fs.statSync(safeFilePath).isFile())
    {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not Found");
        return;
    }

    const extension = path.extname(safeFilePath).toLowerCase();
    const contentType = MIME_TYPES[extension] ?? "application/octet-stream";

    res.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(safeFilePath).pipe(res);
}

function serveIndexHtml(res: http.ServerResponse): void
{
    if (!fs.existsSync(INDEX_FILE))
    {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Build de la web no encontrado. Ejecutá `npm run build`.");
        return;
    }

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    fs.createReadStream(INDEX_FILE).pipe(res);
}

export function startWebServer(): void
{
    const host = serverConfigData.getHost() ?? "0.0.0.0";
    const port = serverConfigData.getWebPort();

    const webServer = http.createServer(async (req, res) =>
    {
        const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

        if (requestUrl.pathname === "/api/st-code")
        {
            if (req.method === "GET")
            {
                const source = readStProgram();
                res.writeHead(200, {
                    "Content-Type": "application/json; charset=utf-8",
                    "Cache-Control": "no-store"
                });
                res.end(JSON.stringify({ source }));
                return;
            }

            if (req.method === "POST" || req.method === "PUT")
            {
                try
                {
                    const raw = await readRequestBody(req);
                    const contentType = req.headers["content-type"] ?? "";
                    let source = "";

                    if (contentType.includes("application/json"))
                    {
                        const parsed = JSON.parse(raw || "{}");
                        source = typeof parsed.source === "string" ? parsed.source : "";
                    }
                    else
                    {
                        source = raw;
                    }

                    writeStProgram(source);

                    try
                    {
                        stVariableAddressManager.load();
                        stToJavaScriptManager.configure();
                    }
                    catch (syncError)
                    {
                        console.error("[Web][ERROR] Error al recargar managers ST:", (syncError as Error).message);
                    }

                    res.writeHead(200, {
                        "Content-Type": "application/json; charset=utf-8",
                        "Cache-Control": "no-store"
                    });
                    res.end(JSON.stringify({ ok: true, bytes: Buffer.byteLength(source, "utf8") }));
                }
                catch (error)
                {
                    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
                    res.end(`Error al guardar: ${(error as Error).message}`);
                }
                return;
            }

            res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
            res.end("Method Not Allowed");
            return;
        }

        if (requestUrl.pathname === "/api/st-code/download" && req.method === "GET")
        {
            const source = readStProgram();
            res.writeHead(200, {
                "Content-Type": "text/plain; charset=utf-8",
                "Content-Disposition": "attachment; filename=\"program.st\"",
                "Cache-Control": "no-store"
            });
            res.end(source);
            return;
        }

        if (requestUrl.pathname === "/api/st/variables" && req.method === "GET")
        {
            const variables = stVariableAddressManager.getAll();
            res.writeHead(200, {
                "Content-Type": "application/json; charset=utf-8",
                "Cache-Control": "no-store"
            });
            res.end(JSON.stringify({ variables }));
            return;
        }

        if (requestUrl.pathname === "/api/st/monitor" && req.method === "GET")
        {
            const rows = buildStMonitorRows();
            res.writeHead(200, {
                "Content-Type": "application/json; charset=utf-8",
                "Cache-Control": "no-store"
            });
            res.end(JSON.stringify({ rows }));
            return;
        }

        if (requestUrl.pathname === "/api/st/js" && req.method === "GET")
        {
            const translation = stToJavaScriptManager.getLastTranslation();
            res.writeHead(200, {
                "Content-Type": "application/json; charset=utf-8",
                "Cache-Control": "no-store"
            });
            res.end(JSON.stringify({ translation }));
            return;
        }

        if (requestUrl.pathname === "/api/st/js/download" && req.method === "GET")
        {
            const translation = stToJavaScriptManager.getLastTranslation();
            res.writeHead(200, {
                "Content-Type": "application/javascript; charset=utf-8",
                "Content-Disposition": "attachment; filename=\"translated-program.js\"",
                "Cache-Control": "no-store"
            });
            res.end(translation?.jsSource ?? "");
            return;
        }

        if (requestUrl.pathname === "/" || requestUrl.pathname === "/index.html")
        {
            serveIndexHtml(res);
            return;
        }

        if (req.method !== "GET")
        {
            res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
            res.end("Method Not Allowed");
            return;
        }

        const staticFilePath = path.join(PUBLIC_DIR, requestUrl.pathname);
        if (!fs.existsSync(staticFilePath) && !path.extname(requestUrl.pathname))
        {
            serveIndexHtml(res);
            return;
        }

        serveStaticFile(requestUrl.pathname, res);
    });

    webServer.on("error", (error: Error) =>
    {
        console.error("[Web][ERROR] Error del servidor:", error.message);
    });

    webServer.listen(port, host, () =>
    {
        console.log(`[Web] Servidor iniciado en http://${host}:${port}`);
    });
}
