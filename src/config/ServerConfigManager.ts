import { readFileSync } from 'fs';
import path from 'path';

export interface ServerConfig
{
	unitId: number;
	host: string;
    port: number;
    updateEveryMs: number;
	webPort?: number;
}

class ServerConfigManager
{
	private config: ServerConfig | null = null;

	public constructor()
	{
		//
	}

	private parseFileJSON(path: string): ServerConfig
	{
		const config = readFileSync(path, 'utf-8');
		return JSON.parse(config);
	}

	public load(): void
	{
		try
		{
			const serverConfigPath = path.resolve(__dirname, '../../config/server-config.json');
			this.config = this.parseFileJSON(serverConfigPath);
			console.log('[ServerConfig] Configuración cargada:', this.config);
		}
		catch (error)
		{
			console.error('[ServerConfig][ERROR] No se pudo cargar la configuración:', error);
		}
	}

	public getServerConfig(): ServerConfig | null
	{
		return this.config;
	}

	public getUnitId(): number | undefined
	{
		return this.config?.unitId;
	}

	public getHost(): string | undefined
	{
		return this.config?.host;
	}

	public getPort(): number | undefined
	{
		return this.config?.port;
    }
    
    public getUpdateEveryMs(): number
    {
        return this.config?.updateEveryMs ?? 200; // Valor por defecto si no está definido
    }

	public getWebPort(): number
	{
		return this.config?.webPort ?? 8080;
	}
}

export const serverConfigManager = new ServerConfigManager();
