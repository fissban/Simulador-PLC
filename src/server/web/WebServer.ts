import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { serverConfigData } from "../data/ServerConfigData";
import { mappingManager } from "../simulator/managers/MappingManager";
import { AddresType } from "../simulator/scripts/types";

interface RegisterRow
{
    address: number;
    formattedAddress: string;
    type: string;
    name: string;
    description: string;
    writable: string;
    runtimeFunction: string;
    expression: string;
    value: string;
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

/**
 * Devuelve la etiqueta legible para un tipo de dirección.
 */
function getTypeLabel(type: AddresType): string
{
    switch (type)
    {
        case AddresType.C: return "Coil";
        case AddresType.HR: return "Holding Register";
        case AddresType.HRF: return "Holding Register Float";
        case AddresType.B: return "Bit";
        default: return "Desconocido";
    }
}

/**
 * Formatea un valor numérico para mostrarlo con un máximo de 3 decimales,
 * eliminando ceros/decimales innecesarios (ej. 12.5, 100, 3.142).
 */
function formatValue(value: number): string
{
    return String(Math.round(value * 1000) / 1000);
}

/**
 * Construye las filas a mostrar en la web a partir de todos los mapeos
 * registrados en `MappingManager`, leyendo su valor actual desde la memoria.
 */
function buildRows(): RegisterRow[]
{
    return mappingManager.getAll().map((entry) =>
    {
        return {
            address: entry.address,
            formattedAddress: String(entry.address),
            type: getTypeLabel(entry.type),
            name: entry.name,
            description: "",
            writable: "",
            runtimeFunction: "",
            expression: "",
            value: formatValue(entry.value)
        };
    });
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

        if (requestUrl.pathname === "/api/registers" && req.method === "GET")
        {
            const rows = buildRows();
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
