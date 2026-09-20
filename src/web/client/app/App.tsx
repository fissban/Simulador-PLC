import {createEffect, createSignal} from "solid-js";
import {StVariableMonitorView} from "./components/StVariableMonitorView";
import {StructuredTextView} from "./components/StructuredTextView";
import type {MainView} from "./types";

const BRAND_NAME = "Dobby Modbus Engine";

export function App() {
	const [activeView, setActiveView] = createSignal<MainView>("st");
	const [logoFailed, setLogoFailed] = createSignal(false);

	createEffect(() => {
		const titleByView: Record<MainView, string> = {
			st: "Structured Text",
			"st-monitor": "Monitoreo ST",
			modbus: "Mapa Modbus",
		};
		document.title = `${BRAND_NAME} - ${titleByView[activeView()]}`;
	});

	return (
		<main class="app-shell">
			<header class="hero">
				<div class="brand-block">
					<div class="brand-mark" aria-hidden="true">
						{logoFailed() ? <span class="brand-mark-fallback">PLC</span> : <img src="/logo.png" alt="" class="brand-logo" onError={() => setLogoFailed(true)} />}
					</div>
					<div>
						<h1>{BRAND_NAME}</h1>
						<p class="eyebrow">Software creado por Marco Faccio V1.0</p>
					</div>
				</div>
			</header>

			<nav class="main-tabs" aria-label="Vistas principales">
				<button class="main-tab" classList={{active: activeView() === "st"}} type="button" aria-selected={activeView() === "st"} onClick={() => setActiveView("st")}>
					<span>Structured Text</span>
				</button>
				<button class="main-tab" classList={{active: activeView() === "st-monitor"}} type="button" aria-selected={activeView() === "st-monitor"} onClick={() => setActiveView("st-monitor")}>
					<span>Monitoreo ST</span>
				</button>
			</nav>

			{activeView() === "st" && <StructuredTextView />}
			{activeView() === "st-monitor" && <StVariableMonitorView />}
		</main>
	);
}
