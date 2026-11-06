import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { serverConfigManager } from "../../config/ServerConfigManager";
import type { InstrumentMapping } from "../../memory/MappingManager";
import { AddresType } from "../../plc/core/DataModel";
import { simulatorManager } from "../../plc/managers/SimulatorManager";
import type { SimulatorInstance } from "../../plc/managers/SimulatorInstance";

interface RegisterRow
{
    address: number;
    formattedAddress: string;
    type: string;
    name: string;
    group: string;
    instrument?: InstrumentMapping;
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
 * de una instancia, leyendo su valor actual desde su memoria.
 */
function buildRows(instance: SimulatorInstance): RegisterRow[]
{
    return instance.getMappings().map((entry) =>
    {
        return {
            address: entry.address,
            formattedAddress: String(entry.address),
            type: getTypeLabel(entry.addressType),
            name: entry.name,
            group: entry.group,
            instrument: entry.instrument,
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

/**
 * Responde con un objeto JSON y el código de estado indicado.
 */
function sendJson(res: http.ServerResponse, statusCode: number, payload: unknown): void
{
    res.writeHead(statusCode, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
    });
    res.end(JSON.stringify(payload));
}

/**
 * Lee y parsea el cuerpo JSON de una petición. Resuelve `{}` si viene vacío.
 */
function readJsonBody(req: http.IncomingMessage): Promise<any>
{
    return new Promise((resolve, reject) =>
    {
        let raw = "";
        req.on("data", (chunk) => { raw += chunk; });
        req.on("end", () =>
        {
            if (!raw.trim())
            {
                resolve({});
                return;
            }
            try { resolve(JSON.parse(raw)); }
            catch { reject(new Error("JSON inválido en el cuerpo de la petición.")); }
        });
        req.on("error", reject);
    });
}

/**
 * Maneja las acciones de control de una instancia recibidas por POST.
 * Body esperado: `{ action: "select" | "selectAndStart" | "start" | "pause" | "stop", id?: string }`
 * donde `id` es el id del programa a cargar.
 */
async function handleInstanceAction(instance: SimulatorInstance, req: http.IncomingMessage, res: http.ServerResponse): Promise<void>
{
    let body: any;
    try { body = await readJsonBody(req); }
    catch (error)
    {
        sendJson(res, 400, { error: (error as Error).message });
        return;
    }

    const action = String(body.action ?? "");

    try
    {
        switch (action)
        {
            case "select":
                sendJson(res, 200, instance.select(String(body.id)));
                return;
            case "selectAndStart":
                sendJson(res, 200, instance.selectAndStart(String(body.id)));
                return;
            case "start":
                sendJson(res, 200, instance.start());
                return;
            case "pause":
                sendJson(res, 200, instance.pause());
                return;
            case "stop":
                sendJson(res, 200, instance.stop());
                return;
            default:
                sendJson(res, 400, { error: `Acción desconocida: "${action}"` });
                return;
        }
    }
    catch (error)
    {
        sendJson(res, 400, { error: (error as Error).message });
    }
}

export function startWebServer(): void
{
    const host = serverConfigManager.getHost() ?? "0.0.0.0";
    const port = serverConfigManager.getWebPort();

    const webServer = http.createServer((req, res) =>
    {
        const requestUrl = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

        // Listado de instancias con su estado.
        if (requestUrl.pathname === "/api/instances" && req.method === "GET")
        {
            sendJson(res, 200, { instances: simulatorManager.getAllStatus() });
            return;
        }

        // Rutas por instancia: /api/instances/:id y /api/instances/:id/registers
        const instanceMatch = /^\/api\/instances\/([^/]+)(\/registers)?$/.exec(requestUrl.pathname);
        if (instanceMatch)
        {
            const instance = simulatorManager.get(decodeURIComponent(instanceMatch[1]));
            if (!instance)
            {
                sendJson(res, 404, { error: `Instancia desconocida: "${decodeURIComponent(instanceMatch[1])}"` });
                return;
            }

            const isRegisters = instanceMatch[2] !== undefined;

            if (isRegisters && req.method === "GET")
            {
                sendJson(res, 200, { rows: buildRows(instance) });
                return;
            }

            if (!isRegisters && req.method === "GET")
            {
                sendJson(res, 200, instance.getStatus());
                return;
            }

            // Acciones de control: select / selectAndStart / start / pause / stop.
            if (!isRegisters && req.method === "POST")
            {
                void handleInstanceAction(instance, req, res);
                return;
            }

            sendJson(res, 405, { error: "Método no permitido." });
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
