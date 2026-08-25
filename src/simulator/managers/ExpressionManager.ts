import { addressData, AddressRegister, RegisterTypes } from "../../data/AddressData";
import { bufferManager } from "./BufferManager";

type MathFunction = (...args: number[]) => number;
/** Tolerancia para comparar números de punto flotante. */
const EPSILON = 1e-9;

/** Convierte una condición booleana a formato numérico (1 o 0). */
const toBoolNumber = (condition: boolean): number => condition ? 1 : 0;

/** Vincula un registro destino con su expresión calculada en cada ciclo. */
interface ExpressionBinding
{
    registerName: string;
    registerType: RegisterTypes;
    registerAddress: number;
    /** Índice de bit (0-15), presente solo cuando registerType es HOLDING_REGISTER_BIT. */
    registerBit?: number;
    expression: string;
}

type TokenType = "number" | "reference" | "identifier" | "operator" | "paren" | "comma";

/** Token léxico utilizado durante el parseo de la expresión. */
interface Token
{
    type: TokenType;
    value: string;
}

/**
 * Catálogo de funciones disponibles para expresiones.
 *
 * Todas las funciones devuelven número. En comparadores:
 * - 1 representa true
 * - 0 representa false
 */
const functionsCatalog: Record<string, MathFunction> = {
    //add: (...args: number[]) => args.reduce((acc, value) => acc + value, 0),
    //subtract: (left: number, right: number) => left - right,
    //multiply: (left: number, right: number) => left * right,
    //divide: (left: number, right: number) => left / right,

    //equal: (left: number, right: number) => toBoolNumber(Math.abs(left - right) <= EPSILON),
    //notEqual: (left: number, right: number) => toBoolNumber(Math.abs(left - right) > EPSILON),
    //greater: (left: number, right: number) => toBoolNumber(left > right),
    //greaterOrEqual: (left: number, right: number) => toBoolNumber(left >= right),
    //less: (left: number, right: number) => toBoolNumber(left < right),
    //lessOrEqual: (left: number, right: number) => toBoolNumber(left <= right),

    min: (...args: number[]) => Math.min(...args),
    max: (...args: number[]) => Math.max(...args),
    abs: (value: number) => Math.abs(value),
    round: (value: number) => Math.round(value),
    floor: (value: number) => Math.floor(value),
    ceil: (value: number) => Math.ceil(value),
    clamp: (value: number, min: number, max: number) => Math.min(Math.max(value, min), max),
    scale: (value: number, inMin: number, inMax: number, outMin: number, outMax: number) =>
    {
        if (inMax === inMin)
        {
            return outMin;
        }

        return outMin + ((value - inMin) * (outMax - outMin)) / (inMax - inMin);
    }
};

class ExpressionManager
{
    private bindings: ExpressionBinding[] = [];

    /**
     * Recorre todos los registros y guarda aquellos que tengan
     * la propiedad `expression` para evaluarlos en cada ciclo.
     */
    public configure(): void
    {
        this.bindings = [];

        for (const register of addressData.getAll())
        {
            if (!register.expression || typeof register.expression !== "string")
            {
                continue;
            }

            this.bindings.push({
                registerName: register.name,
                registerType: register.type,
                registerAddress: register.address,
                registerBit: register.bit,
                expression: register.expression
            });
        }

        console.log(`[Expression] Expresiones activas: ${this.bindings.length}`);
    }

    /**
     * Ejecuta todas las expresiones activas y escribe el resultado
     * en el buffer correspondiente según el tipo de registro.
     */
    public execute(): void
    {
        if (this.bindings.length === 0)
        {
            return;
        }

        for (const binding of this.bindings)
        {
            try
            {
                const rawValue = this.evaluate(binding.expression);

                switch (binding.registerType)
                {
                    case RegisterTypes.COIL:
                        bufferManager.setCoil(binding.registerAddress, rawValue >= 0.5);
                        break;

                    case RegisterTypes.HOLDING_REGISTER:
                        bufferManager.setInt16(binding.registerAddress, Math.round(rawValue));
                        break;

                    case RegisterTypes.HOLDING_REGISTER_FLOAT:
                        bufferManager.setFloat32(binding.registerAddress, rawValue);
                        break;

                    case RegisterTypes.HOLDING_REGISTER_BIT:
                        bufferManager.setBit(binding.registerAddress, binding.registerBit ?? 0, rawValue >= 0.5);
                        break;

                    default:
                        break;
                }
            }
            catch (error)
            {
                const message = error instanceof Error ? error.message : String(error);
                console.warn(`[Expression][WARN] Error en ${binding.registerName}: ${message}`);
            }
        }
    }

    /**
     * Evalúa una expresión matemática/comparativa en formato string.
     *
     * Soporta:
     * - referencias por nombre: `#NOMBRE_REGISTRO`
     * - operadores aritméticos: +, -, *, /
     * - comparadores: >, <, >=, <=, ==, !=
     * - funciones declaradas en `functionsCatalog`
     */
    private evaluate(expression: string): number
    {
        const tokens = this.tokenize(expression);
        let index = 0;

        /** Punto de entrada del parser (precedencia más baja). */
        const parseExpression = (): number =>
        {
            return parseComparison();
        };

        /** Parsea comparadores entre dos expresiones aritméticas. */
        const parseComparison = (): number =>
        {
            let value = parseAddSub();

            while (matchOperator(">=") || matchOperator("<=") || matchOperator("==") || matchOperator("!=") || matchOperator(">") || matchOperator("<"))
            {
                const operator = tokens[index - 1].value;
                const right = parseAddSub();

                switch (operator)
                {
                    case ">":
                        value = toBoolNumber(value > right);
                        break;
                    case "<":
                        value = toBoolNumber(value < right);
                        break;
                    case ">=":
                        value = toBoolNumber(value >= right);
                        break;
                    case "<=":
                        value = toBoolNumber(value <= right);
                        break;
                    case "==":
                        value = toBoolNumber(Math.abs(value - right) <= EPSILON);
                        break;
                    case "!=":
                        value = toBoolNumber(Math.abs(value - right) > EPSILON);
                        break;
                    default:
                        break;
                }
            }

            return value;
        };

        /** Parsea suma y resta respetando precedencia. */
        const parseAddSub = (): number =>
        {
            let value = parseTerm();

            while (matchOperator("+") || matchOperator("-"))
            {
                const operator = tokens[index - 1].value;
                const right = parseTerm();
                value = operator === "+" ? value + right : value - right;
            }

            return value;
        };

        /** Parsea multiplicación y división. */
        const parseTerm = (): number =>
        {
            let value = parseFactor();

            while (matchOperator("*") || matchOperator("/"))
            {
                const operator = tokens[index - 1].value;
                const right = parseFactor();
                value = operator === "*" ? value * right : value / right;
            }

            return value;
        };

        /**
         * Parsea unidades básicas:
         * - número
         * - referencia
         * - llamada a función
         * - subexpresión entre paréntesis
         * - signos unarios
         */
        const parseFactor = (): number =>
        {
            const token = tokens[index];

            if (!token)
            {
                throw new Error(`Expresión incompleta: ${expression}`);
            }

            if (matchOperator("+"))
            {
                return parseFactor();
            }

            if (matchOperator("-"))
            {
                return -parseFactor();
            }

            if (matchParen("("))
            {
                const value = parseExpression();
                expectParen(")");
                return value;
            }

            if (token.type === "number")
            {
                index++;
                return Number(token.value);
            }

            if (token.type === "reference")
            {
                index++;
                return this.resolveReference(token.value);
            }

            if (token.type === "identifier")
            {
                index++;
                const functionName = token.value;
                expectParen("(");
                const args: number[] = [];

                if (!matchParen(")"))
                {
                    do
                    {
                        args.push(parseExpression());
                    }
                    while (matchComma());

                    expectParen(")");
                }

                const fn = functionsCatalog[functionName];

                if (!fn)
                {
                    throw new Error(`Función no soportada: ${functionName}`);
                }

                return fn(...args);
            }

            throw new Error(`Token inesperado: ${token.value}`);
        };

        /** Consume un operador si coincide con el valor esperado. */
        const matchOperator = (value: string): boolean =>
        {
            const token = tokens[index];

            if (token?.type === "operator" && token.value === value)
            {
                index++;
                return true;
            }

            return false;
        };

        /** Consume un paréntesis si coincide con el valor esperado. */
        const matchParen = (value: string): boolean =>
        {
            const token = tokens[index];

            if (token?.type === "paren" && token.value === value)
            {
                index++;
                return true;
            }

            return false;
        };

        /** Consume una coma (usada en argumentos de función). */
        const matchComma = (): boolean =>
        {
            const token = tokens[index];

            if (token?.type === "comma")
            {
                index++;
                return true;
            }

            return false;
        };

        /** Valida la presencia obligatoria de un paréntesis. */
        const expectParen = (value: string): void =>
        {
            if (!matchParen(value))
            {
                throw new Error(`Se esperaba '${value}' en: ${expression}`);
            }
        };

        const result = parseExpression();

        if (index < tokens.length)
        {
            throw new Error(`Expresión inválida cerca de: ${tokens[index].value}`);
        }

        return result;
    }

    /**
     * Convierte la cadena de entrada en tokens (análisis léxico).
     */
    private tokenize(expression: string): Token[]
    {
        const tokens: Token[] = [];
        let cursor = 0;

        while (cursor < expression.length)
        {
            const char = expression[cursor];

            if (/\s/.test(char))
            {
                cursor++;
                continue;
            }

            if (/[><=!]/.test(char))
            {
                const nextChar = expression[cursor + 1];
                const composed = `${char}${nextChar ?? ""}`;

                if (composed === ">=" || composed === "<=" || composed === "==" || composed === "!=")
                {
                    tokens.push({ type: "operator", value: composed });
                    cursor += 2;
                    continue;
                }

                if (char === ">" || char === "<")
                {
                    tokens.push({ type: "operator", value: char });
                    cursor++;
                    continue;
                }

                throw new Error(`Operador no soportado en expresión: ${char}`);
            }

            if (/[()+\-*/]/.test(char))
            {
                tokens.push({
                    type: char === "(" || char === ")" ? "paren" : "operator",
                    value: char
                });
                cursor++;
                continue;
            }

            if (char === ",")
            {
                tokens.push({ type: "comma", value: char });
                cursor++;
                continue;
            }

            if (char === "#")
            {
                let end = cursor + 1;

                while (end < expression.length && /[A-Za-z0-9_]/.test(expression[end]))
                {
                    end++;
                }

                tokens.push({ type: "reference", value: expression.slice(cursor + 1, end) });
                cursor = end;
                continue;
            }

            if (/[0-9.]/.test(char))
            {
                let end = cursor + 1;

                while (end < expression.length && /[0-9.]/.test(expression[end]))
                {
                    end++;
                }

                tokens.push({ type: "number", value: expression.slice(cursor, end) });
                cursor = end;
                continue;
            }

            if (/[A-Za-z_]/.test(char))
            {
                let end = cursor + 1;

                while (end < expression.length && /[A-Za-z0-9_]/.test(expression[end]))
                {
                    end++;
                }

                tokens.push({ type: "identifier", value: expression.slice(cursor, end) });
                cursor = end;
                continue;
            }

            throw new Error(`Carácter no soportado en expresión: ${char}`);
        }

        return tokens;
    }

    /**
     * Resuelve una referencia `#REGISTRO` leyendo su valor actual.
     */
    private resolveReference(registerName: string): number
    {
        const register = addressData.getByName(registerName);

        if (!register)
        {
            throw new Error(`Registro no encontrado: ${registerName}`);
        }

        return this.readRegisterValue(register);
    }

    /**
     * Lee el valor actual del registro desde el buffer según su tipo.
     */
    private readRegisterValue(register: AddressRegister): number
    {
        switch (register.type)
        {
            case RegisterTypes.COIL:
                return bufferManager.getCoil(register.address) ? 1 : 0;

            case RegisterTypes.HOLDING_REGISTER:
                return bufferManager.getInt16(register.address);

            case RegisterTypes.HOLDING_REGISTER_FLOAT:
                return bufferManager.getFloat32(register.address);

            case RegisterTypes.HOLDING_REGISTER_BIT:
                return bufferManager.getBit(register.address, register.bit ?? 0) ? 1 : 0;

            default:
                return Number(register.value);
        }
    }
}

export const expressionManager = new ExpressionManager();