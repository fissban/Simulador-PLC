# Simulador PLC

Simulador de PLC escrito en **Node.js + TypeScript** que expone su memoria mediante
un **servidor Modbus TCP** y la monitorea desde una **web en SolidJS**. Está pensado
para probar SCADAs (por ejemplo Ignition) sin hardware real: el simulador genera
señales analógicas y digitales, las escala, calcula alarmas y deja todo disponible
en registros Modbus.

## Contenido

- [Funcionalidades](#funcionalidades)
- [Requisitos y dependencias](#requisitos-y-dependencias)
- [Instalación y puesta en marcha](#instalación-y-puesta-en-marcha)
- [Configuración](#configuración)
- [Arquitectura](#arquitectura)
- [Lógica del PLC](#lógica-del-plc)
- [Mapa de memoria](#mapa-de-memoria)
- [API HTTP](#api-http)
- [Interfaz web](#interfaz-web)
- [Validación](#validación)
- [Agregar un programa nuevo](#agregar-un-programa-nuevo)
- [Limitaciones conocidas](#limitaciones-conocidas)

## Funcionalidades

- **Servidor Modbus TCP esclavo** (puerto `502` por defecto) que comparte la memoria
  del PLC sin copias: lo que escribe el simulador se ve al instante desde el cliente y
  viceversa.
- **Ciclo de scan** configurable (250 ms por defecto) que ejecuta la lógica del programa.
- **50 instrumentos analógicos** con señal cruda simulada, escalado a ingeniería,
  habilitación y alarmas LL/L/H/HH con banda muerta (histéresis).
- **20 instrumentos digitales** con señal simulada, habilitación, supresión de alarma,
  5 interlocks y delays de activación/desactivación.
- **Señales por línea de pozo** (4 líneas en SCv1): ID de pozo, diámetro de orificio
  de manifold y VSS.
- **Cálculo de volumen de pileta** a partir del nivel del IA 50.
- **Catálogo de programas** (`SCv1`, `SCv2`) seleccionables en caliente desde la web.
- **Control del simulador**: arrancar, pausar (conserva memoria) y detener (resetea memoria).
- **Monitor web** con el mapa Modbus en pestañas (Analógicos, Digitales, Directos),
  árboles por instrumento, búsqueda y actualización automática.

## Requisitos y dependencias

- **Node.js 18.19 o superior** (se recomienda 20 LTS) y npm.
- En Windows, escuchar en el puerto `502` puede requerir una terminal con permisos de
  administrador. Alternativa: cambiar `port` en la configuración (por ejemplo `5020`).

| Paquete | Tipo | Uso |
|---|---|---|
| `jsmodbus` | runtime | Servidor Modbus TCP sobre los buffers compartidos |
| `solid-js` | runtime | Interfaz web reactiva |
| `zod` | runtime | Declarada para validación; actualmente sin uso en el código |
| `typescript` | dev | Compilación y chequeo de tipos |
| `tsx` | dev | Ejecución de TypeScript en desarrollo |
| `vite`, `vite-plugin-solid` | dev | Servidor de desarrollo y build de la web |
| `@types/node` | dev | Tipos de Node.js |

## Instalación y puesta en marcha

```bash
npm install
```

### Scripts disponibles

| Script | Descripción |
|---|---|
| `npm run server` | Levanta el backend (Modbus + API web) con `tsx watch`, recargando ante cambios |
| `npm run web` | Levanta Vite en `http://localhost:4173` con proxy de `/api` al backend |
| `npm run build:server` | Compila el backend a `dist/` |
| `npm run build:web` | Compila la web a `dist/server/web/public` |
| `npm run build` | Compila backend y web |

### Desarrollo

Usar dos terminales:

```bash
npm run server   # Modbus en :502 y API en :8080
npm run web      # UI en http://localhost:4173
```

Vite reenvía `/api` a `http://127.0.0.1:8080`. Para apuntar a otro backend se puede
definir la variable `VITE_API_TARGET`.

> En desarrollo, `http://localhost:8080` solo sirve la API: la UI compilada no existe
> hasta ejecutar `npm run build:web`.

### Producción

```bash
npm run build
node dist/index.js
```

La web queda disponible en `http://localhost:8080` (o el `webPort` configurado) y el
servidor Modbus en el `port` configurado.

### Secuencia de arranque

`src/index.ts` ejecuta, en orden:

1. Carga `config/server-config.json`.
2. Inicia el servidor web (API + archivos estáticos).
3. Inicia el servidor Modbus TCP.
4. Selecciona y arranca el primer programa del catálogo (`SCv1`).

Si algo falla, el proceso informa el error y termina con código `1`.

## Configuración

Archivo `config/server-config.json`:

```json
{
    "unitId": 1,
    "host": "0.0.0.0",
    "port": 502,
    "updateEveryMs": 200,
    "webPort": 8080
}
```

| Campo | Descripción |
|---|---|
| `host` | Interfaz de escucha para Modbus y web |
| `port` | Puerto Modbus TCP |
| `webPort` | Puerto de la API/web (por defecto `8080`) |
| `unitId` | Reservado; actualmente no se aplica |
| `updateEveryMs` | Reservado; actualmente no se aplica (el scan lo define cada programa) |

## Arquitectura

```mermaid
flowchart LR
    subgraph Cliente
        SCADA["SCADA / cliente Modbus<br/>(Ignition, etc.)"]
        UI["Web SolidJS"]
    end

    subgraph Servidor["Proceso Node.js"]
        MB["ModbusServer<br/>(jsmodbus)"]
        WEB["WebServer<br/>(HTTP + API)"]
        SIM["SimulatorManager"]
        PM["ProgramManager"]
        PLC["Programa PLC<br/>SCv1 / SCv2 → SC → PLC"]
        DM["DataModel"]
        MAP["MappingManager"]
        BUF["BufferManager<br/>(coils + holding registers)"]
    end

    SCADA <-- "Modbus TCP" --> MB
    UI <-- "HTTP /api" --> WEB
    MB <-- "buffers compartidos" --> BUF
    WEB --> SIM
    WEB --> MAP
    SIM --> PM
    SIM --> PLC
    PLC --> DM
    DM --> BUF
    PLC -- "registra direcciones" --> MAP
```

### Capas

| Capa | Archivo | Responsabilidad |
|---|---|---|
| Bootstrap | `src/index.ts` | Orquesta el arranque |
| Configuración | `src/config/ServerConfigManager.ts` | Lee el JSON de configuración |
| Memoria | `src/memory/BufferManager.ts` | Buffers de coils (100) y holding registers (11000); lectura/escritura Int16, bit y Float32 en Big-Endian |
| Mapeo | `src/memory/MappingManager.ts` | Registro nombre → dirección, con metadatos de instrumento para la web |
| Núcleo PLC | `src/plc/core/PLC.ts` | Ciclo de scan (`init`/`execute`), creación de direcciones y generadores de señal |
| Variables | `src/plc/core/DataModel.ts` | Variable con nombre, dirección, tipo y grupo; `read()`/`write()` delegan en `BufferManager` |
| Programas | `src/plc/programs/` | `SC` (base con analógicos y digitales), `SCv1` y `SCv2` |
| Gestión | `src/plc/managers/` | `ProgramManager` (catálogo) y `SimulatorManager` (ciclo de vida) |
| Modbus | `src/server/modbus/ModbusServer.ts` | Servidor TCP sobre los buffers compartidos |
| Web backend | `src/server/web/WebServer.ts` | API REST y servido de la SPA |
| Web frontend | `src/server/web/client/` | UI SolidJS compilada con Vite |

### Jerarquía de programas

```mermaid
classDiagram
    class PLC {
        <<abstract>>
        +init()
        #execute()
        +run()
        +stop()
        #createAddress()
        #sine() triangle() square() ramp() random()
        #mapLinear()
    }
    class SC {
        <<abstract>>
        +IA_SIZE = 50
        +ID_SIZE = 20
        +getAnalogico(n)
        +getDigital(n)
    }
    class SCv1 {
        +VSS_SIZE = 4
        +NUMERO_DE_PILETAS_FISICAS = 1
        piletas
    }
    class SCv2
    PLC <|-- SC
    SC <|-- SCv1
    SC <|-- SCv2
```

### Tipos de dirección

| Tipo | Descripción | Registros |
|---|---|---|
| `HR` | Holding Register Int16 (también se lee por bit) | 1 |
| `HRF` | Float32 IEEE 754 Big-Endian | 2 |
| `C` | Coil | 1 bit |
| `B` | Bit (lectura; escritura sin soporte) | 1 bit |

El grupo de cada variable se deduce de su nombre: `IA_*` → Analógico, `ID_*` →
Digital, `D_*` → Directo.

### Áreas Modbus

| Función | Área | Buffer |
|---|---|---|
| FC03 / FC06 / FC16 | Holding Registers | `hrBuffer` |
| FC04 | Input Registers | `hrBuffer` (misma memoria) |
| FC01 / FC05 / FC15 | Coils | `coilsBuffer` |
| FC02 | Discrete Inputs | `coilsBuffer` (misma memoria) |

## Lógica del PLC

### Ciclo de vida del simulador

```mermaid
stateDiagram-v2
    [*] --> stopped: select(id)<br/>limpia memoria + init()
    stopped --> running: start()
    running --> paused: pause()<br/>conserva memoria
    paused --> running: start()
    running --> stopped: stop()<br/>resetea memoria + init()
    paused --> stopped: stop()
```

Al seleccionar o detener un programa se limpian la memoria y los mapeos y se vuelve a
ejecutar `init()`. Por eso las colecciones internas deben vaciarse al inicio de cada
`init()` para no duplicar instrumentos (`SC` ya lo hace con analógicos y digitales).

### Ciclo de scan (`SC.execute`)

Cada `SCAN_INTERVAL_MS` (250 ms) se ejecutan estas etapas:

1. **Señal cruda analógica**: cada `IA_INPUT` recibe una senoidal (período 120 s)
   entre `rangoMin` y `rangoMax`.
2. **Escalado**: si el instrumento está habilitado (bit 0 de `config`), se convierte
   linealmente de rango crudo a ingeniería y se escribe en `IA_VALOR`. Si está
   deshabilitado, el valor queda en `0`.
3. **Alarmas analógicas**: para instrumentos habilitados se recalcula `IA_ESTADO`.
4. **Señal digital**: el bit 0 de `ID_VALOR` sigue una onda cuadrada desfasada por canal.
5. **Alarmas digitales**: se actualiza el bit 1 (`Activada`) de `ID_VALOR`.

`SCv1` agrega una sexta etapa: el **cálculo de volumen de pileta**.

### Instrumentos analógicos

Bits del registro `config`:

| Bit | Significado |
|---|---|
| 0 | Instrumento habilitado |
| 1 | Alarma LL habilitada |
| 2 | Alarma L habilitada |
| 3 | Alarma H habilitada |
| 4 | Alarma HH habilitada |

El registro `estado` usa las mismas posiciones (1–4) para indicar alarmas activas.

**Histéresis**: con banda muerta `DB`, una alarma baja se activa con
`valor <= SP` y se limpia cuando `valor >= SP + 2·DB`; una alarma alta se activa con
`valor >= SP` y se limpia cuando `valor <= SP − 2·DB`.
Ejemplo: SP = 50 y DB = 1 → H entra en 50 y sale en 48.

Al inicializar, `rangoMax` e `ingenieriaMax` toman valores aleatorios
(0–4000 y 0–2000), y `rangoMin`/`ingenieriaMin` valen 0.

### Instrumentos digitales

Bits del registro `config`:

| Bit | Significado |
|---|---|
| 0 | Habilitado |
| 1 | NoAlarma (suprime la alarma) |
| 2 | Alarma habilitada |
| 3–7 | Interlocks 1 a 5 |

Bits del registro `valor`: bit 0 = señal, bit 1 = alarma activada.

La alarma debe activarse cuando la señal está en 1, el instrumento y la alarma están
habilitados, no hay supresión y ningún interlock está activo. El cambio de estado se
aplica recién cuando la condición se mantiene durante `delayActivacion` o
`delayDesactivacion` (comparados contra milisegundos del reloj del ciclo).

### SCv1

- **Líneas de pozo**: 4 VSS (`activaDemanda`, `estado`), 4 IDs de pozo y 4 diámetros
  de orificio de manifold, además de la condición segura VSS y la presión de
  referencia de fuga.
- **Habilitación**: al inicializar, todos los analógicos se configuran con `config = 1`
  (habilitados, sin alarmas).
- **IDs para el SCADA**: cada analógico recibe en `id` un código que el SCADA usa para
  resolver su nombre. Se asignan en grupos de 4 (presión de pozo, presión anular,
  temperatura de pozo, presión y purga de sandtrap alta/baja, presión de sandtrap en
  manifold, presión y temperatura de DH de baja) más IDs sueltos: IA 25 (mezcla
  explosiva), IA 49 (presión gas instrumento) e IA 50 (nivel pileta 1).
- **Volumen de pileta**: hay una sola pileta. El nivel es el valor del IA 50 y su
  ingeniería máxima representa la altura máxima.

  ```text
  fracción = clamp(nivel / alturaMáxima, 0, 1)
  volumen  = área × alturaMáxima × fracción
  ```

  El área se lee de `D_AREA_PILETA_1` (valor inicial 27) y el resultado se escribe en
  `D_VOLUMEN_PILETA_1`. No hay conversión de unidades (m² × m = m³). Una configuración
  inválida (altura no positiva, área negativa o valores no finitos) lanza `RangeError`.

### SCv2

Reutiliza la lógica base de `SC` sin agregados. No habilita instrumentos al iniciar,
por lo que los valores analógicos quedan en `0` hasta escribir `config`.

## Mapa de memoria

Direcciones base para el instrumento `n` (1-based). Los `HRF` avanzan de a 2 registros.

### Analógicos (`IA_*`, n = 1..50)

| Campo | Tipo | Dirección |
|---|---|---|
| `config` | HR | `101 + (n−1)` |
| `rangoMin` | HRF | `340 + (n−1)·2` |
| `rangoMax` | HRF | `440 + (n−1)·2` |
| `ingenieriaMin` | HRF | `540 + (n−1)·2` |
| `ingenieriaMax` | HRF | `640 + (n−1)·2` |
| `setPointHh` | HRF | `740 + (n−1)·2` |
| `setPointH` | HRF | `840 + (n−1)·2` |
| `setPointL` | HRF | `940 + (n−1)·2` |
| `setPointLl` | HRF | `1040 + (n−1)·2` |
| `deadBand` | HRF | `1140 + (n−1)·2` |
| `id` | HRF | `1260 + (n−1)·2` |
| `estado` | HR | `2372 + (n−1)` |
| `valor` | HRF | `2600 + (n−1)·2` |
| `input` | HRF | `10000 + (n−1)·2` |

### Digitales (`ID_*`, n = 1..20)

| Campo | Tipo | Dirección |
|---|---|---|
| `config` | HR | `152 + (n−1)` |
| `valor` | HR | `2422 + (n−1)` |
| `delayActivacion` | HR | `2522 + (n−1)` |
| `delayDesactivacion` | HR | `2622 + (n−1)` |

### Directos (`D_*`)

| Nombre | Tipo | Dirección | Programa |
|---|---|---|---|
| `D_ESTADO_ENSAYO` | HR | 312 | SC |
| `D_TENSION_BATERIA` | HR | 2886 | SC |
| `D_CONDICION_SEGURA_VSS` | HR | 9 | SCv1 |
| `D_AREA_PILETA_1` | HRF | 294 | SCv1 |
| `D_POZO_ID_1..4` | HR | 1380–1383 | SCv1 |
| `D_DIAMETRO_ORIFICIO_MANIFOLD_1..4` | HR | 1384–1387 | SCv1 |
| `D_PRESION_REFERENCIA_FUGA` | HR | 1448 | SCv1 |
| `D_VOLUMEN_PILETA_1` | HRF | 2848 | SCv1 |
| `D_NUMERO_DE_PILETAS_FISICAS` | HR | 2866 | SCv1 |
| `D_ACTIVA_DEMANDA_VSS_1..4` | HR | 3120–3123 | SCv1 |
| `D_ESTADO_VSS_1..4` | HR | 3148–3151 | SCv1 |

El mapa completo y en vivo se puede consultar en la web o en `GET /api/registers`.

## API HTTP

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/api/registers` | Todos los mapeos con su valor actual |
| `GET` | `/api/simulator` | Estado del simulador y catálogo de programas |
| `POST` | `/api/simulator` | Acción de control |

Cada fila de `/api/registers` incluye `address`, `type`, `name`, `group`, `value`
(redondeado a 3 decimales) y, para instrumentos, un objeto `instrument` con
`number`, `field`, y opcionalmente `alarmBits` (analógicos) o `bits` (digitales).
La web usa estos metadatos para armar los árboles sin interpretar nombres.

Body de `POST /api/simulator`:

```json
{ "action": "selectAndStart", "id": "SCv1" }
```

Acciones: `select`, `selectAndStart`, `start`, `pause`, `stop`. `select` y
`selectAndStart` requieren `id`. Los errores responden `400` con `{ "error": "..." }`.

## Interfaz web

- **Control del programa**: selector de programa, arrancar/reanudar, pausar y detener,
  con el estado actual (se refresca cada 2 s).
- **Mapa Modbus** (se refresca cada 1 s, con opción de pausar la actualización):
  - **Analógicos**: árbol por instrumento con valor de ingeniería, entrada cruda,
    escalado, configuración y alarmas HH/H/L/LL. El encabezado muestra un badge
    Habilitado/Deshabilitado según el bit 0 de `config`, incluso con el nodo cerrado.
  - **Digitales**: árbol por instrumento con la carpeta Alarma (Activada, delays,
    Habilitada, Intlk 1–5), Config, Habilitado, NoAlarma y Valor. Cada bit se muestra
    como `registro.bit`.
  - **Directos**: listado de registros.
- Búsqueda por pestaña, navegación por teclado entre pestañas y conservación de los
  nodos abiertos al actualizar o cambiar de pestaña.
- La web es de **solo lectura** sobre la memoria: no escribe registros.

Estructura del cliente (`src/server/web/client/`):

| Archivo | Descripción |
|---|---|
| `index.html`, `main.tsx` | Entrada de Vite y bootstrap de SolidJS |
| `app/App.tsx` | Layout principal |
| `app/components/SimulatorControl.tsx` | Control del programa |
| `app/components/ModbusMapView.tsx` | Pestañas, búsqueda y polling |
| `app/components/AnalogInstrumentTree.tsx` | Árbol de analógicos |
| `app/components/DigitalInstrumentTree.tsx` | Árbol de digitales |
| `app/components/InstrumentTreeParts.tsx` | Ramas, hojas e índice compartidos |
| `app/types.ts`, `app/app.css` | Tipos y estilos |

## Validación

Chequeo de tipos del backend y de la web:

```powershell
npx tsc -p tsconfig.json --noEmit
npx tsc -p src\server\web\client\tsconfig.json --noEmit
```

## Agregar un programa nuevo

1. Crear la clase en `src/plc/programs/` extendiendo `SC` (o `PLC`).
2. Implementar `init()` (crear direcciones con `createAddress`, llamando primero a
   `super.init()`) y `execute()` (llamando a `super.execute()` si extiende `SC`).
3. Registrarla en `src/plc/managers/ProgramManager.ts`.

La API y la web la detectan automáticamente.

## Limitaciones conocidas

- Las direcciones `delayDesactivacion` de los digitales (2622–2641) se superponen con
  los `valor` HRF de los analógicos 12 a 21.
- En SCv1, el IA 40 recibe primero el ID 36 (presión de ST 1 baja) y luego el 35
  (temperatura de DH de baja 4); queda 35.
- SCv1 no vacía `vss` ni `piletas` al reinicializar, por lo que detener o
  reseleccionar el programa agrega entradas duplicadas a esas colecciones.
- `unitId` y `updateEveryMs` se leen de la configuración pero todavía no se aplican.
- Las variables de tipo `B` no admiten escritura.
- `config/st-program.st` es una referencia en Structured Text de una versión anterior
  del mapa; no se ejecuta y puede no coincidir con las direcciones actuales.
