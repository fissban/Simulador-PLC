import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { addressData, RegisterTypes } from "../data/AddressData";
import { serverConfigData } from "../data/ServerConfigData";
import { bufferManager } from "../simulator/managers/BufferManager";

interface RegisterRow
{
    address: number;
    formattedAddress: string;
    type: RegisterTypes;
    name: string;
    description: string;
    writable: string;
    runtimeFunction: string;
    expression: string;
    configValue: string;
    modbusValue: string;
}

const PUBLIC_DIR = path.join(__dirname, "public");
const INDEX_FILE = path.join(PUBLIC_DIR, "index.html");

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
    return addressData.getAll().map((register) => ({
        address: register.address,
        formattedAddress: formatAddress(register.address, register.type, register.bit),
        type: register.type,
        name: register.name,
        description: register.description ?? "",
        writable: String(register.writable ?? false),
        runtimeFunction: register.runtimeFunction ?? "",
        expression: register.expression ?? "",
        configValue: String(register.value),
        modbusValue: getModbusValue(register.address, register.type, register.bit)
    }));
}

function sortRowsByAddress(rows: RegisterRow[]): RegisterRow[]
{
    return [...rows].sort((a, b) => a.address - b.address);
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

    const webServer = http.createServer((req, res) =>
    {
        const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

        if (requestUrl.pathname === "/api/registers")
        {
            const rows = sortRowsByAddress(buildRows());
            res.writeHead(200, {
                "Content-Type": "application/json; charset=utf-8",
                "Cache-Control": "no-store"
            });
            res.end(JSON.stringify({ rows }));
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
