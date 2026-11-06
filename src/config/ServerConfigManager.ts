import { readFileSync } from 'fs';
import path from 'path';
import { z } from 'zod';

/**
 * Definición de una instancia del simulador: un servidor Modbus propio con un
 * programa asignado y su propia memoria.
 */
const instanceSchema = z.object({
	/** Identificador único y estable (se usa en la API y la web). */
	id: z.string().regex(/^[A-Za-z0-9_-]+$/, 'solo letras, números, "-" y "_"'),
	/** Nombre legible. Si se omite se usa el id. */
	name: z.string().min(1).optional(),
	/** Id del programa del catálogo (`SCv1`, `SCv2`, ...). */
	program: z.string().min(1),
	/** Puerto Modbus TCP exclusivo de esta instancia. */
	port: z.number().int().min(1).max(65535),
	/** Intervalo de scan del programa en milisegundos. */
	scanIntervalMs: z.number().int().positive().default(250),
	/** Si el programa arranca automáticamente al iniciar el proceso. */
	autoStart: z.boolean().default(true)
});

const serverConfigSchema = z.object({
	host: z.string().min(1).default('0.0.0.0'),
	webPort: z.number().int().min(1).max(65535).default(8080),
	instances: z.array(instanceSchema).min(1, 'debe definirse al menos una instancia')
}).superRefine((config, ctx) =>
{
	const ids = new Set<string>();
	const ports = new Set<number>([config.webPort]);

	config.instances.forEach((instance, index) =>
	{
		if (ids.has(instance.id))
		{
			ctx.addIssue({ code: 'custom', path: ['instances', index, 'id'], message: `id duplicado: "${instance.id}"` });
		}
		ids.add(instance.id);

		if (ports.has(instance.port))
		{
			ctx.addIssue({ code: 'custom', path: ['instances', index, 'port'], message: `puerto ${instance.port} repetido (o igual a webPort)` });
		}
		ports.add(instance.port);
	});
});

export type InstanceConfig = z.infer<typeof instanceSchema>;
export type ServerConfig = z.infer<typeof serverConfigSchema>;

class ServerConfigManager
{
	private config: ServerConfig | null = null;

	/**
	 * Lee y valida `config/server-config.json`. Lanza un error descriptivo si el
	 * archivo no existe, no es JSON válido o no cumple el esquema.
	 */
	public load(): void
	{
		const serverConfigPath = path.resolve(__dirname, '../../config/server-config.json');

		let raw: unknown;
		try
		{
			raw = JSON.parse(readFileSync(serverConfigPath, 'utf-8'));
		}
		catch (error)
		{
			throw new Error(`No se pudo leer ${serverConfigPath}: ${(error as Error).message}`);
		}

		const result = serverConfigSchema.safeParse(raw);
		if (!result.success)
		{
			const details = result.error.issues
				.map((issue) => `  - ${issue.path.join('.') || '(raíz)'}: ${issue.message}`)
				.join('\n');
			throw new Error(`Configuración inválida en ${serverConfigPath}:\n${details}`);
		}

		this.config = result.data;
		console.log('[ServerConfig] Configuración cargada:', JSON.stringify(this.config));
	}

	public getServerConfig(): ServerConfig | null
	{
		return this.config;
	}

	public getHost(): string
	{
		return this.config?.host ?? '0.0.0.0';
	}

	public getWebPort(): number
	{
		return this.config?.webPort ?? 8080;
	}

	public getInstances(): InstanceConfig[]
	{
		return this.config?.instances ?? [];
	}
}

export const serverConfigManager = new ServerConfigManager();
