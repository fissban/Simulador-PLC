import {createEffect, createSignal, For, onCleanup, onMount, Show} from "solid-js";
import {ModbusMapView} from "./components/ModbusMapView";
import {SimulatorControl} from "./components/SimulatorControl";
import type {MainView, SimulatorStatus} from "./types";

const BRAND_NAME = "Dobby Modbus Engine";

export function App() {
	const [activeView] = createSignal<MainView>("modbus");
	const [logoFailed, setLogoFailed] = createSignal(false);
	const [instances, setInstances] = createSignal<SimulatorStatus[]>([]);
	const [instanceId, setInstanceId] = createSignal("");

	const loadInstances = async () => {
		try {
			const response = await fetch("/api/instances");
			if (!response.ok) return;
			const payload = (await response.json()) as {instances: SimulatorStatus[]};
			setInstances(payload.instances);
			// Selecciona la primera instancia si todavía no hay una elegida.
			if (!instanceId() && payload.instances.length > 0) setInstanceId(payload.instances[0].id);
		} catch {
			// El backend puede no estar listo todavía; se reintenta en el próximo ciclo.
		}
	};

	onMount(() => {
		void loadInstances();
		const timer = setInterval(() => void loadInstances(), 3000);
		onCleanup(() => clearInterval(timer));
	});

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

			<nav class="instance-tabs" aria-label="Instancias del simulador">
				<For each={instances()}>
					{(instance) => (
						<button
							type="button"
							class="instance-tab"
							classList={{active: instance.id === instanceId()}}
							aria-selected={instance.id === instanceId()}
							onClick={() => setInstanceId(instance.id)}
						>
							<span class="instance-dot" classList={{running: instance.state === "running", paused: instance.state === "paused"}} aria-hidden="true" />
							<span>{instance.name}</span>
							<small>:{instance.port}</small>
						</button>
					)}
				</For>
			</nav>

			{/* `keyed` remonta los paneles al cambiar de instancia para no arrastrar estado de la anterior. */}
			<Show when={instanceId()} keyed>
				{(id) => (
					<>
						<SimulatorControl instanceId={id} />
						<ModbusMapView instanceId={id} />
					</>
				)}
			</Show>
		</main>
	);
}
