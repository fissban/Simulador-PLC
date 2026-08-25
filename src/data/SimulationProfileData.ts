import { existsSync, readFileSync } from 'fs';
import path from 'path';

/** Override puntual para una instancia {n} de un template (ej: función de simulación o valor fijo distinto por instrumento). */
export interface SimulationOverride
{
    n: number;
    runtimeFunction?: string;
    value?: number | boolean;
}

/** Mapa de nombre de template (con "{n}" literal) a la lista de overrides por instancia. */
interface SimulationProfiles
{
    [templateName: string]: SimulationOverride[];
}

class SimulationProfileData
{
    private profiles: SimulationProfiles = {};

    public constructor()
    {
        //
    }

    private parseFileJSON(path: string): SimulationProfiles
    {
        const content = readFileSync(path, 'utf-8').replace(/^\uFEFF/, '');
        return JSON.parse(content);
    }

    public load(): void
    {
        try
        {
            const simulationProfilesPath = path.resolve(__dirname, '../../config/simulation-profiles.json');

            // El archivo es opcional: si no existe, simplemente no habrá overrides
            if (!existsSync(simulationProfilesPath))
            {
                console.log('[SimulationProfile] No se encontró simulation-profiles.json; se omite.');
                return;
            }

            this.profiles = this.parseFileJSON(simulationProfilesPath);
            console.log(`[SimulationProfile] Perfiles cargados: ${Object.keys(this.profiles).length}`);
        }
        catch (error)
        {
            console.error('[SimulationProfile][ERROR] No se pudieron cargar los perfiles de simulación:', error);
        }
    }

    /** Busca el override definido para la instancia `index` del template `templateName`. */
    public getOverride(templateName: string, index: number): SimulationOverride | undefined
    {
        return this.profiles[templateName]?.find((override) => override.n === index);
    }
}

export const simulationProfileData = new SimulationProfileData();
