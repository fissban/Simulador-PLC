export const DEFAULT_ST_CODE = `PROGRAM Main
    VAR_INPUT
        // Entrada analógica 0 (0..4095)
        iTempRaw AT %IW0.0 : INT; 
    END_VAR

    VAR
        // Valor escalado en °C
        fTempActual AT %MD0 : REAL;
        // Consigna en °C
        fSetPoint AT %MD2 : REAL;
    END_VAR

    VAR_OUTPUT
        // Salida digital hacia relé
        bCalentador AT %Q0.0 : BOOL;  
    END_VAR

    // Escalado de 12 bits: 0..4095 -> 0.0..100.0 °C
    fTempActual := (INT_TO_REAL(iTempRaw) * 100.0) / 4095.0;

    // Control por histéresis
    IF fTempActual < (fSetPoint - 2.0) THEN
        bCalentador := TRUE;
    ELSIF fTempActual > (fSetPoint + 2.0) THEN
        bCalentador := FALSE;
    END_IF;`;

const ST_KEYWORDS = [
	"PROGRAM",
	"VAR_INPUT",
	"VAR_OUTPUT",
	"END_PROGRAM",
	"VAR",
	"END_VAR",
	"IF",
	"THEN",
	"ELSE",
	"ELSIF",
	"END_IF",
	"CASE",
	"OF",
	"END_CASE",
	"FOR",
	"TO",
	"BY",
	"DO",
	"END_FOR",
	"WHILE",
	"END_WHILE",
	"REPEAT",
	"UNTIL",
	"END_REPEAT",
	"STRUCT",
	"END_STRUCT",
	"AT",
	"BOOL",
	"INT",
	"REAL",
	"TRUE",
	"FALSE",
];

const ST_KEYWORD_SET = new Set(ST_KEYWORDS);
const ST_DECLARATION_SET = new Set(["PROGRAM", "END_PROGRAM", "VAR", "VAR_INPUT", "VAR_OUTPUT", "END_VAR", "STRUCT", "END_STRUCT"]);
const ST_CONTROL_SET = new Set(["IF", "THEN", "ELSE", "ELSIF", "END_IF", "CASE", "OF", "END_CASE", "FOR", "TO", "BY", "DO", "END_FOR", "WHILE", "END_WHILE", "REPEAT", "UNTIL", "END_REPEAT"]);
const ST_TYPE_SET = new Set(["BOOL", "INT", "REAL"]);
const ST_LITERAL_SET = new Set(["TRUE", "FALSE"]);
const ST_TOKEN_MATCHER = new RegExp(
	`%[IQM][XWDL]?\\d+(?:\\.\\d+)?|\\b(?:${[...ST_KEYWORDS].sort((left, right) => right.length - left.length).join("|")})\\b|\\b[A-Z_][A-Z0-9_]*(?=\\s*\\()|\\b[a-z_][a-zA-Z0-9_]*\\b|:=|<=|>=|<>|[+\\-*/=<>()\\[\\];:,.]|\\b\\d+(?:\\.\\d+)?\\b`,
	"gi",
);

function escapeHtml(value: string): string {
	return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function highlightCodeFragment(code: string): string {
	const tokenMatcher = new RegExp(ST_TOKEN_MATCHER.source, "gi");
	let cursor = 0;
	let highlighted = "";

	for (const match of code.matchAll(tokenMatcher)) {
		const token = match[0] ?? "";
		const index = match.index ?? 0;

		highlighted += escapeHtml(code.slice(cursor, index));

		if (/^%[IQM][XWDL]?\d+(?:\.\d+)?$/i.test(token)) {
			highlighted += `<span class="st-address">${escapeHtml(token)}</span>`;
		} else if (/^(?::=|<=|>=|<>|[+\-*/=<>()\[\];:,.])$/.test(token)) {
			highlighted += `<span class="st-operator">${escapeHtml(token)}</span>`;
		} else if (/^\d+(?:\.\d+)?$/.test(token)) {
			highlighted += `<span class="st-number">${escapeHtml(token)}</span>`;
		} else if (ST_KEYWORD_SET.has(token.toUpperCase())) {
			const upperToken = token.toUpperCase();
			if (ST_DECLARATION_SET.has(upperToken)) {
				highlighted += `<span class="st-keyword-declaration">${escapeHtml(upperToken)}</span>`;
			} else if (ST_CONTROL_SET.has(upperToken)) {
				highlighted += `<span class="st-keyword-control">${escapeHtml(upperToken)}</span>`;
			} else if (ST_TYPE_SET.has(upperToken)) {
				highlighted += `<span class="st-type">${escapeHtml(upperToken)}</span>`;
			} else if (ST_LITERAL_SET.has(upperToken)) {
				highlighted += `<span class="st-literal">${escapeHtml(upperToken)}</span>`;
			} else {
				highlighted += `<span class="st-keyword">${escapeHtml(upperToken)}</span>`;
			}
		} else if (/^[A-Z_][A-Z0-9_]*$/.test(token)) {
			highlighted += `<span class="st-function">${escapeHtml(token)}</span>`;
		} else if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(token)) {
			highlighted += `<span class="st-identifier">${escapeHtml(token)}</span>`;
		} else {
			highlighted += escapeHtml(token);
		}

		cursor = index + token.length;
	}

	highlighted += escapeHtml(code.slice(cursor));
	return highlighted;
}

export function highlightStructuredText(source: string): string {
	const normalized = source.replace(/\r\n?/g, "\n");
	let cursor = 0;
	let highlighted = "";

	while (cursor < normalized.length) {
		if (normalized.startsWith("//", cursor)) {
			const end = normalized.indexOf("\n", cursor);
			const chunk = end === -1 ? normalized.slice(cursor) : normalized.slice(cursor, end);
			highlighted += `<span class="st-comment">${escapeHtml(chunk)}</span>`;
			cursor = end === -1 ? normalized.length : end;
			continue;
		}

		if (normalized.startsWith("(*", cursor)) {
			const end = normalized.indexOf("*)", cursor + 2);
			const blockEnd = end === -1 ? normalized.length : end + 2;
			highlighted += `<span class="st-comment">${escapeHtml(normalized.slice(cursor, blockEnd))}</span>`;
			cursor = blockEnd;
			continue;
		}

		if (normalized[cursor] === "'") {
			let end = cursor + 1;
			while (end < normalized.length) {
				if (normalized[end] === "'" && normalized[end + 1] === "'") {
					end += 2;
					continue;
				}

				if (normalized[end] === "'") {
					end += 1;
					break;
				}

				end += 1;
			}

			highlighted += `<span class="st-string">${escapeHtml(normalized.slice(cursor, end))}</span>`;
			cursor = end;
			continue;
		}

		const nextLineComment = normalized.indexOf("//", cursor);
		const nextBlockComment = normalized.indexOf("(*", cursor);
		const nextString = normalized.indexOf("'", cursor);
		const nextCandidates = [nextLineComment, nextBlockComment, nextString].filter((index) => index !== -1);
		const nextBoundary = nextCandidates.length > 0 ? Math.min(...nextCandidates) : normalized.length;
		const fragment = normalized.slice(cursor, nextBoundary);

		highlighted += highlightCodeFragment(fragment);
		cursor = nextBoundary;
	}

	return highlighted.length > 0 ? highlighted : " ";
}

export type StructuredTextBlockRange = {
	startLine: number;
	endLine: number;
	kind: "IF" | "FOR" | "WHILE" | "CASE" | "REPEAT";
};

const BLOCK_DEFINITIONS: Array<{
	kind: StructuredTextBlockRange["kind"];
	open: RegExp;
	close: RegExp;
}> = [
	{kind: "IF", open: /^IF\b.*\bTHEN\b/i, close: /^END_IF\b/i},
	{kind: "FOR", open: /^FOR\b.*\bDO\b/i, close: /^END_FOR\b/i},
	{kind: "WHILE", open: /^WHILE\b.*\bDO\b/i, close: /^END_WHILE\b/i},
	{kind: "CASE", open: /^CASE\b.*\bOF\b/i, close: /^END_CASE\b/i},
	{kind: "REPEAT", open: /^REPEAT\b/i, close: /^END_REPEAT\b/i},
];

function normalizeLineForBlockParsing(line: string): string {
	const withoutComment = line.split("//")[0] ?? "";
	return withoutComment.trim().toUpperCase();
}

export function findStructuredTextBlockRange(source: string, currentLine: number): StructuredTextBlockRange | null {
	const lines = source.replace(/\r\n?/g, "\n").split("\n");
	const stack: Array<{kind: StructuredTextBlockRange["kind"]; startLine: number}> = [];
	const ranges: StructuredTextBlockRange[] = [];

	for (let index = 0; index < lines.length; index += 1) {
		const lineNumber = index + 1;
		const normalized = normalizeLineForBlockParsing(lines[index]);

		if (!normalized) {
			continue;
		}

		const closingBlock = BLOCK_DEFINITIONS.find((definition) => definition.close.test(normalized));
		if (closingBlock) {
			for (let cursor = stack.length - 1; cursor >= 0; cursor -= 1) {
				if (stack[cursor].kind === closingBlock.kind) {
					const opened = stack.splice(cursor, 1)[0];
					ranges.push({startLine: opened.startLine, endLine: lineNumber, kind: closingBlock.kind});
					break;
				}
			}
			continue;
		}

		const openingBlock = BLOCK_DEFINITIONS.find((definition) => definition.open.test(normalized));
		if (openingBlock) {
			stack.push({kind: openingBlock.kind, startLine: lineNumber});
		}
	}

	for (const pending of stack) {
		ranges.push({startLine: pending.startLine, endLine: lines.length, kind: pending.kind});
	}

	const candidates = ranges.filter((range) => currentLine >= range.startLine && currentLine <= range.endLine);
	if (candidates.length === 0) {
		return null;
	}

	return candidates.sort((left, right) => (left.endLine - left.startLine) - (right.endLine - right.startLine))[0];
}

export function formatStructuredText(source: string): string {
	const lines = source.replace(/\r\n?/g, "\n").split("\n");
	let indentLevel = 0;
	const indentUnit = "    ";

	const splitComment = (line: string): {code: string; comment: string} => {
		const commentIndex = line.indexOf("//");

		if (commentIndex === -1) {
			return {code: line.trim(), comment: ""};
		}

		return {
			code: line.slice(0, commentIndex).trimEnd(),
			comment: line.slice(commentIndex).trim(),
		};
	};

	const isClosingLine = (line: string) => /^(END_|ELSE\b|ELSIF\b|UNTIL\b)/i.test(line);
	const isMiddleLine = (line: string) => /^(ELSE|ELSIF)\b/i.test(line);
	const isOpeningLine = (line: string) =>
		/\b(THEN|DO|OF)\s*;?$/i.test(line) ||
		/^(IF\b|CASE\b|FOR\b|WHILE\b|REPEAT\b|PROGRAM\b|FUNCTION_BLOCK\b|FUNCTION\b|STRUCT\b|VAR_INPUT\b|VAR_OUTPUT\b|VAR\b|ELSE\s*$|ELSIF\b.*\bTHEN\s*$)/i.test(line);

	// Detecta líneas one-liner tipo "IF x THEN ...; END_IF;" que abren y cierran en la misma línea
	const isSelfContainedBlock = (line: string): boolean => {
		const upper = line.toUpperCase();
		const opens = (upper.match(/\b(IF|FOR|WHILE|CASE|REPEAT)\b/g) ?? []).length;
		const closes = (upper.match(/\b(END_IF|END_FOR|END_WHILE|END_CASE|END_REPEAT)\b/g) ?? []).length;
		return opens > 0 && opens === closes;
	};
	const normalizeCode = (code: string) =>
		code
			.split(/('(?:''|[^'])*')/g)
			.map((segment, index) => {
				if (index % 2 === 1) {
					return segment;
				}

				return segment
					.replace(/\s+/g, " ")
					.replace(/\b[a-z_][a-z0-9_]*\b/gi, (token) => {
						const upper = token.toUpperCase();
						return ST_KEYWORDS.includes(upper) ? upper : token;
					});
			})
			.join("");

	const formatVariableSection = (line: string) => {
		const normalized = normalizeCode(line);
		return normalized
			.replace(/\s*:(?!=)\s*/g, " : ")
			.replace(/\s+AT\s+/gi, " AT ")
			.replace(/\s{2,}/g, " ")
			.trim();
	};

	let inBlockComment = false;

	return lines
		.map((rawLine) => {
			const trimmed = rawLine.trim();

			if (!trimmed) {
				return "";
			}

			// Comentarios de bloque (* ... *): no afectan indent y se emiten tal cual, con indent actual
			if (inBlockComment) {
				const line = `${indentUnit.repeat(indentLevel)}${trimmed}`;
				if (trimmed.includes("*)")) {
					inBlockComment = false;
				}
				return line;
			}

			if (trimmed.startsWith("(*") && !trimmed.includes("*)")) {
				inBlockComment = true;
				return `${indentUnit.repeat(indentLevel)}${trimmed}`;
			}

			const {code, comment} = splitComment(trimmed);
			const selfContained = isSelfContainedBlock(code || trimmed);
			const closing = !selfContained && isClosingLine(trimmed);
			if (closing) {
				indentLevel = Math.max(0, indentLevel - 1);
			}

			const formattedCode = /^(VAR_INPUT|VAR_OUTPUT|VAR)\b/i.test(code) || /:\s*[A-Z_]+\b/i.test(code) ? formatVariableSection(code) : normalizeCode(code);
			const formattedLine = comment ? `${formattedCode}${formattedCode ? " " : ""}${comment}` : formattedCode;

			const result = `${indentUnit.repeat(indentLevel)}${formattedLine}`;

			if (!selfContained && isOpeningLine(code || trimmed) && (!closing || isMiddleLine(code || trimmed))) {
				indentLevel += 1;
			}

			return result;
		})
		.join("\n")
		.trimEnd();
}