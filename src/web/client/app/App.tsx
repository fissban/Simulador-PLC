import {For, Show, createEffect, createMemo, createSignal, onCleanup, onMount} from "solid-js";

type RegisterGroup = "analogicos" | "digitales" | "directos";

type RegisterRow = {
	address: number;
	formattedAddress: string;
	type: string;
	group: RegisterGroup;
	name: string;
	description: string;
	writable: string;
	runtimeFunction: string;
	expression: string;
	configValue: string;
	modbusValue: string;
};

type RegistersResponse = {
	rows: RegisterRow[];
};

const POLL_INTERVAL_MS = 1000;
const BRAND_NAME = "Dobby Modbus Engine";
const groups: Array<{key: RegisterGroup; label: string}> = [
	{key: "analogicos", label: "Analógicos"},
	{key: "digitales", label: "Digitales"},
	{key: "directos", label: "Directos"},
];
const columns: Array<{key: keyof RegisterRow; label: string}> = [
	{key: "formattedAddress", label: "Address"},
	{key: "type", label: "Type"},
	{key: "name", label: "Name"},
	{key: "description", label: "Description"},
	{key: "writable", label: "Writable"},
	{key: "runtimeFunction", label: "Runtime Function"},

	{key: "configValue", label: "Value (JSON)"},
	{key: "modbusValue", label: "Value (Modbus)"},
	{key: "expression", label: "Expression"},
];

export function App() {
	const [rows, setRows] = createSignal<RegisterRow[]>([]);
	const [selectedGroup, setSelectedGroup] = createSignal<RegisterGroup>("analogicos");
	const [searchText, setSearchText] = createSignal("");
	const [status, setStatus] = createSignal("Conectando...");
	const [lastUpdated, setLastUpdated] = createSignal<string | null>(null);
	const [logoFailed, setLogoFailed] = createSignal(false);

	const groupRows = createMemo(() => rows().filter((row) => row.group === selectedGroup()));
	const visibleRows = createMemo(() => {
		const query = searchText().trim().toLocaleLowerCase();

		if (!query) {
			return groupRows();
		}

		return groupRows().filter((row) => [row.formattedAddress, row.type, row.name, row.description].some((value) => value.toLocaleLowerCase().includes(query)));
	});
	const totalCount = createMemo(() => visibleRows().length);

	const refreshRows = async (): Promise<void> => {
		try {
			const response = await fetch("/api/registers", {cache: "no-store"});

			if (!response.ok) {
				setStatus(`HTTP ${response.status}`);
				return;
			}

			const contentType = response.headers.get("content-type") ?? "";
			if (!contentType.includes("application/json")) {
				setStatus("API inválida (se recibió HTML)");
				return;
			}

			const payload = (await response.json()) as RegistersResponse;
			setRows(Array.isArray(payload.rows) ? payload.rows : []);
			setStatus("Activo");
			setLastUpdated(new Date().toLocaleTimeString("es-AR"));
		} catch (error) {
			setStatus(error instanceof Error ? error.message : "Error desconocido");
		}
	};

	onMount(() => {
		void refreshRows();
		const timer = window.setInterval(() => void refreshRows(), POLL_INTERVAL_MS);
		onCleanup(() => window.clearInterval(timer));
	});

	createEffect(() => {
		document.title = `${BRAND_NAME} - ${totalCount()} registros`;
	});

	return (
		<main class="app-shell">
			<header class="hero">
				<div class="brand-block">
					<div class="brand-mark" aria-hidden="true">
						<Show when={!logoFailed()} fallback={<span class="brand-mark-fallback">PLC</span>}>
							<img src="/logo.png" alt="" class="brand-logo" onError={() => setLogoFailed(true)} />
						</Show>
					</div>
					<div>
                        <h1>{BRAND_NAME}</h1>
                        <p class="eyebrow">Sofware creado por Marco Faccio V1.0</p>
					</div>
				</div>
				<div class="status-card">
					<span class="status-dot" data-status={status()} />
					<div>
						<strong>{status()}</strong>
						<p>
							<Show when={lastUpdated()} fallback="Esperando primer refresco...">
								<strong>Última actualización:</strong> {lastUpdated()}
							</Show>
                        </p>
                        <p>
                            <strong>Intervalo:</strong> {POLL_INTERVAL_MS} ms
                        </p>
					</div>
				</div>
			</header>

			<nav class="group-tabs" aria-label="Grupos de registros">
				<For each={groups}>
					{(group) => (
						<button
							class="group-tab"
							classList={{active: selectedGroup() === group.key}}
							type="button"
							aria-selected={selectedGroup() === group.key}
							onClick={() => setSelectedGroup(group.key)}
						>
							<span>{group.label}</span>
							<strong>{rows().filter((row) => row.group === group.key).length}</strong>
						</button>
					)}
				</For>
			</nav>

			<div class="search-bar">
				<label for="register-search">Buscar registros</label>
				<div class="search-controls">
					<input
						id="register-search"
						type="search"
						value={searchText()}
						onInput={(event) => setSearchText(event.currentTarget.value)}
						placeholder="Address, type, name o description"
					/>
					<Show when={searchText()}>
						<button class="clear-search" type="button" onClick={() => setSearchText("")}>
							Limpiar
						</button>
					</Show>
				</div>
			</div>

			<section class="table-card">
				<div class="table-scroll">
					<table>
						<thead>
							<tr>
								<For each={columns}>{(column) => <th>{column.label}</th>}</For>
							</tr>
						</thead>
						<tbody>
							<Show
								when={visibleRows().length > 0}
								fallback={
									<tr>
										<td class="empty-state" colSpan={columns.length}>
											No hay registros en este grupo.
										</td>
									</tr>
								}
							>
								<For each={visibleRows()}>
									{(row) => (
										<tr>
											<For each={columns}>{(column) => <td>{row[column.key]}</td>}</For>
										</tr>
									)}
								</For>
							</Show>
						</tbody>
					</table>
				</div>
			</section>
		</main>
	);
}
