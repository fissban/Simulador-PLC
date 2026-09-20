import { createMemo, createSignal, onMount } from "solid-js";
import { DEFAULT_ST_CODE, findStructuredTextBlockRange, formatStructuredText, highlightStructuredText } from "../st";

export function StructuredTextView()
{
    const INDENT = "    ";

    const [stSource, setStSource] = createSignal(DEFAULT_ST_CODE);
    const [saveStatus, setSaveStatus] = createSignal<{ message: string; tone: "idle" | "ok" | "error"; }>({ message: "", tone: "idle" });
    const [isSaving, setIsSaving] = createSignal(false);
    const [translatedJs, setTranslatedJs] = createSignal("");
    const [isJsLoading, setIsJsLoading] = createSignal(false);
    const highlightedSt = createMemo(() => highlightStructuredText(stSource()));
    const [currentLine, setCurrentLine] = createSignal(1);
    const [scrollTop, setScrollTop] = createSignal(0);
    const [lineHeightPx, setLineHeightPx] = createSignal(22);
    const lineNumbers = createMemo(() => Array.from({ length: stSource().split("\n").length }, (_, index) => `${index + 1}`).join("\n"));
    const activeLineTop = createMemo(() => Math.max(0, 14 + (currentLine() - 1) * lineHeightPx() - scrollTop()));
    const activeBlock = createMemo(() => findStructuredTextBlockRange(stSource(), currentLine()));
    const activeBlockTop = createMemo(() =>
    {
        const block = activeBlock();
        if (!block)
        {
            return 0;
        }

        return Math.max(0, 14 + (block.startLine - 1) * lineHeightPx() - scrollTop());
    });
    const activeBlockHeight = createMemo(() =>
    {
        const block = activeBlock();
        if (!block)
        {
            return 0;
        }

        return Math.max(lineHeightPx(), (block.endLine - block.startLine + 1) * lineHeightPx());
    });

    let editorInput: HTMLTextAreaElement | undefined;
    let editorHighlight: HTMLPreElement | undefined;
    let editorGutter: HTMLPreElement | undefined;

    const getLineFromCursor = (content: string, selectionStart: number) => content.slice(0, selectionStart).split("\n").length;

    const updateCurrentLine = () =>
    {
        if (!editorInput)
        {
            return;
        }

        setCurrentLine(getLineFromCursor(editorInput.value, editorInput.selectionStart));
    };

    const getLineIndentation = (line: string): string =>
    {
        const indentation = line.match(/^\s*/);
        return indentation ? indentation[0] : "";
    };

    const getLineStartIndex = (content: string, index: number): number => content.lastIndexOf("\n", Math.max(0, index - 1)) + 1;

    const getLineEndIndex = (content: string, index: number): number =>
    {
        const lineEnd = content.indexOf("\n", index);
        return lineEnd === -1 ? content.length : lineEnd;
    };

    const getAutoClose = (lineBeforeCursor: string): { closing: string; includeUntilLine?: boolean; } | null =>
    {
        const trimmedUpper = lineBeforeCursor.trim().toUpperCase();

        if (/^IF\b.*\bTHEN\s*$/i.test(trimmedUpper))
        {
            return { closing: "END_IF;" };
        }

        if (/^FOR\b.*\bDO\s*$/i.test(trimmedUpper))
        {
            return { closing: "END_FOR;" };
        }

        if (/^WHILE\b.*\bDO\s*$/i.test(trimmedUpper))
        {
            return { closing: "END_WHILE;" };
        }

        if (/^CASE\b.*\bOF\s*$/i.test(trimmedUpper))
        {
            return { closing: "END_CASE;" };
        }

        if (/^REPEAT\s*$/i.test(trimmedUpper))
        {
            return { closing: "END_REPEAT;", includeUntilLine: true };
        }

        return null;
    };

    const shouldIncreaseIndent = (lineBeforeCursor: string): boolean =>
    {
        const trimmedUpper = lineBeforeCursor.trim().toUpperCase();

        if (!trimmedUpper)
        {
            return false;
        }

        return (
            /^IF\b.*\bTHEN\s*$/i.test(trimmedUpper) ||
            /^ELSIF\b.*\bTHEN\s*$/i.test(trimmedUpper) ||
            /^ELSE\s*$/i.test(trimmedUpper) ||
            /^FOR\b.*\bDO\s*$/i.test(trimmedUpper) ||
            /^WHILE\b.*\bDO\s*$/i.test(trimmedUpper) ||
            /^CASE\b.*\bOF\s*$/i.test(trimmedUpper) ||
            /^REPEAT\s*$/i.test(trimmedUpper) ||
            /^PROGRAM\b/i.test(trimmedUpper) ||
            /^FUNCTION_BLOCK\b/i.test(trimmedUpper) ||
            /^FUNCTION\b/i.test(trimmedUpper) ||
            /^VAR(?:_[A-Z_]+)?\s*$/i.test(trimmedUpper)
        );
    };

    const handleTabIndentation = (event: KeyboardEvent & { currentTarget: HTMLTextAreaElement; target: Element; }): boolean =>
    {
        if (event.key !== "Tab" || event.ctrlKey || event.altKey || event.metaKey)
        {
            return false;
        }

        event.preventDefault();

        const target = event.currentTarget;
        const source = target.value;
        const start = target.selectionStart;
        const end = target.selectionEnd;
        const isOutdent = event.shiftKey;

        if (start === end)
        {
            if (!isOutdent)
            {
                const updated = `${source.slice(0, start)}${INDENT}${source.slice(end)}`;
                setStSource(updated);
                queueMicrotask(() =>
                {
                    target.selectionStart = start + INDENT.length;
                    target.selectionEnd = target.selectionStart;
                    setCurrentLine(getLineFromCursor(updated, target.selectionStart));
                    syncScroll();
                });
                return true;
            }

            const lineStart = getLineStartIndex(source, start);
            const lineEnd = getLineEndIndex(source, start);
            const lineText = source.slice(lineStart, lineEnd);
            const leadingSpaces = lineText.match(/^ */)?.[0].length ?? 0;
            const removeCount = Math.min(INDENT.length, leadingSpaces);

            if (removeCount === 0)
            {
                return true;
            }

            const updated = `${source.slice(0, lineStart)}${lineText.slice(removeCount)}${source.slice(lineEnd)}`;
            setStSource(updated);

            queueMicrotask(() =>
            {
                target.selectionStart = Math.max(lineStart, start - removeCount);
                target.selectionEnd = target.selectionStart;
                setCurrentLine(getLineFromCursor(updated, target.selectionStart));
                syncScroll();
            });

            return true;
        }

        const selectionStartLine = getLineStartIndex(source, start);
        const adjustedEnd = end > selectionStartLine && source[end - 1] === "\n" ? end - 1 : end;
        const selectionEndLine = getLineEndIndex(source, adjustedEnd);
        const selectedText = source.slice(selectionStartLine, selectionEndLine);
        const lines = selectedText.split("\n");

        const transformedLines = isOutdent
            ? lines.map((line) => (line.startsWith(INDENT) ? line.slice(INDENT.length) : line.replace(/^ {1,4}/, "")))
            : lines.map((line) => `${INDENT}${line}`);

        const transformedText = transformedLines.join("\n");
        const updated = `${source.slice(0, selectionStartLine)}${transformedText}${source.slice(selectionEndLine)}`;
        setStSource(updated);

        queueMicrotask(() =>
        {
            target.selectionStart = selectionStartLine;
            target.selectionEnd = selectionStartLine + transformedText.length;
            setCurrentLine(getLineFromCursor(updated, target.selectionStart));
            syncScroll();
        });

        return true;
    };

    const handleSmartEnter = (event: KeyboardEvent & { currentTarget: HTMLTextAreaElement; target: Element; }) =>
    {
        if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey)
        {
            return;
        }

        const target = event.currentTarget;
        const source = target.value;
        const start = target.selectionStart;
        const end = target.selectionEnd;

        if (start !== end)
        {
            return;
        }

        const lineStart = source.lastIndexOf("\n", start - 1) + 1;
        const lineEndRaw = source.indexOf("\n", start);
        const lineEnd = lineEndRaw === -1 ? source.length : lineEndRaw;
        const lineBeforeCursor = source.slice(lineStart, start);
        const lineFull = source.slice(lineStart, lineEnd);
        const autoClose = getAutoClose(lineBeforeCursor);
        const baseIndent = getLineIndentation(lineFull);

        event.preventDefault();

        if (autoClose && source.slice(start, lineEnd).trim() === "")
        {
            const innerIndent = `${baseIndent}${INDENT}`;
            const closingBlock = autoClose.includeUntilLine
                ? `\n${innerIndent}\n${baseIndent}UNTIL ;\n${baseIndent}${autoClose.closing}`
                : `\n${innerIndent}\n${baseIndent}${autoClose.closing}`;

            const updated = `${source.slice(0, start)}${closingBlock}${source.slice(end)}`;
            setStSource(updated);

            queueMicrotask(() =>
            {
                target.selectionStart = start + 1 + innerIndent.length;
                target.selectionEnd = target.selectionStart;
                setCurrentLine(getLineFromCursor(updated, target.selectionStart));
                syncScroll();
            });
            return;
        }

        const nextIndent = shouldIncreaseIndent(lineBeforeCursor) ? `${baseIndent}${INDENT}` : baseIndent;
        const insertion = `\n${nextIndent}`;
        const updated = `${source.slice(0, start)}${insertion}${source.slice(end)}`;
        setStSource(updated);

        queueMicrotask(() =>
        {
            target.selectionStart = start + insertion.length;
            target.selectionEnd = target.selectionStart;
            setCurrentLine(getLineFromCursor(updated, target.selectionStart));
            syncScroll();
        });
    };

    const handleEditorKeyDown = (event: KeyboardEvent & { currentTarget: HTMLTextAreaElement; target: Element; }) =>
    {
        if (handleTabIndentation(event))
        {
            return;
        }

        handleSmartEnter(event);
    };

    const syncScroll = () =>
    {
        if (!editorInput || !editorHighlight || !editorGutter)
        {
            return;
        }

        editorHighlight.scrollTop = editorInput.scrollTop;
        editorHighlight.scrollLeft = editorInput.scrollLeft;
        editorGutter.scrollTop = editorInput.scrollTop;
        setScrollTop(editorInput.scrollTop);
    };

    const flashStatus = (message: string, tone: "ok" | "error") =>
    {
        setSaveStatus({ message, tone });
        window.setTimeout(() => setSaveStatus({ message: "", tone: "idle" }), 3500);
    };

    const handleSave = async () =>
    {
        if (isSaving())
        {
            return;
        }

        setIsSaving(true);
        try
        {
            const response = await fetch("/api/st-code", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ source: stSource() }),
            });

            if (!response.ok)
            {
                throw new Error(`HTTP ${response.status}`);
            }

            await refreshTranslatedJs();
            flashStatus("Código guardado en el servidor", "ok");
        } catch (error)
        {
            flashStatus(`No se pudo guardar: ${(error as Error).message}`, "error");
        } finally
        {
            setIsSaving(false);
        }
    };

    const refreshTranslatedJs = async () =>
    {
        setIsJsLoading(true);
        try
        {
            const response = await fetch("/api/st/js");
            if (!response.ok)
            {
                setTranslatedJs("");
                return;
            }

            const payload = (await response.json()) as { translation?: { jsSource?: string; }; };
            setTranslatedJs(payload.translation?.jsSource ?? "");
        } finally
        {
            setIsJsLoading(false);
        }
    };

    const handleDownloadTranslatedJs = async () =>
    {
        try
        {
            const response = await fetch("/api/st/js/download");
            if (!response.ok)
            {
                throw new Error(`HTTP ${response.status}`);
            }

            const jsSource = await response.text();
            const blob = new Blob([jsSource], { type: "application/javascript;charset=utf-8" });
            const url = URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = "translated-program.js";
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            URL.revokeObjectURL(url);
        } catch (error)
        {
            flashStatus(`No se pudo descargar JS: ${(error as Error).message}`, "error");
        }
    };

    const handleDownload = () =>
    {
        const blob = new Blob([stSource()], { type: "text/plain;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = "program.st";
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
    };

    onMount(async () =>
    {
        try
        {
            const response = await fetch("/api/st-code");
            if (!response.ok)
            {
                await refreshTranslatedJs();
                return;
            }
            const payload = (await response.json()) as { source?: string; };
            if (payload.source && payload.source.trim().length > 0)
            {
                setStSource(payload.source);
            }
            await refreshTranslatedJs();
        } catch (error)
        {
            console.warn("[ST] No se pudo cargar el código guardado:", error);
            await refreshTranslatedJs();
        }
    });

    return (
        <section class="st-layout">
            <div class="st-panel">

                <label class="st-field" for="st-source">
                    <span>Código ST (IEC 61131-3/Schneider)</span>
                    <div class="st-editor">
                        <pre class="st-gutter" ref={(element) => (editorGutter = element)} aria-hidden="true">
                            {lineNumbers()}
                        </pre>
                        <div class="st-code-layer">
                            <div
                                class="st-active-block"
                                style={{
                                    transform: `translateY(${activeBlockTop()}px)`,
                                    height: `${activeBlockHeight()}px`,
                                    opacity: activeBlock() ? "1" : "0",
                                }}
                            />
                            <div class="st-active-line" style={{ transform: `translateY(${activeLineTop()}px)`, height: `${lineHeightPx()}px` }} />
                            <pre class="st-highlight" ref={(element) => (editorHighlight = element)} aria-hidden="true" innerHTML={highlightedSt()} />
                            <textarea
                                id="st-source"
                                class="st-editor-input"
                                ref={(element) =>
                                {
                                    editorInput = element;
                                    const computedLineHeight = Number.parseFloat(window.getComputedStyle(element).lineHeight);
                                    if (Number.isFinite(computedLineHeight) && computedLineHeight > 0)
                                    {
                                        setLineHeightPx(computedLineHeight);
                                    }
                                }}
                                value={stSource()}
                                onInput={(event) =>
                                {
                                    setStSource(event.currentTarget.value);
                                    setCurrentLine(getLineFromCursor(event.currentTarget.value, event.currentTarget.selectionStart));
                                }}
                                onScroll={syncScroll}
                                onClick={updateCurrentLine}
                                onKeyDown={handleEditorKeyDown}
                                onKeyUp={updateCurrentLine}
                                onSelect={updateCurrentLine}
                                spellcheck={false}
                                placeholder="Escribe aquí tu lógica en Structured Text"
                            />
                        </div>
                    </div>
                </label>

                <div class="st-actions">
                    <button class="primary-action" type="button" onClick={() => setStSource(formatStructuredText(stSource()))}>
                        Formatear código
                    </button>
                    <button class="primary-action" type="button" onClick={handleSave} disabled={isSaving()}>
                        {isSaving() ? "Guardando..." : "Guardar en servidor"}
                    </button>
                    <button class="secondary-action" type="button" onClick={handleDownloadTranslatedJs}>
                        Descargar JS traducido
                    </button>
                    <button class="secondary-action" type="button" onClick={handleDownload}>
                        Descargar .st
                    </button>
                    <button class="secondary-action" type="button" onClick={() => setStSource(DEFAULT_ST_CODE)}>
                        Cargar ejemplo
                    </button>
                    {saveStatus().message && <span class={`st-save-status st-save-status--${saveStatus().tone}`}>{saveStatus().message}</span>}
                </div>
            </div>
        </section>
    );
}
