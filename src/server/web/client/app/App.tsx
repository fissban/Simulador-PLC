import {createEffect, createSignal} from "solid-js";
import {ModbusMapView} from "./components/ModbusMapView";
import {SimulatorControl} from "./components/SimulatorControl";
import type {MainView} from "./types";

const BRAND_NAME = "Dobby Modbus Engine";

export function App() {
	const [activeView] = createSignal<MainView>("modbus");
	const [logoFailed, setLogoFailed] = createSignal(false);

	createEffect(() => {
		const titleByView: Record<MainView, string> = {
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
				<button class="main-tab" classList={{active: true}} type="button" aria-selected="true">
					<span>Mapa Modbus</span>
				</button>
			</nav>

			<SimulatorControl />

			<ModbusMapView />
		</main>
	);
}
