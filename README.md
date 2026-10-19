# Simulador PLC (Node.js + TypeScript)

Base inicial para simular un PLC con **Modbus TCP**.

La interfaz web ahora está montada con **SolidJS + TypeScript** y se compila con **Vite**.

## Características

- Servidor Modbus TCP esclavo.
- Puerto por defecto `502` (configurable por JSON).
- Memoria Modbus servida directamente por el simulador.

## Requisitos

- Node.js 20+
- En Windows, para abrir el puerto `502` puede requerir ejecutar terminal como administrador.

## Instalación

```bash
npm install
```

## Ejecución

### Desarrollo

Comandos claros:

- `npm run dev:server`: levanta el servidor Node.js en desarrollo (`Modbus + web`).
- `npm run dev:web`: levanta solo la web de SolidJS con Vite.
- `npm run start:server`: levanta el servidor Node.js compilado desde `dist/`.
- `npm run start:web`: previsualiza la web compilada.

Web de monitoreo:

- URL: `http://localhost:8080` (o el `webPort` configurado)
- Muestra el estado actual expuesto por la API del simulador
- El mapa Modbus se divide en pestañas de Analógicos, Digitales y Directos, con búsqueda por grupo y actualización en tiempo real.
- Analógicos muestra un árbol por instrumento con valor de ingeniería, entrada cruda, escalado, configuración y estado de alarmas HH/H/L/LL. Cada variable conserva su dirección y tipo; los bits indican su posición en el registro. La búsqueda despliega los instrumentos coincidentes y los nodos abiertos se conservan al actualizar o cambiar de pestaña.

### Producción

```bash
npm run build
npm run start:server
```

### Frontend web

La UI vive en `src/web/client` y compila a `dist/web/public`.

Scripts principales:

- `npm run build:server`: compila solo el backend TypeScript.
- `npm run build:web`: compila la web SolidJS.
- `npm run build`: compila ambos.
- `npm run dev:server`: levanta el servidor completo en desarrollo.
- `npm run dev:web`: ejecuta Vite para trabajar la UI.
- `npm run start:server`: arranca el servidor completo ya compilado.
- `npm run start:web`: previsualiza la web compilada.

## Configuración

El archivo `config/server-config.json` define:

- `host`: host de bind para Modbus y Web
- `port`: puerto Modbus TCP
- `webPort`: puerto del servidor web de monitoreo (default `8080`)

## Estructura web

La interfaz web está separada por capas:

- `src/web/server.ts`: backend HTTP + endpoint `GET /api/registers`
- `src/web/client/index.html`: entrada de Vite
- `src/web/client/main.tsx`: bootstrap de SolidJS
- `src/web/client/App.tsx`: UI principal
- `src/web/client/styles.css`: estilos

En `npm run build`, la web se genera en `dist/web/public` y el servidor Node la sirve como SPA.

La lógica de simulación actual vive enteramente en código TypeScript.

## Vista de instrumentos analógicos

El encabezado de cada analógico muestra un badge Habilitado/Deshabilitado según
el bit 0 de su registro de configuración, incluso con el nodo cerrado.

`GET /api/registers` conserva las filas de registros y agrega el objeto opcional
`instrument` con `number` y `field`. Los registros de configuración y estado
incluyen además `alarmBits`, con las posiciones de HH/H/L/LL definidas por el PLC.
La web usa estos metadatos para construir el árbol, sin interpretar los nombres.
La vista es de monitoreo: no modifica registros ni configura el instrumento.

Pruebas de los metadatos y la compatibilidad de los mapeos:

```powershell
node --import tsx --test tests\AnalogMappings.test.ts
```

## Vista de instrumentos digitales

Digitales muestra un árbol por instrumento con la carpeta Alarma (Activada,
DelayActivacion, DelayDesactivacion, Habilitada e Intlk_1 a Intlk_5), además de
Config, Habilitado, NoAlarma, Valor y el registro de valor completo. ID representa
el número de instrumento, no un registro adicional. Nombre se omite porque no
existe un mapeo asociado.

Los metadatos `instrument.bits` identifican los bits de configuración y de valor
según el PLC. Cada bit muestra la dirección `registro.bit`; los delays se muestran
en sus valores originales, sin conversión de unidades. La vista no escribe en
memoria ni altera la simulación. La búsqueda y la conservación de nodos abiertos
funcionan igual que en Analógicos. Directos conserva el listado de registros.

```powershell
node --import tsx --test tests\AnalogMappings.test.ts tests\DigitalMappings.test.ts
```

## Volumen de pileta en SCv1

SCv1 utiliza una sola pileta. En cada ciclo, después del escalado analógico, el
nivel actual se lee del IA 50 y su ingeniería máxima representa la altura máxima.
El volumen máximo es el área configurada por esa altura; el volumen actual es
ese volumen máximo multiplicado por la fracción de llenado (nivel / altura máxima).
El nivel se limita entre cero y la altura máxima.

El área se lee de `D_AREA_PILETA_1` (294, Float32, valor inicial 27) y el resultado
se escribe en `D_VOLUMEN_PILETA_1` (2848, Float32). Si el área está en m² y el nivel
en metros, el volumen queda en m³; no se aplican conversiones de unidades.
La altura máxima debe ser finita y positiva, el área finita y no negativa y el
nivel finito; una configuración inválida genera un error explícito.

```powershell
node --import tsx --test tests\PiletaVolume.test.ts
```
