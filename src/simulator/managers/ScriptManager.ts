import fs from "node:fs";
import path from "node:path";
import { bufferManager } from "./BufferManager";

export enum VarSection
{
    VAR = "VAR",
    VAR_INPUT = "VAR_INPUT",
    VAR_OUTPUT = "VAR_OUTPUT",
    VAR_IN_OUT = "VAR_IN_OUT",
    VAR_GLOBAL = "VAR_GLOBAL",
    VAR_TEMP = "VAR_TEMP",
    VAR_STAT = "VAR_STAT",
    VAR_EXTERNAL = "VAR_EXTERNAL",
    OTHER = "OTHER"
}

export enum MemoryArea
{
    I = "I", // input
    Q = "Q", // output
    M = "M",  // memory
    T = "T"  // temporal
}

export enum ValueType
{
    BIT = "BIT", // boolean
    WORD = "WORD", // int16
    DWORD = "DWORD", // int32
    REAL = "REAL", // float32
    TON = "TON" // timer on delay
}

export interface VariableEntry
{
    name: string;
    address: number;
    memoryArea: MemoryArea;
    varSection: VarSection;
    bufferAction: () => {} | null;
}

class ScriptManager
{
    private readonly PROGRAM_PATH = path.resolve(__dirname, "../../../config/st-program.st");

    private variableMap = new Map<string, VariableEntry>();

    public configure()
    {
        const source = fs.readFileSync(this.PROGRAM_PATH, "utf8");

        // primero, parseamos el archivo y obtenemos las variables
        // VAR_INPUT -> variables de entrada (I)
        // VAR_OUTPUT -> variables de salida (Q)
        // VAR -> variables de memoria (M)

        // vamos a recorrer linea a linea
        const lines = source.replace(/\r\n?/g, "\n").split("\n");

        let inBlockComment = false;
        let currentSection: VarSection = VarSection.OTHER;

        for (let line of lines)
        {
            // se eliminan espacios al inicio y al final
            line = line.trim();

            // linea vacía, se ignora
            if (!line || line.length === 0)
            {
                continue;
            }

            // se chequea si es un comentario de bloque (* *)
            if (inBlockComment)
            {
                if (line.includes("*)"))
                {
                    inBlockComment = false;
                }
                continue;
            }

            if (line.startsWith("(*"))
            {
                if (!line.includes("*)"))
                {
                    inBlockComment = true;
                }
                continue;
            }

            // se chequea si es un comentario simple (//)
            if (line.startsWith("//")) { continue; }

            // se define la sección actual
            const section = this.checkCurrentSection(line);
            if (section == VarSection.OTHER)
            {
                currentSection = section;
                continue;
            }

            // si currentSection es VAR_INPUT, VAR_OUTPUT o VAR, se parsea la variable
            if (currentSection != VarSection.OTHER)
            {
                const declarationMatch = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(?:AT\s+(%[IQM][XWD]?\d+(?:\.\d+)?))?\s*:\s*(.+?)(?:\s*:=\s*(.+?))?\s*;$/i);
                if (!declarationMatch)
                {
                    continue;
                }
                const [, name, atAddressRaw, stTypeRaw, initializerRaw] = declarationMatch;

                const variableEntry = this.parseVariable(line, currentSection);
                
                this.variableMap.set(name, variableEntry!);

            }

            // si currentSection es OTHER se asume que es la logica del programa y se convierte su funcionamiento a js


        }
    }

    private parseVariable(line: string, section: VarSection): VariableEntry | null
    {
        const declarationMatch = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(?:AT\s+(%[IQM][XWD]?\d+(?:\.\d+)?))?\s*:\s*(.+?)(?:\s*:=\s*(.+?))?\s*;$/i);
        if (!declarationMatch)
        {
            return null;
        }

        const [, name, atAddressRaw] = declarationMatch;
        const { memoryArea, address } = this.parseMemoryAndAddress(atAddressRaw);

        return {
            name: name,
            address: address,
            memoryArea: memoryArea,
            varSection: section,
            bufferAction: () => null
        };
    }

    private parseMemoryAndAddress(atAddressRaw?: string): { memoryArea: MemoryArea; address: number }
    {
        if (!atAddressRaw)
        {
            return { memoryArea: MemoryArea.M, address: 0 };
        }
        const clean = atAddressRaw.trim().toUpperCase();
        const match = clean.match(/^%([IQM])([XWD]?)(\d+)(?:\.(\d+))?$/);
        if (!match)
        {
            return { memoryArea: MemoryArea.M, address: 0 };
        }
        const [, areaToken, , numericToken] = match;
        const memoryArea = areaToken === "I" ? MemoryArea.I : areaToken === "Q" ? MemoryArea.Q : MemoryArea.M;
        const address = Number.parseInt(numericToken, 10);
        return { memoryArea, address };
    }

    private checkCurrentSection(line: string): VarSection
    {
        if (/^VAR_INPUT\b/i.test(line)) { return VarSection.VAR_INPUT; }
        if (/^VAR_OUTPUT\b/i.test(line)) { return VarSection.VAR_OUTPUT; }
        if (/^VAR_IN_OUT\b/i.test(line)) { return VarSection.VAR_IN_OUT; }
        if (/^VAR_GLOBAL\b/i.test(line)) { return VarSection.VAR_GLOBAL; }
        if (/^VAR_TEMP\b/i.test(line)) { return VarSection.VAR_TEMP; }
        if (/^VAR_STAT\b/i.test(line)) { return VarSection.VAR_STAT; }
        if (/^VAR_EXTERNAL\b/i.test(line)) { return VarSection.VAR_EXTERNAL; }
        if (/^VAR\b/i.test(line)) { return VarSection.VAR; }
        if (/^END_VAR\b/i.test(line)) { return VarSection.OTHER; }
        return VarSection.OTHER;
    }
}

export const scriptManager = new ScriptManager();