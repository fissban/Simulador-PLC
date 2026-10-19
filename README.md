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
