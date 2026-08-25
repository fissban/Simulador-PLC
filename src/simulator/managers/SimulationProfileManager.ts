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

/**
 * SimulationProfileManager
 *
 * Carga `simulation-profiles.json` y expone, por nombre de template e índice {n},
 * el override puntual (runtimeFunction o value) que debe aplicarse al generar
 * el registro correspondiente en AddressData.
 */
class SimulationProfileManager
{
    private profiles: SimulationProfiles = {};

    public constructor()
    {
        //
    }

    private parseFileJSON(filePath: string): SimulationProfiles
    {
        const content = readFileSync(filePath, 'utf-8');
        return JSON.parse(content);
    }

    public load(): void
    {
        try
        {
            const simulationProfilesPath = path.resolve(__dirname, '../../../config/simulation-profiles.json');

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

    /** Devuelve el override definido para un template y una instancia {n}, si existe. */
    public getOverride(templateName: string, n: number): SimulationOverride | undefined
    {
        return this.profiles[templateName]?.find((override) => override.n === n);
    }
}

export const simulationProfileManager = new SimulationProfileManager();
