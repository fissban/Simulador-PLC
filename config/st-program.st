(*
    Programa Structured Text (IEC 61131-3 / Schneider)
    ---------------------------------------------------
    Traducción de la lógica declarada en config/address-table.json.

    Instrumentos analógicos IA1..IA50 (n = 1..50):
      - IA{n}_INPUT           : %MW(10000 + (n-1))    -> HR10000, HR10001... (INT 16-bit)
      - IA{n}_VALOR           : %MD( 2500 + (n-1)*2)  -> HRF5000, HRF5002... (FLOAT 32-bit)
      - IA{n}_CONFIG          : %MW(  101 + (n-1))    -> HR101, HR102... (WORD 16-bit)
      - IA{n}_ESTADO          : %MW( 2372 + (n-1))    -> HR2372, HR2373... (WORD 16-bit)
      - IA{n}_RANGO_MIN       : %MD(  170 + (n-1)*2)  -> HRF340, HRF342...
      - IA{n}_RANGO_MAX       : %MD(  220 + (n-1)*2)  -> HRF440, HRF442...
      - IA{n}_INGENIERIA_MIN  : %MD(  270 + (n-1)*2)  -> HRF540, HRF542...
      - IA{n}_INGENIERIA_MAX  : %MD(  320 + (n-1)*2)  -> HRF640, HRF642...
      - IA{n}_SET_POINT_HH    : %MD(  370 + (n-1)*2)  -> HRF740, HRF742...
      - IA{n}_SET_POINT_H     : %MD(  420 + (n-1)*2)  -> HRF840, HRF842...
      - IA{n}_SET_POINT_L     : %MD(  470 + (n-1)*2)  -> HRF940, HRF942...
      - IA{n}_SET_POINT_LL    : %MD(  520 + (n-1)*2)  -> HRF1040, HRF1042...
      - IA{n}_DEAD_BAND       : %MD(  570 + (n-1)*2)  -> HRF1140, HRF1142...

    Bits del registro CONFIG: 1=LOLO 2=LO 3=HI 4=HIHI
    Bits del registro ESTADO: 1=LOLO 2=LO 3=HI 4=HIHI

    -----------------------------------------------------------
    Funcion SimSine: senoide reescalada al rango [fMin, fMax].
      SimSine = fMin + (fMax - fMin) * (0.5 + 0.5 * SIN(2*PI*(t+phase)/period))
    -----------------------------------------------------------
*)

FUNCTION SimSine : REAL
    VAR_INPUT
        fMin : REAL;
        fMax : REAL;
        fPeriodS : REAL;
        fTimeS : REAL;
        fPhaseS : REAL;
    END_VAR

    VAR
        fPhase : REAL;
        fSinArg : REAL;
    END_VAR

    IF fPeriodS <= 0.0 THEN
        SimSine := fMin;
        RETURN;
    END_IF;

    fSinArg := 6.28318530717959 * ((fTimeS + fPhaseS) / fPeriodS);
    fPhase := 0.5 + 0.5 * SIN(fSinArg);
    SimSine := fMin + (fMax - fMin) * fPhase;
END_FUNCTION

PROGRAM Main

    VAR_INPUT
        // Coils directos declarados en address-table.json
        bMotorStart AT %I0.0 : BOOL; // EXAMPLE_MOTOR_START (address 0)
        bMotorStop AT %I0.1 : BOOL; // EXAMPLE_MOTOR_STOP  (address 1)
    END_VAR

    VAR
        // Entradas crudas simuladas (1 registro Modbus por canal)
        aInputRaw AT %MW10000 : ARRAY[1..50] OF INT;

        // Configuración por instrumento (Ignition/Modbus: HRF{addr} = %MD(addr/2))
        aRangoMin AT %MD170 : ARRAY[1..50] OF REAL; // HRF340, HRF342, HRF344...
        aRangoMax AT %MD220 : ARRAY[1..50] OF REAL; // HRF440, HRF442, HRF444...
        aIngenieriaMin AT %MD270 : ARRAY[1..50] OF REAL; // HRF540, HRF542, HRF544...
        aIngenieriaMax AT %MD320 : ARRAY[1..50] OF REAL; // HRF640, HRF642, HRF644...

        aSetPointHH AT %MD370 : ARRAY[1..50] OF REAL; // HRF740, HRF742, HRF744...
        aSetPointH AT %MD420 : ARRAY[1..50] OF REAL; // HRF840, HRF842, HRF844...
        aSetPointL AT %MD470 : ARRAY[1..50] OF REAL; // HRF940, HRF942, HRF944...
        aSetPointLL AT %MD520 : ARRAY[1..50] OF REAL; // HRF1040, HRF1042, HRF1044...
        aDeadBand AT %MD570 : ARRAY[1..50] OF REAL; // HRF1140, HRF1142, HRF1144...

        // Registros de configuración/estado (bitfields)
        aConfig AT %MW101 : ARRAY[1..50] OF INT;
        aEstado AT %MW2372 : ARRAY[1..50] OF INT;

        // Índice y auxiliares de cálculo
        iIndex : INT;
        fInputRaw : REAL;
        fRangoMin : REAL;
        fRangoMax : REAL;
        fIngMin : REAL;
        fIngMax : REAL;
        fSpan : REAL;
        fDeadBand : REAL;
        fValor : REAL;

        // Flags decodificados desde CONFIG
        bHabLoLo : BOOL;
        bHabLo : BOOL;
        bHabHi : BOOL;
        bHabHiHi : BOOL;

        // Estado previo de alarmas (para histéresis con DEAD_BAND)
        aAlarmaLoLoPrev : ARRAY[1..50] OF BOOL;
        aAlarmaLoPrev : ARRAY[1..50] OF BOOL;
        aAlarmaHiPrev : ARRAY[1..50] OF BOOL;
        aAlarmaHiHiPrev : ARRAY[1..50] OF BOOL;

        bAlarmaLoLo : BOOL;
        bAlarmaLo : BOOL;
        bAlarmaHi : BOOL;
        bAlarmaHiHi : BOOL;

        wEstado : INT;

        // Simulación: acumulador de tiempo del scan (segundos)
        fSimTimeS : REAL;
        // Duración estimada de cada ciclo de scan (ajustar según la tarea)
        fCycleTimeS : REAL := 0.1;
        // Período por defecto de la senoide para cada instrumento
        fSimPeriodS : REAL := 30.0;
        fSimValue : REAL;
    END_VAR

    VAR_OUTPUT
        // Valor escalado a unidades de ingeniería por instrumento
        aValor AT %MD2500 : ARRAY[1..50] OF REAL; // HRF5000, HRF5002, HRF5004...

        // Salida agrupada del motor de ejemplo
        bMotorRun AT %Q0.0 : BOOL;
    END_VAR

    (* ============================================================
       1) Comando del motor (arranque/parada con enclavamiento)
       ============================================================ *)
    IF bMotorStop THEN
        bMotorRun := FALSE;
    ELSIF bMotorStart THEN
        bMotorRun := TRUE;
    END_IF;

    (* ============================================================
       2) Escalado y cálculo de alarmas para IA1..IA50
       ============================================================ *)

    // Acumulador global del tiempo simulado
    fSimTimeS := fSimTimeS + fCycleTimeS;

    FOR iIndex := 1 TO 50 DO

        // ---- Lectura de configuración del instrumento ----
        fRangoMin := aRangoMin[iIndex];
        fRangoMax := aRangoMax[iIndex];
        fIngMin := aIngenieriaMin[iIndex];
        fIngMax := aIngenieriaMax[iIndex];
        fDeadBand := aDeadBand[iIndex];

        // ---- Simulación de entrada cruda (sine oscilando en [RANGO_MIN, RANGO_MAX]) ----
        // El desfase 0.37 s * iIndex evita que todos los canales oscilen en sincronía.
        fSimValue := SimSine(fRangoMin, fRangoMax, fSimPeriodS, fSimTimeS, 0.37 * INT_TO_REAL(iIndex));
        aInputRaw[iIndex] := REAL_TO_INT(fSimValue);
        fInputRaw := fSimValue;

        // ---- Escalado lineal: scale(input, rMin, rMax, iMin, iMax) ----
        fSpan := fRangoMax - fRangoMin;
        IF fSpan <> 0.0 THEN
            fValor := fIngMin + ((fInputRaw - fRangoMin) * (fIngMax - fIngMin)) / fSpan;
        ELSE
            fValor := fIngMin;
        END_IF;

        aValor[iIndex] := fValor;

        // ---- Decodificar bits de habilitación de alarmas desde CONFIG ----
        bHabLoLo := (aConfig[iIndex] AND 1) <> 0; // Bit 1
        bHabLo := (aConfig[iIndex] AND 2) <> 0; // Bit 2
        bHabHi := (aConfig[iIndex] AND 4) <> 0; // Bit 3
        bHabHiHi := (aConfig[iIndex] AND 8) <> 0; // Bit 4

        // ---- Evaluación de alarmas con histéresis (dead band) ----
        // LOLO
        IF bHabLoLo THEN
            IF aAlarmaLoLoPrev[iIndex] THEN
                bAlarmaLoLo := fValor <= (aSetPointLL[iIndex] + fDeadBand);
            ELSE
                bAlarmaLoLo := fValor <= aSetPointLL[iIndex];
            END_IF;
        ELSE
            bAlarmaLoLo := FALSE;
        END_IF;

        // LO
        IF bHabLo THEN
            IF aAlarmaLoPrev[iIndex] THEN
                bAlarmaLo := fValor <= (aSetPointL[iIndex] + fDeadBand);
            ELSE
                bAlarmaLo := fValor <= aSetPointL[iIndex];
            END_IF;
        ELSE
            bAlarmaLo := FALSE;
        END_IF;

        // HI
        IF bHabHi THEN
            IF aAlarmaHiPrev[iIndex] THEN
                bAlarmaHi := fValor >= (aSetPointH[iIndex] - fDeadBand);
            ELSE
                bAlarmaHi := fValor >= aSetPointH[iIndex];
            END_IF;
        ELSE
            bAlarmaHi := FALSE;
        END_IF;

        // HIHI
        IF bHabHiHi THEN
            IF aAlarmaHiHiPrev[iIndex] THEN
                bAlarmaHiHi := fValor >= (aSetPointHH[iIndex] - fDeadBand);
            ELSE
                bAlarmaHiHi := fValor >= aSetPointHH[iIndex];
            END_IF;
        ELSE
            bAlarmaHiHi := FALSE;
        END_IF;

        // ---- Memorizar estado previo para la próxima evaluación ----
        aAlarmaLoLoPrev[iIndex] := bAlarmaLoLo;
        aAlarmaLoPrev[iIndex] := bAlarmaLo;
        aAlarmaHiPrev[iIndex] := bAlarmaHi;
        aAlarmaHiHiPrev[iIndex] := bAlarmaHiHi;

        // ---- Empaquetar bits en el registro ESTADO ----
        wEstado := 0;
        IF bAlarmaLoLo THEN wEstado := wEstado OR 1; END_IF; // bit 1
        IF bAlarmaLo THEN wEstado := wEstado OR 2; END_IF; // bit 2
        IF bAlarmaHi THEN wEstado := wEstado OR 4; END_IF; // bit 3
        IF bAlarmaHiHi THEN wEstado := wEstado OR 8; END_IF; // bit 4

        aEstado[iIndex] := wEstado;

    END_FOR;

END_PROGRAM
