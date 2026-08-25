# Simulador PLC (Node.js + TypeScript)

Base inicial para simular un PLC con **Modbus TCP**.

La interfaz web ahora está montada con **SolidJS + TypeScript** y se compila con **Vite**.

## Características

- Servidor Modbus TCP esclavo.
- Puerto por defecto `502` (configurable por JSON).
- Tabla de direcciones cargada desde archivo `.json`.
- Soporta `coil`, `discreteInput`, `holdingRegister`, `inputRegister`.

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
- Muestra `addressData` + valor actual en memoria Modbus
- Actualiza solo celdas que cambian (sin recargar toda la página)

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

Por defecto se usa: `config/address-table.json`

El archivo `config/server-config.json` define:

- `host`: host de bind para Modbus y Web
- `port`: puerto Modbus TCP
- `updateEveryMs`: ciclo de actualización de funciones runtime
- `webPort`: puerto del servidor web de monitoreo (default `8080`)

También podés:

- Pasar ruta por argumento:

```bash
npm run dev -- config/address-table.json
```

- O por variable de entorno `PLC_TABLE_PATH`.

## Estructura web

La interfaz web está separada por capas:

- `src/web/server.ts`: backend HTTP + endpoint `GET /api/registers`
- `src/web/client/index.html`: entrada de Vite
- `src/web/client/main.tsx`: bootstrap de SolidJS
- `src/web/client/App.tsx`: UI principal
- `src/web/client/styles.css`: estilos

En `npm run build`, la web se genera en `dist/web/public` y el servidor Node la sirve como SPA.

## Formato JSON

```json
{
  "unitId": 1,
  "host": "0.0.0.0",
  "port": 502,
  "registers": [
    {
      "address": 100,
      "type": "holdingRegister",
      "name": "SPEED_SETPOINT",
      "value": 1500,
      "writable": true
    },
    {
      "address": 200,
      "type": "holdingRegisterFloat",
      "name": "SIM_SINE_200",
      "value": 0,
      "runtimeFunction": "sine(0,100)",
      "writable": false
    }
  ]
}
```

## Funciones en runtime

Podés asignar una función al registro con `runtimeFunction`.

Funciones soportadas:

- **`sine(min, max)`**: onda sinusoidal entre min y max (período 10s).
- **`triangle(min, max)`**: onda triangular entre min y max (período 10s).
- **`square(min, max)`**: onda cuadrada entre min y max (período 10s).
- **`ramp(min, max)`**: rampa lineal de min a max que se repite (período 10s).
- **`random(min, max)`**: valor aleatorio entre min y max en cada actualización.

Ejemplos:

```json
{
  "address": 200,
  "type": "holdingRegisterFloat",
  "name": "SIM_SINE",
  "value": 0,
  "runtimeFunction": "sine(0,100)"
},
{
  "address": 201,
  "type": "holdingRegisterFloat",
  "name": "SIM_TRIANGLE",
  "value": 0,
  "runtimeFunction": "triangle(10,90)"
},
{
  "address": 202,
  "type": "holdingRegisterFloat",
  "name": "SIM_RANDOM",
  "value": 0,
  "runtimeFunction": "random(-50,50)"
}
```

El simulador actualiza esos registros periódicamente mientras corre.
