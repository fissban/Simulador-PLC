import fs from "node:fs";
import path from "node:path";
import { bufferManager } from "./BufferManager";
import { StVariableAddressEntry, stVariableAddressManager } from "./StVariableAddressManager";

export interface StTranslationResult
{
    sourcePath: string;
    jsSource: string;
    statementCount: number;
}

type CompiledProgram = (context: Record<string, unknown>) => Record<string, unknown>;

type RuntimeHelpers = {
    SIN: (value: number) => number;
    ABS: (value: number) => number;
    SQRT: (value: number) => number;
    INT_TO_REAL: (value: unknown) => number;
    REAL_TO_INT: (value: unknown) => number;
    BOOL_TO_INT: (value: unknown) => number;
    INT_TO_BOOL: (value: unknown) => boolean;
    MIN: (left: number, right: number) => number;
    MAX: (left: number, right: number) => number;
    LIMIT: (minValue: number, value: number, maxValue: number) => number;
    SimSine: (fMin: number, fMax: number, fPeriodS: number, fTimeS: number, fPhaseS: number) => number;
};

type ArrayContainer = Record<number, unknown>;

function stripLineComment(line: string): string
{
    const index = line.indexOf("//");
    return index === -1 ? line : line.slice(0, index);
}

class StToJavaScriptManager
{
    private readonly defaultStProgramPath = path.resolve(__dirname, "../../../config/st-program.st");

    private compiledProgram: CompiledProgram | null = null;
    private lastTranslation: StTranslationResult | null = null;
    private baseContext: Record<string, unknown> = {};
    private runtimeContext: Record<string, unknown> = {};

    public configure(): void
    {
        this.loadFromFile(this.defaultStProgramPath);
    }

    public loadFromFile(filePath: string): void
    {
        const stSource = fs.readFileSync(filePath, "utf8");

        stVariableAddressManager.loadFromSource(stSource);
        const translation = this.translate(stSource, filePath);
        this.lastTranslation = translation;

        this.baseContext = this.createBaseContext();
        this.runtimeContext = this.cloneBaseContext();
        this.compiledProgram = new Function(
            "context",
            `
const __ctx = context || {};
with (__ctx) {
${translation.jsSource}
}
return __ctx;
`
        ) as CompiledProgram;

        console.log(`[ST JS] Traducción OK (${translation.statementCount} líneas de lógica).`);
    }

    public execute(context: Record<string, unknown> = {}): Record<string, unknown>
    {
        if (!this.compiledProgram)
        {
            return context;
        }

        this.loadContextFromBuffer(this.runtimeContext);

        Object.assign(this.runtimeContext, context);

        const resultContext = this.compiledProgram(this.runtimeContext);
        this.runtimeContext = resultContext;

        this.writeContextToBuffer(this.runtimeContext);

        return this.runtimeContext;
    }

    public getLastTranslation(): StTranslationResult | null
    {
        return this.lastTranslation;
    }

    public getRuntimeContextSnapshot(): Record<string, unknown>
    {
        const snapshot: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(this.runtimeContext))
        {
            if (Array.isArray(value))
            {
                snapshot[key] = [...value];
                continue;
            }

            if (value && typeof value === "object")
            {
                snapshot[key] = { ...(value as Record<string, unknown>) };
                continue;
            }

            snapshot[key] = value;
        }

        return snapshot;
    }

    private translate(stSource: string, sourcePath: string): StTranslationResult
    {
        const lines = stSource.replace(/\r\n?/g, "\n").split("\n");

        const jsLines: string[] = [];
        const statementStack: string[] = [];
        let inProgram = false;
        let inVarSection = false;
        let inBlockComment = false;

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

            const noComment = stripLineComment(trimmed).trim();
            if (!noComment)
            {
                continue;
            }

            if (!inProgram)
            {
                if (/^PROGRAM\b/i.test(noComment))
                {
                    inProgram = true;
                }
                continue;
            }

            if (/^END_PROGRAM\b/i.test(noComment))
            {
                break;
            }

            if (/^VAR(_INPUT|_OUTPUT|_IN_OUT)?\b/i.test(noComment))
            {
                inVarSection = true;
                continue;
            }

            if (/^END_VAR\b/i.test(noComment))
            {
                inVarSection = false;
                continue;
            }

            if (inVarSection)
            {
                continue;
            }

            const jsLine = this.translateLogicLine(noComment, statementStack);
            if (jsLine)
            {
                jsLines.push(jsLine);
            }
        }

        while (statementStack.length > 0)
        {
            statementStack.pop();
            jsLines.push("}");
        }

        return {
            sourcePath,
            jsSource: jsLines.join("\n"),
            statementCount: jsLines.length
        };
    }

    private translateLogicLine(stLine: string, statementStack: string[]): string | null
    {
        const oneLineIfMatch = stLine.match(/^IF\s+(.+?)\s+THEN\s+(.+?)\s+END_IF\s*;?$/i);
        if (oneLineIfMatch)
        {
            const [, condition, body] = oneLineIfMatch;
            return `if (${this.translateExpression(condition)}) { ${this.translateInlineStatements(body)} }`;
        }

        const ifMatch = stLine.match(/^IF\s+(.+)\s+THEN\s*$/i);
        if (ifMatch)
        {
            statementStack.push("IF");
            return `if (${this.translateExpression(ifMatch[1])}) {`;
        }

        const elsifMatch = stLine.match(/^ELSIF\s+(.+)\s+THEN\s*$/i);
        if (elsifMatch)
        {
            return `} else if (${this.translateExpression(elsifMatch[1])}) {`;
        }

        if (/^ELSE\s*$/i.test(stLine))
        {
            return "} else {";
        }

        if (/^END_IF\s*;?$/i.test(stLine))
        {
            if (statementStack.at(-1) === "IF")
            {
                statementStack.pop();
            }
            return "}";
        }

        const forMatch = stLine.match(/^FOR\s+([A-Za-z_][A-Za-z0-9_]*)\s*:=\s*(.+?)\s+TO\s+(.+?)(?:\s+BY\s+(.+?))?\s+DO\s*$/i);
        if (forMatch)
        {
            const [, iterator, fromExpr, toExpr, byExpr] = forMatch;
            const stepExpr = byExpr ? this.translateExpression(byExpr) : "1";
            statementStack.push("FOR");
            return `for (${iterator} = ${this.translateExpression(fromExpr)}; ${iterator} <= ${this.translateExpression(toExpr)}; ${iterator} += ${stepExpr}) {`;
        }

        if (/^END_FOR\s*;?$/i.test(stLine))
        {
            if (statementStack.at(-1) === "FOR")
            {
                statementStack.pop();
            }
            return "}";
        }

        if (/^RETURN\s*;?$/i.test(stLine))
        {
            return "return __ctx;";
        }

        if (/^END_FUNCTION\s*;?$/i.test(stLine))
        {
            return null;
        }

        const assignment = stLine.match(/^([A-Za-z_][A-Za-z0-9_]*(?:\[[^\]]+\])?)\s*:=\s*(.+?)\s*;?$/);
        if (assignment)
        {
            const [, left, right] = assignment;
            return `${left} = ${this.translateExpression(right)};`;
        }

        return `${this.translateExpression(stLine.replace(/;$/, ""))};`;
    }

    private translateInlineStatements(stBody: string): string
    {
        const statements = stBody
            .split(";")
            .map((segment) => segment.trim())
            .filter((segment) => segment.length > 0);

        const translated = statements.map((statement) => {
            const assignment = statement.match(/^([A-Za-z_][A-Za-z0-9_]*(?:\[[^\]]+\])?)\s*:=\s*(.+)$/);
            if (assignment)
            {
                const [, left, right] = assignment;
                return `${left} = ${this.translateExpression(right)};`;
            }

            return `${this.translateExpression(statement)};`;
        });

        return translated.join(" ");
    }

    private translateExpression(expression: string): string
    {
        return expression
            .replace(/\bTRUE\b/gi, "true")
            .replace(/\bFALSE\b/gi, "false")
            .replace(/\bAND\b/gi, "&")
            .replace(/\bOR\b/gi, "|")
            .replace(/\bXOR\b/gi, "^")
            .replace(/\bNOT\b/gi, "!")
            .replace(/<>/g, "!==")
            .replace(/(?<![:<>!=])=(?!=)/g, "===");
    }

    private createBaseContext(): Record<string, unknown>
    {
        const context: Record<string, unknown> = {
            ...this.createRuntimeHelpers()
        };

        for (const variable of stVariableAddressManager.getAll())
        {
            if (variable.isArray)
            {
                const start = variable.arrayStartIndex ?? 0;
                const end = variable.arrayEndIndex ?? ((variable.arrayLength ?? 1) - 1 + start);
                const arrayValues: ArrayContainer = {};
                for (let stIndex = start; stIndex <= end; stIndex += 1)
                {
                    arrayValues[stIndex] = this.getInitialOrDefaultValue(variable);
                }
                context[variable.name] = arrayValues;
                continue;
            }

            context[variable.name] = this.getInitialOrDefaultValue(variable);
        }

        return context;
    }

    private cloneBaseContext(): Record<string, unknown>
    {
        const clone: Record<string, unknown> = {};

        for (const [key, value] of Object.entries(this.baseContext))
        {
            if (Array.isArray(value))
            {
                clone[key] = [...value];
                continue;
            }

            if (value && typeof value === "object")
            {
                clone[key] = { ...(value as Record<string, unknown>) };
                continue;
            }

            clone[key] = value;
        }

        return clone;
    }

    private createRuntimeHelpers(): RuntimeHelpers
    {
        return {
            SIN: (value: number): number => Math.sin(this.toNumber(value)),
            ABS: (value: number): number => Math.abs(this.toNumber(value)),
            SQRT: (value: number): number => Math.sqrt(this.toNumber(value)),
            INT_TO_REAL: (value: unknown): number => this.toNumber(value),
            REAL_TO_INT: (value: unknown): number => Math.trunc(this.toNumber(value)),
            BOOL_TO_INT: (value: unknown): number => this.toBoolean(value) ? 1 : 0,
            INT_TO_BOOL: (value: unknown): boolean => this.toNumber(value) !== 0,
            MIN: (left: number, right: number): number => Math.min(this.toNumber(left), this.toNumber(right)),
            MAX: (left: number, right: number): number => Math.max(this.toNumber(left), this.toNumber(right)),
            LIMIT: (minValue: number, value: number, maxValue: number): number =>
            {
                const normalizedMin = this.toNumber(minValue);
                const normalizedValue = this.toNumber(value);
                const normalizedMax = this.toNumber(maxValue);
                return Math.min(Math.max(normalizedValue, normalizedMin), normalizedMax);
            },
            SimSine: (fMin: number, fMax: number, fPeriodS: number, fTimeS: number, fPhaseS: number): number =>
            {
                const period = this.toNumber(fPeriodS);
                if (period <= 0)
                {
                    return this.toNumber(fMin);
                }

                const phaseArg = 2 * Math.PI * ((this.toNumber(fTimeS) + this.toNumber(fPhaseS)) / period);
                const phase = 0.5 + 0.5 * Math.sin(phaseArg);
                return this.toNumber(fMin) + (this.toNumber(fMax) - this.toNumber(fMin)) * phase;
            }
        };
    }

    private loadContextFromBuffer(targetContext: Record<string, unknown>): void
    {
        for (const variable of stVariableAddressManager.getAll())
        {
            if (typeof variable.numericAddress !== "number")
            {
                continue;
            }

            if (variable.isArray)
            {
                const start = variable.arrayStartIndex ?? 0;
                const end = variable.arrayEndIndex ?? ((variable.arrayLength ?? 1) - 1 + start);
                const arrayContext = this.ensureArrayContainer(targetContext, variable.name, start, end, variable.stType);

                for (let stIndex = start; stIndex <= end; stIndex += 1)
                {
                    const offset = stIndex - start;
                    arrayContext[stIndex] = this.readScalarFromBuffer(variable, offset);
                }
                continue;
            }

            targetContext[variable.name] = this.readScalarFromBuffer(variable, 0);
        }
    }

    private writeContextToBuffer(sourceContext: Record<string, unknown>): void
    {
        for (const variable of stVariableAddressManager.getAll())
        {
            if (typeof variable.numericAddress !== "number")
            {
                continue;
            }

            if (variable.isArray)
            {
                const start = variable.arrayStartIndex ?? 0;
                const end = variable.arrayEndIndex ?? ((variable.arrayLength ?? 1) - 1 + start);
                const arrayValue = sourceContext[variable.name] as ArrayContainer | undefined;

                for (let stIndex = start; stIndex <= end; stIndex += 1)
                {
                    const offset = stIndex - start;
                    const value = arrayValue ? arrayValue[stIndex] : undefined;
                    this.writeScalarToBuffer(variable, offset, value);
                }
                continue;
            }

            this.writeScalarToBuffer(variable, 0, sourceContext[variable.name]);
        }
    }

    private ensureArrayContainer(
        context: Record<string, unknown>,
        variableName: string,
        start: number,
        end: number,
        stType: string
    ): ArrayContainer
    {
        const existing = context[variableName];
        if (existing && typeof existing === "object")
        {
            return existing as ArrayContainer;
        }

        const created: ArrayContainer = {};
        for (let stIndex = start; stIndex <= end; stIndex += 1)
        {
            created[stIndex] = this.getDefaultValueForType(stType);
        }
        context[variableName] = created;
        return created;
    }

    private readScalarFromBuffer(variable: { stType: string; addressKind?: string; memoryArea?: string; numericAddress?: number; bitIndex?: number }, offset: number): unknown
    {
        if (typeof variable.numericAddress !== "number")
        {
            return this.getDefaultValueForType(variable.stType);
        }

        const address = variable.numericAddress + offset;
        const upperType = variable.stType.toUpperCase();

        if (upperType.includes("BOOL"))
        {
            if (typeof variable.bitIndex === "number")
            {
                return bufferManager.getBit(address, variable.bitIndex);
            }

            if (variable.memoryArea === "I" || variable.memoryArea === "Q")
            {
                return bufferManager.getCoil(address);
            }

            return bufferManager.getInt16(address) !== 0;
        }

        if (upperType.includes("REAL") || variable.addressKind === "DWORD")
        {
            // `numericAddress` in ST for %MD is the MD index; convert to HR index (MD * 2)
            const hrAddress = address * 2;
            return bufferManager.getFloat32(hrAddress);
        }

        if (upperType.includes("UINT") || upperType.includes("WORD"))
        {
            return bufferManager.getUInt16(address);
        }

        return bufferManager.getInt16(address);
    }

    private writeScalarToBuffer(variable: { stType: string; addressKind?: string; memoryArea?: string; numericAddress?: number; bitIndex?: number }, offset: number, value: unknown): void
    {
        if (typeof variable.numericAddress !== "number")
        {
            return;
        }

        const address = variable.numericAddress + offset;
        const upperType = variable.stType.toUpperCase();

        if (upperType.includes("BOOL"))
        {
            const boolValue = this.toBoolean(value);

            if (typeof variable.bitIndex === "number")
            {
                bufferManager.setBit(address, variable.bitIndex, boolValue);
                return;
            }

            if (variable.memoryArea === "I" || variable.memoryArea === "Q")
            {
                bufferManager.setCoil(address, boolValue);
                return;
            }

            bufferManager.setInt16(address, boolValue ? 1 : 0);
            return;
        }

        if (upperType.includes("REAL") || variable.addressKind === "DWORD")
        {
            // `numericAddress` in ST for %MD is the MD index; convert to HR index (MD * 2)
            const hrAddress = address * 2;
            bufferManager.setFloat32(hrAddress, this.toNumber(value));
            return;
        }

        if (upperType.includes("UINT") || upperType.includes("WORD"))
        {
            bufferManager.setUInt16(address, this.toUInt16(value));
            return;
        }

        bufferManager.setInt16(address, this.toInt16(value));
    }

    private getDefaultValueForType(stType: string): unknown
    {
        const upperType = stType.toUpperCase();
        if (upperType.includes("BOOL"))
        {
            return false;
        }

        return 0;
    }

    private getInitialOrDefaultValue(variable: StVariableAddressEntry): unknown
    {
        if (typeof variable.initializerValue !== "undefined")
        {
            if (typeof variable.initializerValue === "boolean")
            {
                return variable.initializerValue;
            }

            const upperType = variable.stType.toUpperCase();
            if (upperType.includes("BOOL"))
            {
                return variable.initializerValue !== 0;
            }

            return variable.initializerValue;
        }

        return this.getDefaultValueForType(variable.stType);
    }

    private toNumber(value: unknown): number
    {
        const numeric = typeof value === "number" ? value : Number(value ?? 0);
        if (!Number.isFinite(numeric))
        {
            return 0;
        }

        return numeric;
    }

    private toBoolean(value: unknown): boolean
    {
        if (typeof value === "boolean")
        {
            return value;
        }

        if (typeof value === "string")
        {
            const normalized = value.trim().toLowerCase();
            if (normalized === "true")
            {
                return true;
            }
            if (normalized === "false")
            {
                return false;
            }
        }

        return this.toNumber(value) !== 0;
    }

    private toInt16(value: unknown): number
    {
        const normalized = Math.trunc(this.toNumber(value));
        return Math.max(-32768, Math.min(32767, normalized));
    }

    private toUInt16(value: unknown): number
    {
        const normalized = Math.trunc(this.toNumber(value));
        return Math.max(0, Math.min(65535, normalized));
    }
}

export const stToJavaScriptManager = new StToJavaScriptManager();
