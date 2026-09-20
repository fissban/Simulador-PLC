import fs from "node:fs";
import path from "node:path";

export type StMemoryArea = "I" | "Q" | "M";
export type StAddressKind = "BIT" | "WORD" | "DWORD" | "UNKNOWN";
export type StVarSection = "VAR" | "VAR_INPUT" | "VAR_OUTPUT" | "VAR_IN_OUT" | "OTHER";

export interface StVariableAddressEntry
{
    name: string;
    section: StVarSection;
    stType: string;
    initializerRaw?: string;
    initializerValue?: number | boolean;
    isArray: boolean;
    arrayLength?: number;
    arrayStartIndex?: number;
    arrayEndIndex?: number;
    atAddressRaw?: string;
    memoryArea?: StMemoryArea;
    addressKind?: StAddressKind;
    numericAddress?: number;
    bitIndex?: number;
}

function parseInitializerValue(initializerRaw?: string): number | boolean | undefined
{
    if (!initializerRaw)
    {
        return undefined;
    }

    const normalized = initializerRaw.trim();
    if (!normalized)
    {
        return undefined;
    }

    if (/^TRUE$/i.test(normalized))
    {
        return true;
    }

    if (/^FALSE$/i.test(normalized))
    {
        return false;
    }

    const asNumber = Number(normalized);
    if (Number.isFinite(asNumber))
    {
        return asNumber;
    }

    return undefined;
}

function stripInlineComment(line: string): string
{
    const commentIndex = line.indexOf("//");
    if (commentIndex === -1)
    {
        return line;
    }

    return line.slice(0, commentIndex);
}

function parseArrayLength(stType: string): number | undefined
{
    const match = stType.match(/ARRAY\s*\[\s*(-?\d+)\s*\.\.\s*(-?\d+)\s*\]\s*OF\s+.+/i);
    if (!match)
    {
        return undefined;
    }

    const start = Number.parseInt(match[1], 10);
    const end = Number.parseInt(match[2], 10);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start)
    {
        return undefined;
    }

    return end - start + 1;
}

function parseArrayBounds(stType: string): { start: number; end: number } | undefined
{
    const match = stType.match(/ARRAY\s*\[\s*(-?\d+)\s*\.\.\s*(-?\d+)\s*\]\s*OF\s+.+/i);
    if (!match)
    {
        return undefined;
    }

    const start = Number.parseInt(match[1], 10);
    const end = Number.parseInt(match[2], 10);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start)
    {
        return undefined;
    }

    return { start, end };
}

function parseAtAddress(atAddressRaw: string): Partial<StVariableAddressEntry>
{
    const clean = atAddressRaw.trim().toUpperCase();
    const match = clean.match(/^%([IQM])([XWD]?)(\d+)(?:\.(\d+))?$/);
    if (!match)
    {
        return {
            atAddressRaw,
            addressKind: "UNKNOWN"
        };
    }

    const [, areaToken, widthToken, numericToken, bitToken] = match;

    const addressKind: StAddressKind = bitToken
        ? "BIT"
        : widthToken === "X"
        ? "BIT"
        : widthToken === "D"
            ? "DWORD"
            : widthToken === "W" || widthToken === ""
                ? "WORD"
                : "UNKNOWN";

    return {
        atAddressRaw,
        memoryArea: areaToken as StMemoryArea,
        addressKind,
        numericAddress: Number.parseInt(numericToken, 10),
        bitIndex: bitToken ? Number.parseInt(bitToken, 10) : undefined
    };
}

class StVariableAddressManager
{
    private readonly variableList: StVariableAddressEntry[] = [];
    private readonly variableMap = new Map<string, StVariableAddressEntry>();

    private readonly defaultStProgramPath = path.resolve(__dirname, "../../../config/st-program.st");

    public load(): void
    {
        this.loadFromFile(this.defaultStProgramPath);
    }

    public loadFromFile(filePath: string): void
    {
        const source = fs.readFileSync(filePath, "utf8");
        this.loadFromSource(source);
    }

    public loadFromSource(source: string): void
    {
        this.variableList.length = 0;
        this.variableMap.clear();

        const lines = source.replace(/\r\n?/g, "\n").split("\n");
        let inBlockComment = false;
        let currentSection: StVarSection = "OTHER";

        for (const rawLine of lines)
        {
            const trimmed = rawLine.trim();
            if (!trimmed)
            {
                continue;
            }

            if (inBlockComment)
            {
                if (trimmed.includes("*)"))
                {
                    inBlockComment = false;
                }
                continue;
            }

            if (trimmed.startsWith("(*"))
            {
                if (!trimmed.includes("*)"))
                {
                    inBlockComment = true;
                }
                continue;
            }

            const lineWithoutInlineComment = stripInlineComment(trimmed).trim();
            if (!lineWithoutInlineComment)
            {
                continue;
            }

            if (/^VAR_INPUT\b/i.test(lineWithoutInlineComment))
            {
                currentSection = "VAR_INPUT";
                continue;
            }

            if (/^VAR_OUTPUT\b/i.test(lineWithoutInlineComment))
            {
                currentSection = "VAR_OUTPUT";
                continue;
            }

            if (/^VAR_IN_OUT\b/i.test(lineWithoutInlineComment))
            {
                currentSection = "VAR_IN_OUT";
                continue;
            }

            if (/^VAR\b/i.test(lineWithoutInlineComment))
            {
                currentSection = "VAR";
                continue;
            }

            if (/^END_VAR\b/i.test(lineWithoutInlineComment))
            {
                currentSection = "OTHER";
                continue;
            }

            if (currentSection === "OTHER")
            {
                continue;
            }

            const declarationMatch = lineWithoutInlineComment.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(?:AT\s+(%[IQM][XWD]?\d+(?:\.\d+)?))?\s*:\s*(.+?)(?:\s*:=\s*(.+?))?\s*;$/i);
            if (!declarationMatch)
            {
                continue;
            }

            const [, name, atAddressRaw, stTypeRaw, initializerRaw] = declarationMatch;
            const stType = stTypeRaw.trim();
            const isArray = /^ARRAY\s*\[/i.test(stType);
            const arrayLength = isArray ? parseArrayLength(stType) : undefined;
            const arrayBounds = isArray ? parseArrayBounds(stType) : undefined;
            const addressFields = atAddressRaw ? parseAtAddress(atAddressRaw) : {};
            const parsedInitializerRaw = typeof initializerRaw === "string" ? initializerRaw.trim() : undefined;
            const initializerValue = parseInitializerValue(parsedInitializerRaw);

            const entry: StVariableAddressEntry = {
                name,
                section: currentSection,
                stType,
                initializerRaw: parsedInitializerRaw,
                initializerValue,
                isArray,
                arrayLength,
                arrayStartIndex: arrayBounds?.start,
                arrayEndIndex: arrayBounds?.end,
                ...addressFields
            };

            this.variableList.push(entry);
            this.variableMap.set(name.toUpperCase(), entry);
        }

        console.log(`[ST Variables] Variables parseadas: ${this.variableList.length}`);
    }

    public getAll(): StVariableAddressEntry[]
    {
        return [...this.variableList];
    }

    public getByName(name: string): StVariableAddressEntry | undefined
    {
        return this.variableMap.get(name.toUpperCase());
    }
}

export const stVariableAddressManager = new StVariableAddressManager();
