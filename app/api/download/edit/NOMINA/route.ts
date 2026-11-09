// src/app/api/download/edit/NOMINA/route.ts
import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import path from "path";
import fs from "fs";
import { getConnection } from "@/lib/db";
import { validateAndRenewSession } from "@/lib/auth";
import { RowDataPacket } from "mysql2";
import type { PoolConnection } from "mysql2/promise";

const EXTRA_FACTOR = 1.5;
const START_ROW = 14;

const REGISTRO_START_ROW = 8;
const REGISTRO_FIXED_ROWS_BETWEEN = 2;

// --- CONCENTRADO ---
const CONCENTRADO_START_ROW = 9;
const CONCENTRADO_FIXED_ROWS = 4;
const CONCENTRADO_LAST_COL = 30;

const CONCENTRADO_TOTAL_HE_COL = 19;
const CONCENTRADO_TOTAL_HN_COL = 20;
const CONCENTRADO_EXTRA_COL = 21;
const CONCENTRADO_SALARY_DIV_COL = 22;
const CONCENTRADO_SALARY_DAY_COL = 24;
const CONCENTRADO_EXTRA_PAY_COL = 25;
const CONCENTRADO_REGISTRO_I_COL = 26;
const CONCENTRADO_TOTAL_PAY_COL = 30;

const CONCENTRADO_INFONAVIT_SALARY_COL = 19;
const CONCENTRADO_INFONAVIT_DISCOUNT_COL = 28;

const CONCENTRADO_GRAND_TOTAL_COL = 22;
const CONCENTRADO_GRAND_TOTAL_COL_END = 23;

// ★ NUEVO: columna AC (29) donde se escribirá el C26 del finiquito
const CONCENTRADO_FINIQUITO_TOTAL_COL = 29;

const CONCENTRADO_HN_DAY_COLS: { dayIndex: number; col: number }[] = [
  { dayIndex: 2, col: 7  },
  { dayIndex: 3, col: 9  },
  { dayIndex: 4, col: 11 },
  { dayIndex: 5, col: 13 },
  { dayIndex: 6, col: 15 },
  { dayIndex: 0, col: 17 },
];

const CONCENTRADO_HE_DAY_COLS: { dayIndex: number; col: number }[] = [
  { dayIndex: 1, col: 6  },
  { dayIndex: 2, col: 8  },
  { dayIndex: 3, col: 10 },
  { dayIndex: 4, col: 12 },
  { dayIndex: 5, col: 14 },
  { dayIndex: 6, col: 16 },
  { dayIndex: 0, col: 18 },
];

const CONCENTRADO_HN_FORMULA_LETTERS = ["E", "G", "K", "M", "O", "Q", "I"] as const;
const CONCENTRADO_HE_FORMULA_LETTERS = ["F", "H", "J", "L", "N", "P", "R"] as const;

const DAY_COLUMNS_REL: { dayIndex: number; hn: number; he: number }[] = [
  { dayIndex: 1, hn: 4,  he: 5  },
  { dayIndex: 2, hn: 6,  he: 7  },
  { dayIndex: 3, hn: 8,  he: 9  },
  { dayIndex: 4, hn: 10, he: 11 },
  { dayIndex: 5, hn: 12, he: 13 },
  { dayIndex: 6, hn: 14, he: 15 },
  { dayIndex: 0, hn: 16, he: 17 }
];

const DAY_BLOCK_OFFSET = 0;
const NIGHT_BLOCK_OFFSET = 22;

const REL_FIRST_DATA_COL = 1;
const REL_LAST_DATA_COL = 22;
const REL_TOTAL_HN_COL = 18;
const REL_TOTAL_HE_COL = 19;
const REL_TOPPED_HE_COL = 20;
const REL_EXCESS_HE_COL = 21;
const REL_VIATICOS_COL = 22;

const LAST_DATA_COL_ABS = NIGHT_BLOCK_OFFSET + REL_LAST_DATA_COL;
const MAX_EXTRA_HOURS = 9;

const NAME_FILL_COLOR = "FFD8E4BC";
const NAME_BORDER_COLOR = "FF000000";

const INFONAVIT_DISCOUNT_FILL_COLOR = "FFB1A0C7";
const LOAN_DISCOUNT_FILL_COLOR = "FFF4B183";

const HN_REL_LETTERS = ["D", "F", "H", "J", "L", "N", "P"] as const;
const HE_REL_LETTERS = ["E", "G", "I", "K", "M", "O", "Q"] as const;

const REGISTRO_LAST_COL = 17;

const MONTH_NAMES_ES = [
  "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
  "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"
];

// ------------------ INFONAVIT ------------------
const INFONAVIT_OFFSET_ROWS = 15;
const INFONAVIT_LABEL_COL = 2;
const INFONAVIT_NAME_COL = 3;
const INFONAVIT_NAME_COL_END = 6;
const INFONAVIT_AMOUNT_COL = 7;
const INFONAVIT_AMOUNT_COL_END = 9;
const INFONAVIT_TOTAL_COL = 10;
const INFONAVIT_TOTAL_COL_END = 13;

const INFONAVIT_DISCOUNT_LABEL_COL_START = 4;
const INFONAVIT_DISCOUNT_LABEL_COL_END = 22;

const INFONAVIT_HEADER_MERGES: Array<[number, number]> = [
  [3, 6], [7, 9], [10, 13], [14, 16], [17, 19], [20, 21], [22, 23],
];

const LISTING_ROW_MERGES: Array<[number, number]> = [
  [14, 16], [17, 19], [20, 21], [22, 23],
];

// ------------------ PRÉSTAMOS ------------------
const LOAN_LABEL_COL = 2;
const LOAN_NAME_COL = 3;
const LOAN_NAME_COL_END = 6;
const LOAN_AMOUNT_COL = 7;
const LOAN_AMOUNT_COL_END = 9;
const LOAN_WEEKLY_AMOUNT_COL = 10;
const LOAN_WEEKLY_AMOUNT_COL_END = 13;

const LOAN_CURRENT_DEBT_COL = 14;
const LOAN_CURRENT_DEBT_COL_END = 16;
const LOAN_PAID_AMOUNT_COL = 17;
const LOAN_PAID_AMOUNT_COL_END = 19;
const LOAN_TOTAL_AMOUNT_COL = 20;
const LOAN_TOTAL_AMOUNT_COL_END = 21;
const LOAN_PAYMENT_NUMBER_COL = 24;

// ------------------ RECIBOS ------------------
const RECIBO_FIRST_ROW = 1;
const RECIBO_LAST_ROW = 17;
const RECIBO_FIRST_COL = 1;   // A
const RECIBO_LAST_COL = 13;   // M
const RECIBO_HEIGHT = RECIBO_LAST_ROW - RECIBO_FIRST_ROW + 1; // 17 filas por recibo

const RECIBO_NOMBRE_START_COL = 4;   // D
const RECIBO_NOMBRE_END_COL = 6;     // F
const RECIBO_NOMBRE_ROW = 3;         // fila relativa dentro del bloque
const RECIBO_PERIODO_COL = 10;       // J
const RECIBO_PERIODO_ROW = 5;        // fila relativa dentro del bloque

// Celda donde se escribe el ID del recibo (B3 relativo al bloque)
const RECIBO_ID_ROW = 3;             // fila relativa 3 (B3)
const RECIBO_ID_COL = 2;             // columna relativa B = 2

// Celdas solicitadas previamente (posiciones relativas dentro del bloque A1:M17):
const RECIBO_PUESTO_ROW = 4;         // B4 → puesto del empleado
const RECIBO_PUESTO_COL = 2;         // columna B
const RECIBO_AREA_ROW = 5;           // B5 → área laboral
const RECIBO_AREA_COL = 2;           // columna B
const RECIBO_RFC_ROW = 3;            // H3 → RFC
const RECIBO_RFC_COL = 8;            // columna H
const RECIBO_NSS_ROW = 3;            // L3 → NSS
const RECIBO_NSS_COL = 12;           // columna L

// NUEVAS celdas solicitadas:
const RECIBO_SALARIO_DIARIO_ROW = 4; // E4 → salario diario (SalaryIMSS / 5)
const RECIBO_SALARIO_DIARIO_COL = 5; // columna E
const RECIBO_DIAS_TRABAJADOS_ROW = 5;// E5 → días trabajados
const RECIBO_DIAS_TRABAJADOS_COL = 5;// columna E
const RECIBO_SEMANA_ROW = 5;         // H5 → número de semana
const RECIBO_SEMANA_COL = 8;         // columna H
const RECIBO_HORAS_EXTRAS_ROW = 4;   // H4 → horas extras trabajadas
const RECIBO_HORAS_EXTRAS_COL = 8;   // columna H
const RECIBO_FECHA_INICIO_ROW = 4;   // M4 → fecha de inicio del CONTRATO
const RECIBO_FECHA_INICIO_COL = 13;  // columna M

// NUEVAS celdas solicitadas (A8 → periodo, A16 → nombre del trabajador)
const RECIBO_PERIODO_A8_ROW = 8;     // A8 → periodo
const RECIBO_PERIODO_A8_COL = 1;     // columna A
const RECIBO_NOMBRE_A16_ROW = 16;    // A16 → nombre del trabajador
const RECIBO_NOMBRE_A16_COL = 1;     // columna A

// NUEVA celda K10 → fórmula =E{filaAbs}*5/7*6 (fila absoluta del bloque)
const RECIBO_FORMULA_K10_ROW = 10;   // fila relativa 10
const RECIBO_FORMULA_K10_COL = 11;   // columna K = 11

// NUEVA celda K11 → fórmula =E{filaAbs}*5/7 (fila absoluta del bloque)
const RECIBO_FORMULA_K11_ROW = 11;   // fila relativa 11
const RECIBO_FORMULA_K11_COL = 11;   // columna K = 11

// NUEVA celda K12 → fórmula =CONCENTRADO!W{filaConcentrado}
const RECIBO_FORMULA_K12_ROW = 12;   // fila relativa 12
const RECIBO_FORMULA_K12_COL = 11;   // columna K = 11

// NUEVA celda K13 → fórmula =CONCENTRADO!AA{filaConcentrado}
const RECIBO_FORMULA_K13_ROW = 13;   // fila relativa 13
const RECIBO_FORMULA_K13_COL = 11;   // columna K = 11

// NUEVA celda K14 → fórmula ='HOJA_DE_REGISTRO'!I{filaRegistro}
const RECIBO_FORMULA_K14_ROW = 14;   // fila relativa 14
const RECIBO_FORMULA_K14_COL = 11;   // columna K = 11

// NUEVAS celdas M10, M11, M13 (fórmulas del recibo)
const RECIBO_FORMULA_M10_ROW = 10;   // fila relativa 10
const RECIBO_FORMULA_M10_COL = 13;   // columna M = 13
const RECIBO_FORMULA_M11_ROW = 11;   // fila relativa 11
const RECIBO_FORMULA_M11_COL = 13;   // columna M = 13
const RECIBO_FORMULA_M13_ROW = 13;   // fila relativa 13
const RECIBO_FORMULA_M13_COL = 13;   // columna M = 13

// NUEVAS celdas M12, M14, M15 → referencias a CONCENTRADO
const RECIBO_FORMULA_M12_ROW = 12;   // fila relativa 12
const RECIBO_FORMULA_M12_COL = 13;   // columna M = 13
const RECIBO_FORMULA_M14_ROW = 14;   // fila relativa 14
const RECIBO_FORMULA_M14_COL = 13;   // columna M = 13
const RECIBO_FORMULA_M15_ROW = 15;   // fila relativa 15
const RECIBO_FORMULA_M15_COL = 13;   // columna M = 13

// NUEVA celda M16 → suma M10+M11+M12+M13+M14+M15
const RECIBO_FORMULA_M16_ROW = 16;   // fila relativa 16
const RECIBO_FORMULA_M16_COL = 13;   // columna M = 13

// Merges extra que se agregan a CADA recibo (rangos relativos A1:M17)
const RECIBO_EXTRA_MERGES: string[] = [
  "A1:A2",
  "B1:C2",
  "B4:C4", 
  "B5:C5",
  "D1:F2",
  "G1:H2",
  "H3:I3",
  "L3:M3",
  "I1:J2",
  "K1:M2",
  "D3:F3",
  "G6:M6",
  "J5:M5",
  "A16:E16",
  "A17:E17",// Combina B1, C1, B2, C2 en un solo bloque en cada recibo
];

// Mapeo de datos dinámicos del recibo (fila relativa 1..17, columna 1..13).
const RECIBO_DYNAMIC_CELLS: Array<{ row: number; col: number; key: string }> = [
  // Ejemplos (descomenta y ajusta a tu plantilla):
  // { row: 6,  col: 2, key: "salaryIMSS" },
  // { row: 8,  col: 2, key: "diasTrabajados" },
  // { row: 8,  col: 5, key: "totalHN" },
  // { row: 8,  col: 8, key: "totalHE" },
  // { row: 10, col: 2, key: "sueldo" },
  // { row: 12, col: 2, key: "infonavit" },
  // { row: 12, col: 5, key: "prestamo" },
  // { row: 14, col: 2, key: "totalPagar" },
];

// ============================================================
// ------------------ FINIQUITOS ------------------------------
// Bloque de finiquito: filas 1 a 45, columnas A a F
// ============================================================
const FINIQUITO_FIRST_ROW = 1;
const FINIQUITO_LAST_ROW = 45;
const FINIQUITO_FIRST_COL = 1;   // A
const FINIQUITO_LAST_COL = 6;    // F
const FINIQUITO_HEIGHT = FINIQUITO_LAST_ROW - FINIQUITO_FIRST_ROW + 1; // 45 filas por finiquito

// Celdas conocidas dentro del bloque (posiciones relativas 1..45 filas / 1..6 cols)
const FINIQUITO_NOMBRE_ROW = 3;   // B3 → nombre del trabajador
const FINIQUITO_NOMBRE_COL = 2;   // columna B
const FINIQUITO_PUESTO_ROW = 4;   // B4 → puesto
const FINIQUITO_PUESTO_COL = 2;   // columna B

// Fórmulas fijas de cada finiquito (relativas al bloque):
//   B5 → =CONCENTRADO!Y{contratoVencerRow}   (fecha inicio contrato, listado contratos por vencer)
//   B6 → =CONCENTRADO!AB{contratoVencerRow}  (fecha fin contrato, listado contratos por vencer)
//   B7 → =B6-B5+1                            (días de contrato, relativa al bloque)
//   B8 → =CONCENTRADO!D{filaConc}            (salario IMSS, listado principal CONCENTRADO)
//   B9 → =B8/7                               (salario diario semanal)
//   B13 → =B7/365*15                         (prima vacacional por días)
//   B14 → =B7/365*12                         (vacaciones por días)
//   C13 → =B13*B9
//   C14 → =B14*B9
//   C15 → =(C14*25%)
//   C18 → =SUM(C13:C16)
//   C24 → =SUM(C21:C23)
//   C26 → =C18-C24
//   C29 → =C26
//   D31 → =B5
//   F31 → =B6
//   B38 → =F31                               (con formato de FECHA LARGA: "27 DE OCTUBRE DE 2026")
//   A43 → =B3
//   A30 → cantidad de C29 con letra en MAYÚSCULAS (se calcula en TypeScript, NO fórmula)
const FINIQUITO_FORMULA_FECHA_INICIO_ROW = 5;   // B5
const FINIQUITO_FORMULA_FECHA_INICIO_COL = 2;   // columna B
const FINIQUITO_FORMULA_FECHA_FIN_ROW = 6;      // B6
const FINIQUITO_FORMULA_FECHA_FIN_COL = 2;      // columna B
const FINIQUITO_FORMULA_DIAS_ROW = 7;           // B7
const FINIQUITO_FORMULA_DIAS_COL = 2;           // columna B
const FINIQUITO_FORMULA_SALARIO_ROW = 8;        // B8
const FINIQUITO_FORMULA_SALARIO_COL = 2;        // columna B
const FINIQUITO_FORMULA_SALARIO_DIA_ROW = 9;    // B9
const FINIQUITO_FORMULA_SALARIO_DIA_COL = 2;    // columna B

// Fórmulas con celdas relativas dentro del bloque (se ajustan por offset)
const FINIQUITO_FORMULA_B13_ROW = 13;
const FINIQUITO_FORMULA_B13_COL = 2;            // columna B
const FINIQUITO_FORMULA_B14_ROW = 14;
const FINIQUITO_FORMULA_B14_COL = 2;            // columna B

const FINIQUITO_FORMULA_C13_ROW = 13;
const FINIQUITO_FORMULA_C13_COL = 3;            // columna C
const FINIQUITO_FORMULA_C14_ROW = 14;
const FINIQUITO_FORMULA_C14_COL = 3;            // columna C
const FINIQUITO_FORMULA_C15_ROW = 15;
const FINIQUITO_FORMULA_C15_COL = 3;            // columna C
const FINIQUITO_FORMULA_C18_ROW = 18;
const FINIQUITO_FORMULA_C18_COL = 3;            // columna C
const FINIQUITO_FORMULA_C24_ROW = 24;
const FINIQUITO_FORMULA_C24_COL = 3;            // columna C
const FINIQUITO_FORMULA_C26_ROW = 26;
const FINIQUITO_FORMULA_C26_COL = 3;            // columna C
const FINIQUITO_FORMULA_C29_ROW = 29;
const FINIQUITO_FORMULA_C29_COL = 3;            // columna C

const FINIQUITO_FORMULA_D31_ROW = 31;
const FINIQUITO_FORMULA_D31_COL = 4;            // columna D
const FINIQUITO_FORMULA_F31_ROW = 31;
const FINIQUITO_FORMULA_F31_COL = 6;            // columna F
const FINIQUITO_FORMULA_B38_ROW = 38;
const FINIQUITO_FORMULA_B38_COL = 2;            // columna B
const FINIQUITO_FORMULA_A43_ROW = 43;
const FINIQUITO_FORMULA_A43_COL = 1;            // columna A

// NUEVA: A30 → cantidad de C29 con letra (calculada en TypeScript)
const FINIQUITO_LETRA_ROW = 30;
const FINIQUITO_LETRA_COL = 1;                  // columna A

// ============================================================
// Mapeo de datos dinámicos del finiquito (fila relativa 1..45, col 1..6).
// Las celdas con fórmulas fijas ya están cubiertas arriba.
// ============================================================
const FINIQUITO_DYNAMIC_CELLS: Array<{ row: number; col: number; key: string }> = [
  // Descomenta y ajusta según tu plantilla real:
  // { row: 10, col: 2, key: "salaryIMSS" },
  // { row: 12, col: 5, key: "totalPagar" },
];

// Merges extra que se aplican a CADA finiquito (rangos relativos A1:F45).
const FINIQUITO_EXTRA_MERGES: string[] = [
  // Ejemplo: "B3:F3", "B4:F4"
];

// ============================================================
// ---------- UTILIDADES NÚMERO → LETRAS (MXN) ----------------
// ============================================================
const UNIDADES_LETRAS = [
  "", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE",
  "DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISÉIS", "DIECISIETE",
  "DIECIOCHO", "DIECINUEVE", "VEINTE"
];

const DECENAS_LETRAS = [
  "", "", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA",
  "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"
];

const CENTENAS_LETRAS = [
  "", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS",
  "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"
];

function numeroALetrasUnidades(n: number): string {
  if (n < 0 || n > 999999999) return "";
  if (n === 0) return "CERO";
  if (n === 100) return "CIEN";
  if (n < 21) return UNIDADES_LETRAS[n];
  if (n < 30) {
    const u = n - 20;
    return u === 0 ? "VEINTE" : `VEINTI${UNIDADES_LETRAS[u].toLowerCase()}`;
  }
  if (n < 100) {
    const d = Math.floor(n / 10);
    const u = n % 10;
    return u === 0 ? DECENAS_LETRAS[d] : `${DECENAS_LETRAS[d]} Y ${UNIDADES_LETRAS[u]}`;
  }
  if (n < 1000) {
    const c = Math.floor(n / 100);
    const resto = n % 100;
    if (resto === 0) return CENTENAS_LETRAS[c];
    return `${CENTENAS_LETRAS[c]} ${numeroALetrasUnidades(resto)}`;
  }
  if (n < 1000000) {
    const miles = Math.floor(n / 1000);
    const resto = n % 1000;
    let milesTxt = "";
    if (miles === 1) milesTxt = "MIL";
    else milesTxt = `${numeroALetrasUnidades(miles)} MIL`;
    if (resto === 0) return milesTxt;
    return `${milesTxt} ${numeroALetrasUnidades(resto)}`;
  }
  const millones = Math.floor(n / 1000000);
  const resto = n % 1000000;
  let millonesTxt = "";
  if (millones === 1) millonesTxt = "UN MILLÓN";
  else millonesTxt = `${numeroALetrasUnidades(millones)} MILLONES`;
  if (resto === 0) return millonesTxt;
  return `${millonesTxt} ${numeroALetrasUnidades(resto)}`;
}

function montoALetrasMXN(monto: number): string {
  if (!isFinite(monto)) return "";
  const montoRedondeado = Math.round(monto * 100) / 100;
  const negativo = montoRedondeado < 0;
  const abs = Math.abs(montoRedondeado);
  const entero = Math.floor(abs);
  const centavos = Math.round((abs - entero) * 100);
  const enteroTxt = numeroALetrasUnidades(entero);
  const centavosTxt = String(centavos).padStart(2, "0");
  const resultado = `${enteroTxt} PESOS ${centavosTxt}/100 M.N.`;
  return negativo ? `MENOS ${resultado}` : resultado;
}

// ============================================================
// Interfaces del modelo genérico (sirve para RECIBOS y FINIQUITOS)
// ============================================================
interface ReciboModelCell {
  row: number;
  col: number;
  value: any;
  style: any;
  numFmt?: string;
}

interface ReciboModel {
  cells: ReciboModelCell[];
  merges: string[];
  rowHeights: Record<number, number | undefined>;
  colWidths: Record<number, any>;
}

function captureBlockModel(
  ws: ExcelJS.Worksheet,
  firstRow: number,
  lastRow: number,
  firstCol: number,
  lastCol: number
): ReciboModel {
  const cells: ReciboModelCell[] = [];
  const rowHeights: Record<number, number | undefined> = {};

  for (let r = firstRow; r <= lastRow; r++) {
    const row = ws.getRow(r);
    rowHeights[r] = row.height;
    for (let c = firstCol; c <= lastCol; c++) {
      const cell = row.getCell(c);
      const v = cell.value as any;
      let storedValue: any = v;
      if (v && typeof v === "object" && (v.formula || v.sharedFormula)) {
        storedValue = v.result !== undefined ? v.result : null;
      }
      cells.push({
        row: r,
        col: c,
        value: storedValue,
        style: JSON.parse(JSON.stringify(cell.style || {})),
        numFmt: cell.numFmt,
      });
    }
  }

  const merges: string[] = [];
  // @ts-ignore
  const rawMerges: Record<string, any> = (ws as any)._merges || {};
  for (const range of Object.keys(rawMerges)) {
    const match = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    if (!match) continue;
    const r1 = parseInt(match[2], 10);
    const r2 = parseInt(match[4], 10);
    if (r1 >= firstRow && r2 <= lastRow) {
      merges.push(range);
    }
  }

  const colWidths: Record<number, any> = {};
  for (let c = firstCol; c <= lastCol; c++) {
    colWidths[c] = (ws.getColumn(c) as any).width;
  }

  return { cells, merges, rowHeights, colWidths };
}

function shiftRangeToBlock(range: string, blockIndex: number, height: number): string {
  const match = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
  if (!match) return range;
  const [, c1, r1s, c2, r2s] = match;
  const r1 = parseInt(r1s, 10);
  const r2 = parseInt(r2s, 10);
  const offset = blockIndex * height;
  return `${c1}${r1 + offset}:${c2}${r2 + offset}`;
}

function pasteBlock(
  ws: ExcelJS.Worksheet,
  model: ReciboModel,
  blockIndex: number,
  height: number,
  overrides: Record<string, any>
) {
  const rowOffset = blockIndex * height;

  for (const cellModel of model.cells) {
    const absRow = cellModel.row + rowOffset;
    const cell = ws.getRow(absRow).getCell(cellModel.col);
    const key = `${cellModel.row}:${cellModel.col}`;
    if (key in overrides) {
      cell.value = overrides[key];
    } else {
      cell.value = cellModel.value;
    }
    cell.style = JSON.parse(JSON.stringify(cellModel.style || {}));
    if (cellModel.numFmt) cell.numFmt = cellModel.numFmt;
  }

  for (const rStr of Object.keys(model.rowHeights)) {
    const relRow = parseInt(rStr, 10);
    const h = model.rowHeights[relRow];
    if (h !== undefined) ws.getRow(relRow + rowOffset).height = h;
  }

  for (const relRange of model.merges) {
    const absRange = shiftRangeToBlock(relRange, blockIndex, height);
    try { ws.mergeCells(absRange); } catch {}
  }
}

function colLetter(col: number): string {
  let s = "";
  let n = col;
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function blockLetter(relLetter: string, blockOffset: number): string {
  const base = relLetter.charCodeAt(0) - 64;
  return colLetter(base + blockOffset);
}

function blockCol(relCol: number, blockOffset: number): number {
  return relCol + blockOffset;
}

function buildConcentradoTotalHEFormula(rowNumber: number): string {
  return CONCENTRADO_HN_FORMULA_LETTERS.map(letter => `${letter}${rowNumber}`).join("+");
}
function buildConcentradoTotalHNFormula(rowNumber: number): string {
  return CONCENTRADO_HE_FORMULA_LETTERS.map(letter => `${letter}${rowNumber}`).join("+");
}
function buildConcentradoExtraFormula(rowNumber: number): string { return `T${rowNumber}`; }
function buildConcentradoSalaryDivFormula(rowNumber: number): string { return `D${rowNumber}/5`; }
function buildConcentradoSalaryDayFormula(rowNumber: number): string { return `S${rowNumber}*V${rowNumber}`; }
function buildConcentradoExtraPayFormula(rowNumber: number): string { return `U${rowNumber}*W${rowNumber}`; }

function buildConcentradoRegistroFormula(registroRowNumber: number, concentradoRowNumber: number): string {
  return `'HOJA_DE_REGISTRO'!I${registroRowNumber}*S${concentradoRowNumber}/5`;
}

function buildConcentradoTotalPayFormula(rowNumber: number): string {
  return `X${rowNumber}+Y${rowNumber}+AA${rowNumber}-AB${rowNumber}+Z${rowNumber}+AC${rowNumber}`;
}

interface EntryRow extends RowDataPacket {
  PayrollPeriodID: number;
  WeekNumber: number;
  StartDate: string | Date;
  EndDate: string | Date;
  ProjectPersonnelID: number | null;
  AssignmentID: number | null;
  EmployeeID: number | null;
  FullName: string | null;
  Position: string | null;
  WorkDate: string | Date;
  Shift: "DIA" | "NOCHE";
  RegularHours: number | null;
  ExtraHours: number | null;
  DiasViaticos: number | null;
}

interface ProjectRow extends RowDataPacket {
  ProjectID: number;
  NameProject: string;
  ProjectAddress: string;
  OC: number | null;
  AdminProjectID: number | null;
  AreadeTrabajo: string | null;
  AdminName: string | null;
  ProjectManagerName: string | null;
  SiteManagerName: string | null;
}

interface PeriodRow extends RowDataPacket {
  PayrollPeriodID: number;
  WeekNumber: number;
  StartDate: string | Date;
  EndDate: string | Date;
}

interface ProjectWorkerRow extends RowDataPacket {
  ProjectPersonnelID: number;
  EmployeeID: number;
  FullName: string;
  Position: string | null;
  Residence: string | null;
  RFC: string | null;
  CURP: string | null;
  NSS: string | null;
  NCI: string | null;
  Phone: string | null;
  SalaryIMSS: number | null;
  ContractStartDate: string | Date | null;
  ContractEndDate: string | Date | null;
}

interface BaseWorkerRow extends RowDataPacket {
  AssignmentID: number;
  EmployeeID: number;
  FullName: string;
  Position: string | null;
  Residence: string | null;
  RFC: string | null;
  CURP: string | null;
  NSS: string | null;
  NCI: string | null;
  Phone: string | null;
  SalaryIMSS: number | null;
  AssignmentStartDate: string | Date | null;
  AssignmentEndDate: string | Date | null;
}

interface InfonavitRow extends RowDataPacket {
  EmployeeID: number;
  DailyAmount: number;
  FullName: string;
}

interface LoanPaymentExportRow extends RowDataPacket {
  PaymentID: number;
  LoansID: number;
  PaymentNumber: number;
  NumberOfPayments: number;
  Amount: number;
  LoanTotal: number;
  SaldoActual: number;
  Status: number;
  PaymentDate: string | Date | null;
  ProjectPersonnelID: number;
  EmployeeID: number;
  FullName: string;
}

interface BlockResult {
  firstEmployeeRow: number;
  lastEmployeeRow: number;
  nextRow: number;
}

interface ContractExpiringWorker {
  fullName: string;
  position: string;
  contractStartDate: number | null;
  contractEndDate: number | null;
  rfc: string;
  nss: string;
  salaryIMSS: number | null;
  salarioDiario: number | null;
  ownerKey: string;
  employeeId: number | null;
}

function ymdOf(value: string | Date | null | undefined): string {
  if (!value) return "";
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return "";
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return String(value).slice(0, 10);
}

function toExcelSerial(value: string | Date | null | undefined): number | null {
  const ymd = ymdOf(value);
  if (!ymd) return null;
  const [yy, mm, dd] = ymd.split("-").map(Number);
  if (!yy || !mm || !dd) return null;
  const utcDate = Date.UTC(yy, mm - 1, dd);
  const epoch = Date.UTC(1899, 11, 30);
  return Math.floor((utcDate - epoch) / 86400000);
}

function jsDayFromYmd(ymd: string): number {
  const [yy, mm, dd] = ymd.split("-").map(Number);
  return new Date(Date.UTC(yy, mm - 1, dd)).getUTCDay();
}

function daysBetween(start: string | Date | null | undefined, end: string | Date | null | undefined): number | null {
  const startYmd = ymdOf(start);
  const endYmd = ymdOf(end);
  if (!startYmd || !endYmd) return null;
  const [sy, sm, sd] = startYmd.split("-").map(Number);
  const [ey, em, ed] = endYmd.split("-").map(Number);
  if (!sy || !sm || !sd || !ey || !em || !ed) return null;
  const startUtc = Date.UTC(sy, sm - 1, sd);
  const endUtc = Date.UTC(ey, em - 1, ed);
  const diff = Math.floor((endUtc - startUtc) / 86400000) + 1;
  return diff >= 0 ? diff : null;
}

function formatFechaLargaEs(value: string | Date | null | undefined): string {
  const ymd = ymdOf(value);
  if (!ymd) return "";
  const [yy, mm, dd] = ymd.split("-").map(Number);
  if (!yy || !mm || !dd) return "";
  const monthName = MONTH_NAMES_ES[mm - 1] || "";
  return `${dd} DE ${monthName} DE ${yy}`;
}

function formatPeriodoEs(start: string | Date | null | undefined, end: string | Date | null | undefined): string {
  const startFmt = formatFechaLargaEs(start);
  const endFmt = formatFechaLargaEs(end);
  if (!startFmt && !endFmt) return "";
  if (!startFmt) return `AL ${endFmt}`;
  if (!endFmt) return `DEL ${startFmt}`;
  return `DEL ${startFmt} AL ${endFmt}`;
}

function clearSharedFormulasInRow(row: ExcelJS.Row, firstCol: number, lastCol: number) {
  for (let col = firstCol; col <= lastCol; col++) {
    const cell = row.getCell(col);
    const v = cell.value as any;
    if (v && typeof v === "object" && (v.formula || v.sharedFormula)) {
      cell.value = v.result !== undefined ? v.result : null;
    }
  }
}

function clearRowRange(ws: ExcelJS.Worksheet, rowNumber: number, firstCol: number, lastCol: number) {
  const row = ws.getRow(rowNumber);
  clearSharedFormulasInRow(row, firstCol, lastCol);
  for (let col = firstCol; col <= lastCol; col++) {
    const cell = row.getCell(col);
    cell.value = null;
    cell.style = {};
  }
  delete (row as any).height;
  row.commit();
}

function buildTotalHNFormula(rowNumber: number, blockOffset: number): string {
  return HN_REL_LETTERS.map(rel => `${blockLetter(rel, blockOffset)}${rowNumber}`).join("+");
}
function buildTotalHEFormula(rowNumber: number, blockOffset: number): string {
  return HE_REL_LETTERS.map(rel => `${blockLetter(rel, blockOffset)}${rowNumber}`).join("+");
}
function buildToppedHEFormula(rowNumber: number, blockOffset: number): string {
  const sLetter = colLetter(REL_TOTAL_HE_COL + blockOffset);
  return `IF(${sLetter}${rowNumber}>=${MAX_EXTRA_HOURS},${MAX_EXTRA_HOURS},${sLetter}${rowNumber})`;
}
function buildExcessHEFormula(rowNumber: number, blockOffset: number): string {
  const sLetter = colLetter(REL_TOTAL_HE_COL + blockOffset);
  const tLetter = colLetter(REL_TOPPED_HE_COL + blockOffset);
  return `${sLetter}${rowNumber}-${tLetter}${rowNumber}`;
}

function writeSignatureLine(ws: ExcelJS.Worksheet, rowNumber: number, startCol: number, endCol: number) {
  const row = ws.getRow(rowNumber);
  const startLetter = colLetter(startCol);
  const endLetter = colLetter(endCol);
  clearSharedFormulasInRow(row, startCol, endCol);
  if (endCol > startCol) {
    try { ws.mergeCells(`${startLetter}${rowNumber}:${endLetter}${rowNumber}`); } catch {}
  }
  for (let col = startCol; col <= endCol; col++) {
    const cell = row.getCell(col);
    const existing = cell.style || {};
    cell.style = {
      ...existing,
      border: { ...(existing.border || {}), bottom: { style: "thin", color: { argb: NAME_BORDER_COLOR } } }
    };
  }
  row.commit();
}

function writeSignatureName(ws: ExcelJS.Worksheet, rowNumber: number, startCol: number, endCol: number, name: string) {
  const row = ws.getRow(rowNumber);
  const startLetter = colLetter(startCol);
  const endLetter = colLetter(endCol);
  clearSharedFormulasInRow(row, startCol, endCol);
  if (endCol > startCol) {
    try { ws.mergeCells(`${startLetter}${rowNumber}:${endLetter}${rowNumber}`); } catch {}
  }
  const masterCell = row.getCell(startCol);
  masterCell.value = name;
  masterCell.style = {
    font: { bold: false },
    alignment: { horizontal: "center", vertical: "middle" },
    fill: { type: "pattern", pattern: "solid", fgColor: { argb: NAME_FILL_COLOR } }
  };
  row.commit();
}

function writeSignatureHeader(ws: ExcelJS.Worksheet, rowNumber: number, startCol: number, endCol: number, label: string) {
  const row = ws.getRow(rowNumber);
  const startLetter = colLetter(startCol);
  const endLetter = colLetter(endCol);
  clearSharedFormulasInRow(row, startCol, endCol);
  const masterCell = row.getCell(startCol);
  masterCell.value = label;
  const signatureStyle = {
    font: { bold: true },
    alignment: { horizontal: "center" as const, vertical: "middle" as const }
  };
  masterCell.style = { ...(masterCell.style || {}), ...signatureStyle };
  if (endCol > startCol) {
    try { ws.mergeCells(`${startLetter}${rowNumber}:${endLetter}${rowNumber}`); } catch {}
  }
  row.commit();
}

function copyRowStyle(ws: ExcelJS.Worksheet, sourceRowNumber: number, destRowNumber: number, lastCol: number) {
  const srcRow = ws.getRow(sourceRowNumber);
  const dstRow = ws.getRow(destRowNumber);
  dstRow.height = srcRow.height;
  for (let col = 1; col <= lastCol; col++) {
    const srcCell = srcRow.getCell(col);
    const dstCell = dstRow.getCell(col);
    dstCell.style = JSON.parse(JSON.stringify(srcCell.style || {}));
    if (srcCell.numFmt) dstCell.numFmt = srcCell.numFmt;
  }
  dstRow.commit();
  // @ts-ignore
  const merges: Record<string, any> = (ws as any)._merges || {};
  for (const range of Object.keys(merges)) {
    const match = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    if (!match) continue;
    const [, c1, r1s, c2, r2s] = match;
    const r1 = parseInt(r1s, 10);
    if (r1 !== sourceRowNumber) continue;
    let c1Num = 0;
    for (let i = 0; i < c1.length; i++) c1Num = c1Num * 26 + (c1.charCodeAt(i) - 64);
    if (c1Num > lastCol) continue;
    const r2 = parseInt(r2s, 10);
    const rowOffset = destRowNumber - sourceRowNumber;
    const newRange = `${c1}${r1 + rowOffset}:${c2}${r2 + rowOffset}`;
    try { ws.mergeCells(newRange); } catch {}
  }
}

function shiftRowsDown(ws: ExcelJS.Worksheet, insertAtRow: number, rowsToInsert: number) {
  if (rowsToInsert <= 0) return;
  const maxCol = Math.max(ws.columnCount || 0, 30);
  const lastRow = Math.max(ws.rowCount, insertAtRow);
  for (let rn = lastRow; rn >= insertAtRow; rn--) {
    const srcRow = ws.getRow(rn);
    const dstRow = ws.getRow(rn + rowsToInsert);
    dstRow.height = srcRow.height;
    for (let col = 1; col <= maxCol; col++) {
      const srcCell = srcRow.getCell(col);
      const dstCell = dstRow.getCell(col);
      const v = srcCell.value as any;
      if (v && typeof v === "object") dstCell.value = JSON.parse(JSON.stringify(v));
      else dstCell.value = v;
      dstCell.style = JSON.parse(JSON.stringify(srcCell.style || {}));
      if (srcCell.numFmt) dstCell.numFmt = srcCell.numFmt;
    }
    dstRow.commit();
  }
  // @ts-ignore
  const merges: Record<string, any> = (ws as any)._merges || {};
  const rangesToMove: string[] = [];
  for (const range of Object.keys(merges)) {
    const match = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    if (!match) continue;
    const startRowNum = parseInt(match[2], 10);
    if (startRowNum >= insertAtRow) rangesToMove.push(range);
  }
  for (const range of rangesToMove) {
    const match = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
    if (!match) continue;
    const [, c1, r1s, c2, r2s] = match;
    const r1 = parseInt(r1s, 10);
    const r2 = parseInt(r2s, 10);
    try { ws.unMergeCells(range); } catch {}
    const newRange = `${c1}${r1 + rowsToInsert}:${c2}${r2 + rowsToInsert}`;
    try { ws.mergeCells(newRange); } catch {}
  }
  for (let rn = insertAtRow; rn < insertAtRow + rowsToInsert; rn++) {
    const row = ws.getRow(rn);
    for (let col = 1; col <= maxCol; col++) {
      const cell = row.getCell(col);
      cell.value = null;
      cell.style = {};
    }
    delete (row as any).height;
    row.commit();
  }
}

function applyListingRowMerges(
  ws: ExcelJS.Worksheet,
  startRow: number,
  endRow: number,
  merges: Array<[number, number]>
) {
  for (let rn = startRow; rn <= endRow; rn++) {
    const row = ws.getRow(rn);
    for (const [startCol, endCol] of merges) {
      const rangeStr = `${colLetter(startCol)}${rn}:${colLetter(endCol)}${rn}`;
      if (endCol > startCol) {
        try { ws.mergeCells(rangeStr); } catch {}
      }
      const masterCell = row.getCell(startCol);
      masterCell.alignment = {
        ...(masterCell.alignment || {}),
        horizontal: "center",
        vertical: "middle",
        wrapText: true
      };
    }
    row.commit();
  }
}

function addLoanAmountToConcentradoAB(
  ws: ExcelJS.Worksheet,
  employeeRow: number,
  loanAmount: number
) {
  if (employeeRow <= 0 || !isFinite(loanAmount) || loanAmount === 0) return;
  const row = ws.getRow(employeeRow);
  const abCell = row.getCell(CONCENTRADO_INFONAVIT_DISCOUNT_COL);
  const currentValueRaw = abCell.value;
  let currentValue = 0;
  if (typeof currentValueRaw === "number") {
    currentValue = currentValueRaw;
  } else if (currentValueRaw !== null && currentValueRaw !== undefined) {
    const parsed = Number(currentValueRaw);
    if (!isNaN(parsed)) currentValue = parsed;
  }
  abCell.value = currentValue + Number(loanAmount);
  abCell.numFmt = '"$"#,##0.00';
  row.commit();
}

function mergeAndCenterRow(
  ws: ExcelJS.Worksheet,
  rowNumber: number,
  startCol: number,
  endCol: number
) {
  if (endCol <= startCol) return;
  const startLetter = colLetter(startCol);
  const endLetter = colLetter(endCol);
  const rangeStr = `${startLetter}${rowNumber}:${endLetter}${rowNumber}`;
  try { ws.mergeCells(rangeStr); } catch {}
  const masterCell = ws.getRow(rowNumber).getCell(startCol);
  masterCell.alignment = {
    ...(masterCell.alignment || {}),
    horizontal: "center",
    vertical: "middle",
    wrapText: true
  };
  ws.getRow(rowNumber).commit();
}

// ============================================================
// Handler principal
// ============================================================
export async function GET(request: NextRequest) {
  let connection: PoolConnection | undefined;
  try {
    const sessionId = request.cookies.get("session")?.value;
    if (!sessionId) return NextResponse.json({ success: false, message: "NO AUTORIZADO" }, { status: 401 });
    const user = await validateAndRenewSession(sessionId);
    if (!user) return NextResponse.json({ success: false, message: "SESIÓN INVÁLIDA O EXPIRADA" }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const periodId = searchParams.get("periodId");

    if (!projectId) return NextResponse.json({ success: false, message: "Se requiere el ID del proyecto" }, { status: 400 });

    connection = (await getConnection()) as PoolConnection;

    const [projects] = await connection.execute<ProjectRow[]>(
      `SELECT
         p.ProjectID, p.NameProject, p.ProjectAddress, p.OC, p.AdminProjectID, p.AreadeTrabajo,
         COALESCE(
           (SELECT CONCAT_WS(' ', bp.FirstName, bp.LastName, NULLIF(bp.MiddleName, ''))
              FROM basepersonnel bp INNER JOIN employees e ON e.EmployeeID = bp.EmployeeID
             WHERE e.EmployeeID = p.AdminProjectID LIMIT 1),
           (SELECT CONCAT_WS(' ', pp.FirstName, pp.LastName, NULLIF(pp.MiddleName, ''))
              FROM projectpersonnel pp INNER JOIN employees e ON e.EmployeeID = pp.EmployeeID
             WHERE e.EmployeeID = p.AdminProjectID LIMIT 1)
         ) AS AdminName,
         (SELECT epm.NameProjectManager FROM externalprojectmanager epm
           WHERE epm.ExternalProjectManagerID = p.ExternalProjectManagerID LIMIT 1) AS ProjectManagerName,
         COALESCE(
           (SELECT CONCAT_WS(' ', bp.FirstName, bp.LastName, NULLIF(bp.MiddleName, ''))
              FROM systemusers su
              INNER JOIN employees e ON e.EmployeeID = su.EmployeeID
              INNER JOIN basepersonnel bp ON bp.EmployeeID = e.EmployeeID
             WHERE su.SystemUserID = p.CreatedBy LIMIT 1),
           (SELECT CONCAT_WS(' ', pp.FirstName, pp.LastName, NULLIF(pp.MiddleName, ''))
              FROM systemusers su
              INNER JOIN employees e ON e.EmployeeID = su.EmployeeID
              INNER JOIN projectpersonnel pp ON pp.EmployeeID = e.EmployeeID
             WHERE su.SystemUserID = p.CreatedBy LIMIT 1)
         ) AS SiteManagerName
       FROM projects p WHERE p.ProjectID = ? LIMIT 1;`,
      [projectId]
    );
    if (projects.length === 0) return NextResponse.json({ success: false, message: "Proyecto no encontrado" }, { status: 404 });

    const projectName = projects[0].NameProject || "SIN NOMBRE";
    const projectAddress = projects[0].ProjectAddress || "SIN DIRECCIÓN";
    const projectOC = projects[0].OC;
    const projectAreaDeTrabajo = (projects[0].AreadeTrabajo || "").trim();
    const adminName = (projects[0].AdminName || "").trim() || "SIN ADMINISTRADOR";
    const projectManagerName = (projects[0].ProjectManagerName || "").trim() || "SIN PROJECT MANAGER";
    const siteManagerName = (projects[0].SiteManagerName || "").trim() || "SIN SITE MANAGER";

    const [projectWorkers] = await connection.execute<ProjectWorkerRow[]>(
      `SELECT pp.ProjectPersonnelID, pp.EmployeeID,
              CONCAT_WS(' ', pp.FirstName, pp.LastName, NULLIF(pp.MiddleName, '')) AS FullName,
              pc.Position AS Position, pc.Residence AS Residence,
              ppi.RFC AS RFC, ppi.CURP AS CURP, ppi.NSS AS NSS, ppi.NCI AS NCI, ppi.Phone AS Phone,
              pc.SalaryIMSS AS SalaryIMSS, pc.StartDate AS ContractStartDate, pc.EndDate AS ContractEndDate
       FROM projectcontracts pc
       INNER JOIN projectpersonnel pp ON pp.ProjectPersonnelID = pc.ProjectPersonnelID
       INNER JOIN employees e ON e.EmployeeID = pp.EmployeeID
       LEFT JOIN projectpersonnelpersonalinfo ppi ON ppi.ProjectPersonnelID = pp.ProjectPersonnelID
       WHERE pc.ProjectID = ? AND e.Status = 1
         AND pc.ContractID = (SELECT MAX(pc2.ContractID) FROM projectcontracts pc2
                              WHERE pc2.ProjectPersonnelID = pc.ProjectPersonnelID AND pc2.ProjectID = pc.ProjectID)
       ORDER BY pp.FirstName ASC, pp.LastName ASC, pp.MiddleName ASC;`,
      [projectId]
    );

    const [baseWorkers] = await connection.execute<BaseWorkerRow[]>(
      `SELECT ppa.AssignmentID, ppa.EmployeeID,
              CONCAT_WS(' ', bp.FirstName, bp.LastName, NULLIF(bp.MiddleName, '')) AS FullName,
              ppa.Position AS Position, ppa.Residence AS Residence,
              bpi.RFC AS RFC, bpi.CURP AS CURP, bpi.NSS AS NSS, bpi.NCI AS NCI, bpi.Phone AS Phone,
              bc.SalaryIMSS AS SalaryIMSS, ppa.StartDate AS AssignmentStartDate, ppa.EndDate AS AssignmentEndDate
       FROM projectpersonnelassignment ppa
       INNER JOIN employees e ON e.EmployeeID = ppa.EmployeeID
       INNER JOIN basepersonnel bp ON bp.EmployeeID = e.EmployeeID
       LEFT JOIN basepersonnelpersonalinfo bpi ON bpi.BasePersonnelID = bp.BasePersonnelID
       LEFT JOIN basecontracts bc ON bc.BasePersonnelID = bp.BasePersonnelID
        AND bc.ContractID = (SELECT MAX(bc2.ContractID) FROM basecontracts bc2 WHERE bc2.BasePersonnelID = bp.BasePersonnelID)
       WHERE ppa.ProjectID = ? AND ppa.Status = 1 AND e.Status = 1
       ORDER BY bp.FirstName ASC, bp.LastName ASC, bp.MiddleName ASC;`,
      [projectId]
    );

    const [infonavitRows] = await connection.execute<InfonavitRow[]>(
      `SELECT
         ei.EmployeeID,
         ei.DailyAmount,
         COALESCE(
           CONCAT(pp.FirstName, ' ', pp.LastName, ' ', IFNULL(pp.MiddleName,'')),
           CONCAT(bp.FirstName, ' ', bp.LastName, ' ', IFNULL(bp.MiddleName,''))
         ) AS FullName
       FROM employee_infonavit ei
       INNER JOIN employees e ON e.EmployeeID = ei.EmployeeID
       LEFT JOIN projectpersonnel pp ON pp.EmployeeID = e.EmployeeID
       LEFT JOIN basepersonnel bp ON bp.EmployeeID = e.EmployeeID
       WHERE ei.EmployeeID IN (
         SELECT pp2.EmployeeID FROM projectpersonnel pp2
         INNER JOIN projectcontracts pc ON pc.ProjectPersonnelID = pp2.ProjectPersonnelID
         WHERE pc.ProjectID = ?
         UNION
         SELECT ppa.EmployeeID FROM projectpersonnelassignment ppa
         WHERE ppa.ProjectID = ? AND ppa.Status = 1
       )
       ORDER BY FullName ASC`,
      [projectId, projectId]
    );

    let loanPaymentRows: LoanPaymentExportRow[] = [];
    if (periodId) {
      const [loanRows] = await connection.execute<LoanPaymentExportRow[]>(
        `SELECT
           lp.PaymentID,
           lp.LoansID,
           lp.PaymentNumber,
           l.NumberOfPayments,
           lp.Amount,
           l.Total AS LoanTotal,
           (l.Total - COALESCE((
             SELECT SUM(lp2.Amount)
             FROM loan_payments lp2
             WHERE lp2.LoansID = l.LoansID AND lp2.Status = 1
           ), 0)) AS SaldoActual,
           lp.Status,
           lp.PaymentDate,
           l.ProjectPersonnelID,
           pp.EmployeeID,
           CONCAT_WS(' ', pp.FirstName, pp.LastName, NULLIF(pp.MiddleName, '')) AS FullName
         FROM loan_payments lp
         INNER JOIN loans l ON l.LoansID = lp.LoansID
         INNER JOIN projectpersonnel pp ON pp.ProjectPersonnelID = l.ProjectPersonnelID
         WHERE lp.PayrollPeriodID = ?
           AND l.ProjectID = ?
         ORDER BY pp.FirstName ASC, pp.LastName ASC, lp.PaymentNumber ASC`,
        [periodId, projectId]
      );
      loanPaymentRows = loanRows;
    }

    const params: any[] = [projectId];
    let periodFilter = "";
    if (periodId) {
      periodFilter = " AND pp.PayrollPeriodID = ? ";
      params.push(periodId);
    }

    const [rows] = await connection.execute<EntryRow[]>(
      `SELECT pp.PayrollPeriodID, pp.WeekNumber, pp.StartDate, pp.EndDate,
              pe.ProjectPersonnelID, pe.AssignmentID,
              COALESCE(ppl.EmployeeID, ppa.EmployeeID) AS EmployeeID,
              COALESCE(
                CONCAT(ppl.FirstName, ' ', ppl.LastName, ' ', IFNULL(ppl.MiddleName,'')),
                CONCAT(bp.FirstName, ' ', bp.LastName, ' ', IFNULL(bp.MiddleName,''))
              ) AS FullName,
              COALESCE(pc.Position, ppa.Position) AS Position,
              pe.WorkDate, pe.Shift, pe.RegularHours, pe.ExtraHours,
              COALESCE(pv.DiasViaticos, pva.DiasViaticos, 0) AS DiasViaticos
       FROM payroll_periods pp
       INNER JOIN payroll_entries pe ON pe.PayrollPeriodID = pp.PayrollPeriodID
       LEFT JOIN projectpersonnel ppl ON ppl.ProjectPersonnelID = pe.ProjectPersonnelID
       LEFT JOIN projectcontracts pc ON pc.ProjectPersonnelID = pe.ProjectPersonnelID
        AND pc.ProjectID = pp.ProjectID
        AND pc.ContractID = (SELECT MAX(pc2.ContractID) FROM projectcontracts pc2
                             WHERE pc2.ProjectPersonnelID = pe.ProjectPersonnelID AND pc2.ProjectID = pp.ProjectID)
       LEFT JOIN projectpersonnelassignment ppa ON ppa.AssignmentID = pe.AssignmentID
       LEFT JOIN employees e ON e.EmployeeID = COALESCE(ppl.EmployeeID, ppa.EmployeeID)
       LEFT JOIN basepersonnel bp ON bp.EmployeeID = e.EmployeeID
       LEFT JOIN payroll_employee_viaticos pv ON pv.PayrollPeriodID = pp.PayrollPeriodID AND pv.ProjectPersonnelID = pe.ProjectPersonnelID
       LEFT JOIN payroll_employee_viaticos pva ON pva.PayrollPeriodID = pp.PayrollPeriodID AND pva.AssignmentID = pe.AssignmentID
       WHERE pp.ProjectID = ? ${periodFilter}
       ORDER BY pp.StartDate ASC, COALESCE(ppl.FirstName, bp.FirstName) ASC, pe.WorkDate ASC, pe.Shift ASC;`,
      params
    );

    if (rows.length === 0 && projectWorkers.length === 0 && baseWorkers.length === 0) {
      return NextResponse.json({ success: false, message: "No hay datos de nómina ni personal de proyecto para exportar" }, { status: 404 });
    }

    let weekNumberValue: number | string = "";
    let startDateValue: string | Date = "";
    let endDateValue: string | Date = "";

    if (periodId) {
      const [weekRows] = await connection.execute<PeriodRow[]>(
        `SELECT PayrollPeriodID, WeekNumber, StartDate, EndDate FROM payroll_periods WHERE PayrollPeriodID = ? LIMIT 1`,
        [periodId]
      );
      if (weekRows.length > 0) {
        weekNumberValue = weekRows[0].WeekNumber;
        startDateValue = weekRows[0].StartDate;
        endDateValue = weekRows[0].EndDate;
      } else if (rows.length > 0) {
        weekNumberValue = rows[0].WeekNumber;
        startDateValue = rows[0].StartDate;
        endDateValue = rows[0].EndDate;
      }
    } else {
      weekNumberValue = "";
      startDateValue = rows.length > 0 ? rows[0].StartDate : "";
      endDateValue = rows.length > 0 ? rows[0].EndDate : "";
    }

    const presentProjectPersonnelIds = new Set<number>();
    const presentAssignmentIds = new Set<number>();
    const presentEmployeeIds = new Set<number>();

    const dayWorkedProject = new Map<number, Set<number>>();
    const dayWorkedAssignment = new Map<number, Set<number>>();
    const dayWorkedEmployee = new Map<number, Set<number>>();

    const extraHoursEmployee = new Map<number, Record<number, number>>();
    const extraHoursProject = new Map<number, Record<number, number>>();
    const extraHoursAssignment = new Map<number, Record<number, number>>();

    const regularHoursEmployee = new Map<number, number>();
    const extraHoursTotalEmployee = new Map<number, number>();

    for (const r of rows) {
      const workYmd = ymdOf(r.WorkDate);
      const dayIdx = workYmd ? jsDayFromYmd(workYmd) : null;
      const extraH = Number(r.ExtraHours) || 0;
      const regH = Number(r.RegularHours) || 0;

      if (r.ProjectPersonnelID !== null && r.ProjectPersonnelID !== undefined) {
        presentProjectPersonnelIds.add(r.ProjectPersonnelID);
        if (dayIdx !== null) {
          let s = dayWorkedProject.get(r.ProjectPersonnelID);
          if (!s) { s = new Set<number>(); dayWorkedProject.set(r.ProjectPersonnelID, s); }
          s.add(dayIdx);
          let eh = extraHoursProject.get(r.ProjectPersonnelID);
          if (!eh) { eh = {}; extraHoursProject.set(r.ProjectPersonnelID, eh); }
          eh[dayIdx] = (eh[dayIdx] || 0) + extraH;
        }
      }
      if (r.AssignmentID !== null && r.AssignmentID !== undefined) {
        presentAssignmentIds.add(r.AssignmentID);
        if (dayIdx !== null) {
          let s = dayWorkedAssignment.get(r.AssignmentID);
          if (!s) { s = new Set<number>(); dayWorkedAssignment.set(r.AssignmentID, s); }
          s.add(dayIdx);
          let eh = extraHoursAssignment.get(r.AssignmentID);
          if (!eh) { eh = {}; extraHoursAssignment.set(r.AssignmentID, eh); }
          eh[dayIdx] = (eh[dayIdx] || 0) + extraH;
        }
      }
      if (r.EmployeeID !== null && r.EmployeeID !== undefined && dayIdx !== null) {
        presentEmployeeIds.add(r.EmployeeID);
        let s = dayWorkedEmployee.get(r.EmployeeID);
        if (!s) { s = new Set<number>(); dayWorkedEmployee.set(r.EmployeeID, s); }
        s.add(dayIdx);
        let eh = extraHoursEmployee.get(r.EmployeeID);
        if (!eh) { eh = {}; extraHoursEmployee.set(r.EmployeeID, eh); }
        eh[dayIdx] = (eh[dayIdx] || 0) + extraH;
        regularHoursEmployee.set(r.EmployeeID, (regularHoursEmployee.get(r.EmployeeID) || 0) + regH);
        extraHoursTotalEmployee.set(r.EmployeeID, (extraHoursTotalEmployee.get(r.EmployeeID) || 0) + extraH);
      }
    }

    const templatePath = path.join(process.cwd(), "public", "project-manager-dashboard", "NOMINA.xlsx");
    if (!fs.existsSync(templatePath)) return NextResponse.json({ success: false, message: "Plantilla NOMINA no encontrada" }, { status: 500 });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);

    const wsMaybe = workbook.getWorksheet("REPORTE_PERSONAL");
    if (!wsMaybe) return NextResponse.json({ success: false, message: "No se encontró la hoja REPORTE_PERSONAL en la plantilla" }, { status: 500 });
    const ws: ExcelJS.Worksheet = wsMaybe;

    const wsListaAsistencia = workbook.getWorksheet("LISTA_DE_ASISTENCIA");
    if (wsListaAsistencia) {
      wsListaAsistencia.getCell("F1").value = projectName;
      wsListaAsistencia.getCell("P1").value = projectName;
      wsListaAsistencia.getCell("I4").value = projectAddress;
      wsListaAsistencia.getCell("S4").value = projectAddress;
    }

    const wsRecibos = workbook.getWorksheet("RECIBOS");
    let reciboModel: ReciboModel | null = null;
    if (wsRecibos) {
      reciboModel = captureBlockModel(wsRecibos, RECIBO_FIRST_ROW, RECIBO_LAST_ROW, RECIBO_FIRST_COL, RECIBO_LAST_COL);
    }

    const wsFiniquitos = workbook.getWorksheet("FINIQUITOS");
    let finiquitoModel: ReciboModel | null = null;
    if (wsFiniquitos) {
      finiquitoModel = captureBlockModel(wsFiniquitos, FINIQUITO_FIRST_ROW, FINIQUITO_LAST_ROW, FINIQUITO_FIRST_COL, FINIQUITO_LAST_COL);
    }

    const wsRegistro = workbook.getWorksheet("HOJA_DE_REGISTRO");
    const registroRowByOwner = new Map<string, number>();

    if (wsRegistro) {
      wsRegistro.getCell("D3").value = projectName;
      wsRegistro.getCell("I3").value = projectAddress;

      interface RegistroWorker {
        fullName: string; position: string; residence: string; rfc: string; curp: string;
        nss: string; nci: string; phone: string; salaryIMSS: number | null;
        contractStartDate: number | null; contractDurationDays: number | null;
      }
      const uniqueWorkers = new Map<number, RegistroWorker>();
      for (const w of projectWorkers) {
        if (!uniqueWorkers.has(w.ProjectPersonnelID)) {
          uniqueWorkers.set(w.ProjectPersonnelID, {
            fullName: w.FullName || "NO DISPONIBLE",
            position: (w.Position || "").trim(),
            residence: (w.Residence || "").trim(),
            rfc: (w.RFC || "").trim(),
            curp: (w.CURP || "").trim(),
            nss: (w.NSS || "").trim(),
            nci: (w.NCI || "").trim(),
            phone: (w.Phone || "").trim(),
            salaryIMSS: w.SalaryIMSS !== null && w.SalaryIMSS !== undefined ? Number(w.SalaryIMSS) : null,
            contractStartDate: toExcelSerial(w.ContractStartDate),
            contractDurationDays: daysBetween(w.ContractStartDate, w.ContractEndDate),
          });
        }
      }
      const workerList = Array.from(uniqueWorkers.values());

      interface BaseRegistroWorker {
        fullName: string; position: string; residence: string; rfc: string; curp: string;
        nss: string; nci: string; phone: string; salaryIMSS: number | null;
        assignmentStartDate: number | null; assignmentDurationDays: number | null;
      }
      const baseWorkerList: BaseRegistroWorker[] = baseWorkers.map(b => ({
        fullName: (b.FullName || "NO DISPONIBLE").trim(),
        position: (b.Position || "").trim(),
        residence: (b.Residence || "").trim(),
        rfc: (b.RFC || "").trim(),
        curp: (b.CURP || "").trim(),
        nss: (b.NSS || "").trim(),
        nci: (b.NCI || "").trim(),
        phone: (b.Phone || "").trim(),
        salaryIMSS: b.SalaryIMSS !== null && b.SalaryIMSS !== undefined ? Number(b.SalaryIMSS) : null,
        assignmentStartDate: toExcelSerial(b.AssignmentStartDate),
        assignmentDurationDays: daysBetween(b.AssignmentStartDate, b.AssignmentEndDate),
      }));

      const totalProjectRows = workerList.length;
      const totalBaseRows = baseWorkerList.length;

      if (totalProjectRows > 0 || totalBaseRows > 0) {
        if (totalProjectRows > 0) shiftRowsDown(wsRegistro, REGISTRO_START_ROW + 1, totalProjectRows);
        if (totalBaseRows > 0) shiftRowsDown(wsRegistro, REGISTRO_START_ROW + 1 + REGISTRO_FIXED_ROWS_BETWEEN + totalProjectRows, totalBaseRows);

        const projectPpIds = Array.from(uniqueWorkers.keys());
        for (let i = 0; i < totalProjectRows; i++) {
          const rn = REGISTRO_START_ROW + i;
          const row = wsRegistro.getRow(rn);
          copyRowStyle(wsRegistro, REGISTRO_START_ROW, rn, REGISTRO_LAST_COL);
          const worker = workerList[i];
          const ppid = projectPpIds[i];
          registroRowByOwner.set(`PP:${ppid}`, rn);
          row.getCell(1).value = i + 1;
          row.getCell(2).value = worker.fullName;
          row.getCell(3).value = worker.position;
          row.getCell(4).value = worker.residence;
          row.getCell(5).value = worker.rfc;
          row.getCell(6).value = worker.curp;
          row.getCell(7).value = worker.nss;
          if (worker.contractStartDate !== null) {
            row.getCell(8).value = worker.contractStartDate;
            row.getCell(8).numFmt = "dd/mm/yyyy";
          } else row.getCell(8).value = "";
          row.getCell(9).value = { formula: `Q${rn}-N${rn}` } as any;
          row.getCell(10).value = projectAreaDeTrabajo;
          row.getCell(11).value = worker.nci;
          row.getCell(13).value = worker.phone;
          if (worker.salaryIMSS !== null) {
            row.getCell(14).value = worker.salaryIMSS;
            row.getCell(14).numFmt = '"$"#,##0.00';
          } else row.getCell(14).value = "";
          if (worker.contractDurationDays !== null) row.getCell(16).value = `${worker.contractDurationDays} DÍAS`;
          else row.getCell(16).value = "";
          row.commit();
        }

        const baseStart = REGISTRO_START_ROW + 1 + REGISTRO_FIXED_ROWS_BETWEEN + totalProjectRows;
        for (let j = 0; j < totalBaseRows; j++) {
          const rn = baseStart + j;
          const row = wsRegistro.getRow(rn);
          copyRowStyle(wsRegistro, REGISTRO_START_ROW, rn, REGISTRO_LAST_COL);
          const baseWorker = baseWorkerList[j];
          const aid = Number(baseWorkers[j].AssignmentID);
          registroRowByOwner.set(`AS:${aid}`, rn);
          row.getCell(1).value = j + 1;
          row.getCell(2).value = baseWorker.fullName;
          row.getCell(3).value = baseWorker.position;
          row.getCell(4).value = baseWorker.residence;
          row.getCell(5).value = baseWorker.rfc;
          row.getCell(6).value = baseWorker.curp;
          row.getCell(7).value = baseWorker.nss;
          if (baseWorker.assignmentStartDate !== null) {
            row.getCell(8).value = baseWorker.assignmentStartDate;
            row.getCell(8).numFmt = "dd/mm/yyyy";
          } else row.getCell(8).value = "";
          row.getCell(9).value = { formula: `Q${rn}-N${rn}` } as any;
          row.getCell(10).value = projectAreaDeTrabajo;
          row.getCell(11).value = baseWorker.nci;
          row.getCell(13).value = baseWorker.phone;
          if (baseWorker.salaryIMSS !== null) {
            row.getCell(14).value = baseWorker.salaryIMSS;
            row.getCell(14).numFmt = '"$"#,##0.00';
          } else row.getCell(14).value = "";
          if (baseWorker.assignmentDurationDays !== null) row.getCell(16).value = `${baseWorker.assignmentDurationDays} DÍAS`;
          else row.getCell(16).value = "";
          row.commit();
        }
      } else {
        const currentMaxRow = wsRegistro.rowCount;
        for (let rn = REGISTRO_START_ROW; rn <= currentMaxRow; rn++) {
          const row = wsRegistro.getRow(rn);
          clearSharedFormulasInRow(row, 1, REGISTRO_LAST_COL);
          for (let col = 1; col <= REGISTRO_LAST_COL; col++) row.getCell(col).value = null;
          row.commit();
        }
      }
    }

    let lastSumRowNumber = CONCENTRADO_START_ROW;
    let sumBaseRowNumberRef: number | null = null;
    let sumProjectRowNumberRef: number | null = null;
    let lastGIumRowRef: number | null = null;

    const wsConcentrado = workbook.getWorksheet("CONCENTRADO");
    const concentradoRowByProjectPersonnel = new Map<number, number>();
    const concentradoRowByAssignment = new Map<number, number>();
    const concentradoRowByOwner = new Map<string, number>();
    const contratoVencerRowByOwner = new Map<string, number>();

    let listingModelHeight: number | undefined;
    const listingModelStyles: Record<number, any> = {};
    const listingModelNumFmt: Record<number, string> = {};

    let periodoTextoParaRecibos = "";
    let contractsExpiringThisWeek: ContractExpiringWorker[] = [];

    if (wsConcentrado) {
      wsConcentrado.getCell("I2").value = projectName;
      const periodoTexto = formatPeriodoEs(startDateValue, endDateValue);
      wsConcentrado.getCell("I4").value = periodoTexto !== "" ? periodoTexto : null;
      wsConcentrado.getCell("I5").value = weekNumberValue === "" ? null : weekNumberValue;

      periodoTextoParaRecibos = periodoTexto;

      interface ConcentradoProjectWorker {
        projectPersonnelId: number; employeeId: number; fullName: string; position: string;
        salaryIMSS: number | null; present: boolean; daysWorked: Set<number>;
        extraHoursByDay: Record<number, number>;
      }
      const concUniqueProject = new Map<number, ConcentradoProjectWorker>();
      for (const w of projectWorkers) {
        if (!concUniqueProject.has(w.ProjectPersonnelID)) {
          const eid = Number(w.EmployeeID);
          concUniqueProject.set(w.ProjectPersonnelID, {
            projectPersonnelId: w.ProjectPersonnelID,
            employeeId: eid,
            fullName: (w.FullName || "NO DISPONIBLE").trim(),
            position: (w.Position || "").trim(),
            salaryIMSS: w.SalaryIMSS !== null && w.SalaryIMSS !== undefined ? Number(w.SalaryIMSS) : null,
            present: presentProjectPersonnelIds.has(w.ProjectPersonnelID) || presentEmployeeIds.has(eid),
            daysWorked: dayWorkedProject.get(w.ProjectPersonnelID) || dayWorkedEmployee.get(eid) || new Set<number>(),
            extraHoursByDay: extraHoursProject.get(w.ProjectPersonnelID) || extraHoursEmployee.get(eid) || {},
          });
        }
      }
      const concProjectList = Array.from(concUniqueProject.values());

      interface ConcentradoBaseWorker {
        employeeId: number; assignmentId: number; fullName: string; position: string;
        salaryIMSS: number | null; present: boolean; daysWorked: Set<number>;
        extraHoursByDay: Record<number, number>;
      }
      const concBaseList: ConcentradoBaseWorker[] = baseWorkers.map(b => {
        const eid = Number(b.EmployeeID);
        const aid = Number(b.AssignmentID);
        return {
          employeeId: eid, assignmentId: aid,
          fullName: (b.FullName || "NO DISPONIBLE").trim(),
          position: (b.Position || "").trim(),
          salaryIMSS: b.SalaryIMSS !== null && b.SalaryIMSS !== undefined ? Number(b.SalaryIMSS) : null,
          present: presentAssignmentIds.has(aid) || presentEmployeeIds.has(eid),
          daysWorked: dayWorkedAssignment.get(aid) || dayWorkedEmployee.get(eid) || new Set<number>(),
          extraHoursByDay: extraHoursAssignment.get(aid) || extraHoursEmployee.get(eid) || {},
        };
      });

      const concTotalProject = concProjectList.length;
      const concTotalBase = concBaseList.length;

      if (concTotalProject > 0 || concTotalBase > 0) {
        const concModelRow = wsConcentrado.getRow(CONCENTRADO_START_ROW);
        const concModelHeight = concModelRow.height;
        const concModelStyles: any[] = [];
        for (let col = 1; col <= CONCENTRADO_LAST_COL; col++) {
          concModelStyles[col] = JSON.parse(JSON.stringify(concModelRow.getCell(col).style || {}));
        }

        if (concTotalProject > 1) shiftRowsDown(wsConcentrado, CONCENTRADO_START_ROW + 1, concTotalProject - 1);

        const fixedEndRow = CONCENTRADO_START_ROW + CONCENTRADO_FIXED_ROWS + (concTotalProject - 1);

        if (concTotalBase > 0) shiftRowsDown(wsConcentrado, fixedEndRow + 1, concTotalBase);

        const projectFirstRow = CONCENTRADO_START_ROW;
        let projectLastRow = CONCENTRADO_START_ROW;

        for (let i = 0; i < concTotalProject; i++) {
          const rn = CONCENTRADO_START_ROW + i;
          const row = wsConcentrado.getRow(rn);
          row.height = concModelHeight;
          for (let col = 1; col <= CONCENTRADO_LAST_COL; col++) {
            row.getCell(col).style = JSON.parse(JSON.stringify(concModelStyles[col] || {}));
          }
          const worker = concProjectList[i];
          row.getCell(1).value = i + 1;
          row.getCell(2).value = worker.fullName;
          row.getCell(3).value = worker.position;
          if (worker.salaryIMSS !== null) {
            row.getCell(4).value = worker.salaryIMSS;
            row.getCell(4).numFmt = '"$"#,##0.00';
          } else row.getCell(4).value = "";
          row.getCell(5).value = worker.present ? 1 : 0;
          for (const { dayIndex, col } of CONCENTRADO_HN_DAY_COLS) row.getCell(col).value = worker.daysWorked.has(dayIndex) ? 1 : 0;
          for (const { dayIndex, col } of CONCENTRADO_HE_DAY_COLS) row.getCell(col).value = worker.extraHoursByDay[dayIndex] || 0;
          row.getCell(CONCENTRADO_TOTAL_HE_COL).value = { formula: buildConcentradoTotalHEFormula(rn) } as any;
          row.getCell(CONCENTRADO_TOTAL_HN_COL).value = { formula: buildConcentradoTotalHNFormula(rn) } as any;
          row.getCell(CONCENTRADO_EXTRA_COL).value = { formula: buildConcentradoExtraFormula(rn) } as any;
          row.getCell(CONCENTRADO_SALARY_DIV_COL).value = { formula: buildConcentradoSalaryDivFormula(rn) } as any;
          row.getCell(CONCENTRADO_SALARY_DAY_COL).value = { formula: buildConcentradoSalaryDayFormula(rn) } as any;
          row.getCell(CONCENTRADO_EXTRA_PAY_COL).value = { formula: buildConcentradoExtraPayFormula(rn) } as any;
          const regRow = registroRowByOwner.get(`PP:${worker.projectPersonnelId}`);
          if (regRow !== undefined) {
            row.getCell(CONCENTRADO_REGISTRO_I_COL).value = {
              formula: buildConcentradoRegistroFormula(regRow, rn)
            } as any;
          } else {
            row.getCell(CONCENTRADO_REGISTRO_I_COL).value = null;
          }
          row.getCell(CONCENTRADO_TOTAL_PAY_COL).value = { formula: buildConcentradoTotalPayFormula(rn) } as any;
          projectLastRow = rn;
          concentradoRowByProjectPersonnel.set(worker.projectPersonnelId, rn);
          concentradoRowByOwner.set(`PP:${worker.projectPersonnelId}`, rn);
          row.commit();
        }

        const concBaseStart = fixedEndRow + 1;
        const baseFirstRow = concBaseStart;
        let baseLastRow = concBaseStart;

        for (let j = 0; j < concTotalBase; j++) {
          const rn = concBaseStart + j;
          const row = wsConcentrado.getRow(rn);
          row.height = concModelHeight;
          for (let col = 1; col <= CONCENTRADO_LAST_COL; col++) {
            row.getCell(col).style = JSON.parse(JSON.stringify(concModelStyles[col] || {}));
          }
          const baseWorker = concBaseList[j];
          row.getCell(1).value = j + 1;
          row.getCell(2).value = baseWorker.fullName;
          row.getCell(3).value = baseWorker.position;
          if (baseWorker.salaryIMSS !== null) {
            row.getCell(4).value = baseWorker.salaryIMSS;
            row.getCell(4).numFmt = '"$"#,##0.00';
          } else row.getCell(4).value = "";
          row.getCell(5).value = baseWorker.present ? 1 : 0;
          for (const { dayIndex, col } of CONCENTRADO_HN_DAY_COLS) row.getCell(col).value = baseWorker.daysWorked.has(dayIndex) ? 1 : 0;
          for (const { dayIndex, col } of CONCENTRADO_HE_DAY_COLS) row.getCell(col).value = baseWorker.extraHoursByDay[dayIndex] || 0;
          row.getCell(CONCENTRADO_TOTAL_HE_COL).value = { formula: buildConcentradoTotalHEFormula(rn) } as any;
          row.getCell(CONCENTRADO_TOTAL_HN_COL).value = { formula: buildConcentradoTotalHNFormula(rn) } as any;
          row.getCell(CONCENTRADO_EXTRA_COL).value = { formula: buildConcentradoExtraFormula(rn) } as any;
          row.getCell(CONCENTRADO_SALARY_DIV_COL).value = { formula: buildConcentradoSalaryDivFormula(rn) } as any;
          row.getCell(CONCENTRADO_SALARY_DAY_COL).value = { formula: buildConcentradoSalaryDayFormula(rn) } as any;
          row.getCell(CONCENTRADO_EXTRA_PAY_COL).value = { formula: buildConcentradoExtraPayFormula(rn) } as any;
          const regRow = registroRowByOwner.get(`AS:${baseWorker.assignmentId}`);
          if (regRow !== undefined) {
            row.getCell(CONCENTRADO_REGISTRO_I_COL).value = {
              formula: buildConcentradoRegistroFormula(regRow, rn)
            } as any;
          } else {
            row.getCell(CONCENTRADO_REGISTRO_I_COL).value = null;
          }
          row.getCell(CONCENTRADO_TOTAL_PAY_COL).value = { formula: buildConcentradoTotalPayFormula(rn) } as any;
          baseLastRow = rn;
          concentradoRowByAssignment.set(baseWorker.assignmentId, rn);
          concentradoRowByOwner.set(`AS:${baseWorker.assignmentId}`, rn);
          row.commit();
        }

        const adLetter = colLetter(CONCENTRADO_TOTAL_PAY_COL);
        const uLetter = colLetter(CONCENTRADO_EXTRA_COL);
        const tLetter = colLetter(CONCENTRADO_TOTAL_HN_COL);
        let sumProjectRowNumber: number | null = null;
        let sumBaseRowNumber: number | null = null;

        if (concTotalProject > 0) {
          sumProjectRowNumber = projectLastRow + 1;
          const sumProjectRow = wsConcentrado.getRow(sumProjectRowNumber);
          sumProjectRow.getCell(CONCENTRADO_TOTAL_PAY_COL).value = { formula: `SUM(${adLetter}${projectFirstRow}:${adLetter}${projectLastRow})` } as any;
          sumProjectRow.getCell(CONCENTRADO_TOTAL_PAY_COL).font = { ...(sumProjectRow.getCell(CONCENTRADO_TOTAL_PAY_COL).font || {}), bold: true };
          sumProjectRow.getCell(CONCENTRADO_EXTRA_COL).value = { formula: `SUM(${uLetter}${projectFirstRow}:${uLetter}${projectLastRow})` } as any;
          sumProjectRow.getCell(CONCENTRADO_EXTRA_COL).font = { ...(sumProjectRow.getCell(CONCENTRADO_EXTRA_COL).font || {}), bold: true };
          sumProjectRow.commit();
        }

        if (concTotalBase > 0) {
          sumBaseRowNumber = baseLastRow + 1;
          const sumBaseRow = wsConcentrado.getRow(sumBaseRowNumber);
          sumBaseRow.getCell(CONCENTRADO_TOTAL_PAY_COL).value = { formula: `SUM(${adLetter}${baseFirstRow}:${adLetter}${baseLastRow})` } as any;
          sumBaseRow.getCell(CONCENTRADO_TOTAL_PAY_COL).font = { ...(sumBaseRow.getCell(CONCENTRADO_TOTAL_PAY_COL).font || {}), bold: true };
          sumBaseRow.getCell(CONCENTRADO_TOTAL_HN_COL).value = { formula: `SUM(${tLetter}${baseFirstRow}:${tLetter}${baseLastRow})` } as any;
          sumBaseRow.getCell(CONCENTRADO_TOTAL_HN_COL).font = { ...(sumBaseRow.getCell(CONCENTRADO_TOTAL_HN_COL).font || {}), bold: true };
          sumBaseRow.commit();
        }

        sumBaseRowNumberRef = sumBaseRowNumber;
        sumProjectRowNumberRef = sumProjectRowNumber;

        lastSumRowNumber = sumBaseRowNumber !== null
          ? sumBaseRowNumber
          : (sumProjectRowNumber !== null ? sumProjectRowNumber : baseLastRow);

        const refBaseSumRow = lastSumRowNumber;
        const grandTotalRowNumber = refBaseSumRow + 2;
        const grandTotalRow = wsConcentrado.getRow(grandTotalRowNumber);

        const parts: string[] = [];
        if (sumProjectRowNumber !== null) parts.push(`${adLetter}${sumProjectRowNumber}`);
        if (sumBaseRowNumber !== null) parts.push(`${adLetter}${sumBaseRowNumber}`);

        if (parts.length > 0) {
          const startLetter = colLetter(CONCENTRADO_GRAND_TOTAL_COL);
          const endLetter = colLetter(CONCENTRADO_GRAND_TOTAL_COL_END);
          try {
            wsConcentrado.mergeCells(`${startLetter}${grandTotalRowNumber}:${endLetter}${grandTotalRowNumber}`);
          } catch {}
          const masterCell = grandTotalRow.getCell(CONCENTRADO_GRAND_TOTAL_COL);
          masterCell.value = { formula: parts.join("+") } as any;
          masterCell.font = { ...(masterCell.font || {}), bold: true };
          masterCell.alignment = { ...(masterCell.alignment || {}), horizontal: "center", vertical: "middle" };
          grandTotalRow.commit();
        }
      } else {
        const concMaxRow = wsConcentrado.rowCount;
        for (let rn = CONCENTRADO_START_ROW; rn <= concMaxRow; rn++) {
          const row = wsConcentrado.getRow(rn);
          for (let col = 1; col <= 5; col++) row.getCell(col).value = null;
          for (const { col } of CONCENTRADO_HN_DAY_COLS) row.getCell(col).value = null;
          for (const { col } of CONCENTRADO_HE_DAY_COLS) row.getCell(col).value = null;
          row.getCell(CONCENTRADO_TOTAL_HE_COL).value = null;
          row.getCell(CONCENTRADO_TOTAL_HN_COL).value = null;
          row.getCell(CONCENTRADO_EXTRA_COL).value = null;
          row.getCell(CONCENTRADO_SALARY_DIV_COL).value = null;
          row.getCell(CONCENTRADO_SALARY_DAY_COL).value = null;
          row.getCell(CONCENTRADO_EXTRA_PAY_COL).value = null;
          row.getCell(CONCENTRADO_REGISTRO_I_COL).value = null;
          row.getCell(CONCENTRADO_TOTAL_PAY_COL).value = null;
          row.commit();
        }
      }

      let lastInfonavitDataRow: number | null = null;

      if (infonavitRows.length > 0) {
        const infonavitStartRow = lastSumRowNumber + INFONAVIT_OFFSET_ROWS;
        const headerRowNumber = infonavitStartRow - 1;

        const infonavitModelRow = wsConcentrado.getRow(infonavitStartRow);
        const infonavitModelHeight = infonavitModelRow.height;
        const infonavitModelStyles: Record<number, any> = {};
        const infonavitModelNumFmt: Record<number, string> = {};
        for (let col = 1; col <= CONCENTRADO_LAST_COL; col++) {
          const cell = infonavitModelRow.getCell(col);
          infonavitModelStyles[col] = JSON.parse(JSON.stringify(cell.style || {}));
          if (cell.numFmt) infonavitModelNumFmt[col] = cell.numFmt;
        }

        listingModelHeight = infonavitModelHeight;
        Object.assign(listingModelStyles, infonavitModelStyles);
        Object.assign(listingModelNumFmt, infonavitModelNumFmt);

        if (infonavitRows.length > 1) {
          shiftRowsDown(wsConcentrado, infonavitStartRow + 1, infonavitRows.length - 1);
        }

        for (let i = 0; i < infonavitRows.length; i++) {
          const rn = infonavitStartRow + i;
          const row = wsConcentrado.getRow(rn);

          if (infonavitModelHeight !== undefined) row.height = infonavitModelHeight;
          for (let col = 1; col <= CONCENTRADO_LAST_COL; col++) {
            const dstCell = row.getCell(col);
            dstCell.style = JSON.parse(JSON.stringify(infonavitModelStyles[col] || {}));
            if (infonavitModelNumFmt[col]) dstCell.numFmt = infonavitModelNumFmt[col];
          }

          row.getCell(INFONAVIT_LABEL_COL).value = "INFONAVIT";
          row.getCell(INFONAVIT_NAME_COL).value = infonavitRows[i].FullName || "NO DISPONIBLE";
          const nameRangeStr = `${colLetter(INFONAVIT_NAME_COL)}${rn}:${colLetter(INFONAVIT_NAME_COL_END)}${rn}`;
          try { wsConcentrado.mergeCells(nameRangeStr); } catch {}
          const nameMasterCell = row.getCell(INFONAVIT_NAME_COL);
          nameMasterCell.alignment = {
            ...(nameMasterCell.alignment || {}),
            horizontal: "center",
            vertical: "middle",
            wrapText: true
          };

          row.getCell(INFONAVIT_AMOUNT_COL).value = Number(infonavitRows[i].DailyAmount) || 0;
          row.getCell(INFONAVIT_AMOUNT_COL).numFmt = '"$"#,##0.00';
          const amountRangeStr = `${colLetter(INFONAVIT_AMOUNT_COL)}${rn}:${colLetter(INFONAVIT_AMOUNT_COL_END)}${rn}`;
          try { wsConcentrado.mergeCells(amountRangeStr); } catch {}
          const amountMasterCell = row.getCell(INFONAVIT_AMOUNT_COL);
          amountMasterCell.alignment = {
            ...(amountMasterCell.alignment || {}),
            horizontal: "center",
            vertical: "middle"
          };

          const empId = Number(infonavitRows[i].EmployeeID);
          let employeeRow: number | undefined;

          for (const pw of projectWorkers) {
            if (Number(pw.EmployeeID) === empId) {
              const mapped = concentradoRowByProjectPersonnel.get(pw.ProjectPersonnelID);
              if (mapped !== undefined) { employeeRow = mapped; break; }
            }
          }
          if (employeeRow === undefined) {
            for (const bw of baseWorkers) {
              if (Number(bw.EmployeeID) === empId) {
                const mapped = concentradoRowByAssignment.get(Number(bw.AssignmentID));
                if (mapped !== undefined) { employeeRow = mapped; break; }
              }
            }
          }

          if (employeeRow !== undefined) {
            const gLetter = colLetter(INFONAVIT_AMOUNT_COL);
            const sLetter = colLetter(CONCENTRADO_INFONAVIT_SALARY_COL);
            const formula = `=${gLetter}${rn}*${sLetter}${employeeRow}`;
            row.getCell(INFONAVIT_TOTAL_COL).value = { formula } as any;
            row.getCell(INFONAVIT_TOTAL_COL).numFmt = '"$"#,##0.00';
          } else {
            row.getCell(INFONAVIT_TOTAL_COL).value = null;
          }

          const totalRangeStr = `${colLetter(INFONAVIT_TOTAL_COL)}${rn}:${colLetter(INFONAVIT_TOTAL_COL_END)}${rn}`;
          try { wsConcentrado.mergeCells(totalRangeStr); } catch {}
          const totalMasterCell = row.getCell(INFONAVIT_TOTAL_COL);
          totalMasterCell.alignment = {
            ...(totalMasterCell.alignment || {}),
            horizontal: "center",
            vertical: "middle"
          };

          row.commit();
        }

        lastInfonavitDataRow = infonavitStartRow + infonavitRows.length - 1;
        applyListingRowMerges(wsConcentrado, infonavitStartRow, lastInfonavitDataRow, LISTING_ROW_MERGES);

        const finalHeaderRow = wsConcentrado.getRow(headerRowNumber);
        for (const [startCol, endCol] of INFONAVIT_HEADER_MERGES) {
          const rangeStr = `${colLetter(startCol)}${headerRowNumber}:${colLetter(endCol)}${headerRowNumber}`;
          if (endCol > startCol) {
            try { wsConcentrado.mergeCells(rangeStr); } catch {}
          }
          const masterCell = finalHeaderRow.getCell(startCol);
          masterCell.alignment = {
            ...(masterCell.alignment || {}),
            horizontal: "center",
            vertical: "middle",
            wrapText: true
          };
        }
        finalHeaderRow.commit();
      }

      let lastLoanDataRow: number | null = null;

      if (loanPaymentRows.length > 0) {
        if (lastInfonavitDataRow === null) {
          const fallbackRow = wsConcentrado.getRow(lastSumRowNumber + INFONAVIT_OFFSET_ROWS);
          const fallbackHeight = fallbackRow.height;
          for (let col = 1; col <= CONCENTRADO_LAST_COL; col++) {
            const cell = fallbackRow.getCell(col);
            listingModelStyles[col] = JSON.parse(JSON.stringify(cell.style || {}));
            if (cell.numFmt) listingModelNumFmt[col] = cell.numFmt;
          }
          listingModelHeight = fallbackHeight;
        }

        const loanStartRow = lastInfonavitDataRow !== null
          ? lastInfonavitDataRow + 1
          : lastSumRowNumber + INFONAVIT_OFFSET_ROWS;

        shiftRowsDown(wsConcentrado, loanStartRow, loanPaymentRows.length);

        for (let i = 0; i < loanPaymentRows.length; i++) {
          const rn = loanStartRow + i;
          const lp = loanPaymentRows[i];
          const row = wsConcentrado.getRow(rn);

          if (listingModelHeight !== undefined) row.height = listingModelHeight;
          for (let col = 1; col <= CONCENTRADO_LAST_COL; col++) {
            const dstCell = row.getCell(col);
            dstCell.style = JSON.parse(JSON.stringify(listingModelStyles[col] || {}));
            if (listingModelNumFmt[col]) dstCell.numFmt = listingModelNumFmt[col];
          }

          row.getCell(LOAN_LABEL_COL).value = "PRESTAMO";
          const labelCell = row.getCell(LOAN_LABEL_COL);
          labelCell.alignment = {
            ...(labelCell.alignment || {}),
            horizontal: "center",
            vertical: "middle"
          };

          row.getCell(LOAN_NAME_COL).value = lp.FullName || "NO DISPONIBLE";
          const nameRangeStr = `${colLetter(LOAN_NAME_COL)}${rn}:${colLetter(LOAN_NAME_COL_END)}${rn}`;
          try { wsConcentrado.mergeCells(nameRangeStr); } catch {}
          const nameMasterCell = row.getCell(LOAN_NAME_COL);
          nameMasterCell.alignment = {
            ...(nameMasterCell.alignment || {}),
            horizontal: "center",
            vertical: "middle"
          };

          row.getCell(LOAN_AMOUNT_COL).value = Number(lp.Amount) || 0;
          row.getCell(LOAN_AMOUNT_COL).numFmt = '"$"#,##0.00';
          const amountRangeStr = `${colLetter(LOAN_AMOUNT_COL)}${rn}:${colLetter(LOAN_AMOUNT_COL_END)}${rn}`;
          try { wsConcentrado.mergeCells(amountRangeStr); } catch {}
          const amountMasterCell = row.getCell(LOAN_AMOUNT_COL);
          amountMasterCell.alignment = {
            ...(amountMasterCell.alignment || {}),
            horizontal: "center",
            vertical: "middle"
          };

          row.getCell(LOAN_WEEKLY_AMOUNT_COL).value = Number(lp.Amount) || 0;
          row.getCell(LOAN_WEEKLY_AMOUNT_COL).numFmt = '"$"#,##0.00';
          const weeklyRangeStr = `${colLetter(LOAN_WEEKLY_AMOUNT_COL)}${rn}:${colLetter(LOAN_WEEKLY_AMOUNT_COL_END)}${rn}`;
          try { wsConcentrado.mergeCells(weeklyRangeStr); } catch {}
          const weeklyMasterCell = row.getCell(LOAN_WEEKLY_AMOUNT_COL);
          weeklyMasterCell.alignment = {
            ...(weeklyMasterCell.alignment || {}),
            horizontal: "center",
            vertical: "middle"
          };

          row.getCell(LOAN_CURRENT_DEBT_COL).value = Number(lp.SaldoActual) || 0;
          row.getCell(LOAN_CURRENT_DEBT_COL).numFmt = '"$"#,##0.00';
          const debtRangeStr = `${colLetter(LOAN_CURRENT_DEBT_COL)}${rn}:${colLetter(LOAN_CURRENT_DEBT_COL_END)}${rn}`;
          try { wsConcentrado.mergeCells(debtRangeStr); } catch {}
          const debtMasterCell = row.getCell(LOAN_CURRENT_DEBT_COL);
          debtMasterCell.alignment = {
            ...(debtMasterCell.alignment || {}),
            horizontal: "center",
            vertical: "middle"
          };

          row.getCell(LOAN_PAID_AMOUNT_COL).value = { formula: `G${rn}-N${rn}` } as any;
          row.getCell(LOAN_PAID_AMOUNT_COL).numFmt = '"$"#,##0.00';
          const paidRangeStr = `${colLetter(LOAN_PAID_AMOUNT_COL)}${rn}:${colLetter(LOAN_PAID_AMOUNT_COL_END)}${rn}`;
          try { wsConcentrado.mergeCells(paidRangeStr); } catch {}
          const paidMasterCell = row.getCell(LOAN_PAID_AMOUNT_COL);
          paidMasterCell.alignment = {
            ...(paidMasterCell.alignment || {}),
            horizontal: "center",
            vertical: "middle"
          };

          row.getCell(LOAN_TOTAL_AMOUNT_COL).value = Number(lp.LoanTotal) || 0;
          row.getCell(LOAN_TOTAL_AMOUNT_COL).numFmt = '"$"#,##0.00';
          const loanTotalRangeStr = `${colLetter(LOAN_TOTAL_AMOUNT_COL)}${rn}:${colLetter(LOAN_TOTAL_AMOUNT_COL_END)}${rn}`;
          try { wsConcentrado.mergeCells(loanTotalRangeStr); } catch {}
          const loanTotalMasterCell = row.getCell(LOAN_TOTAL_AMOUNT_COL);
          loanTotalMasterCell.alignment = {
            ...(loanTotalMasterCell.alignment || {}),
            horizontal: "center",
            vertical: "middle"
          };

          const paymentNumberText = `${lp.PaymentNumber} DE ${lp.NumberOfPayments}`;
          row.getCell(LOAN_PAYMENT_NUMBER_COL).value = paymentNumberText;
          const paymentNumberCell = row.getCell(LOAN_PAYMENT_NUMBER_COL);
          paymentNumberCell.alignment = {
            ...(paymentNumberCell.alignment || {}),
            horizontal: "center",
            vertical: "middle"
          };

          row.commit();

          const empId = Number(lp.EmployeeID);
          let employeeRow: number | undefined;
          for (const pw of projectWorkers) {
            if (Number(pw.EmployeeID) === empId) {
              const mapped = concentradoRowByProjectPersonnel.get(pw.ProjectPersonnelID);
              if (mapped !== undefined) { employeeRow = mapped; break; }
            }
          }
          if (employeeRow === undefined) {
            for (const bw of baseWorkers) {
              if (Number(bw.EmployeeID) === empId) {
                const mapped = concentradoRowByAssignment.get(Number(bw.AssignmentID));
                if (mapped !== undefined) { employeeRow = mapped; break; }
              }
            }
          }
          if (employeeRow !== undefined) {
            addLoanAmountToConcentradoAB(wsConcentrado, employeeRow, Number(lp.Amount) || 0);
          }
        }

        lastLoanDataRow = loanStartRow + loanPaymentRows.length - 1;
        applyListingRowMerges(wsConcentrado, loanStartRow, lastLoanDataRow, LISTING_ROW_MERGES);
      }

      if (infonavitRows.length > 0 || loanPaymentRows.length > 0) {
        let sumRowNumber: number;

        if (lastLoanDataRow !== null) {
          sumRowNumber = lastLoanDataRow + 1;
        } else if (lastInfonavitDataRow !== null) {
          sumRowNumber = lastInfonavitDataRow + 1;
        } else {
          sumRowNumber = lastSumRowNumber + INFONAVIT_OFFSET_ROWS;
        }

        const sumRow = wsConcentrado.getRow(sumRowNumber);

        sumRow.getCell(INFONAVIT_LABEL_COL).value = "TOTAL";
        const labelCell = sumRow.getCell(INFONAVIT_LABEL_COL);
        labelCell.font = { ...(labelCell.font || {}), bold: true };
        labelCell.alignment = {
          ...(labelCell.alignment || {}),
          horizontal: "center",
          vertical: "middle"
        };

        const gLetter = colLetter(LOAN_AMOUNT_COL);
        const iLetter = colLetter(LOAN_AMOUNT_COL_END);
        const tLetter = colLetter(LOAN_TOTAL_AMOUNT_COL);
        const uLetter = colLetter(LOAN_TOTAL_AMOUNT_COL_END);

        const formulaPartsG: string[] = [];
        const formulaPartsT: string[] = [];

        if (infonavitRows.length > 0 && lastInfonavitDataRow !== null) {
          const infonavitStartRow = lastInfonavitDataRow - infonavitRows.length + 1;
          formulaPartsG.push(`SUM(${gLetter}${infonavitStartRow}:${gLetter}${lastInfonavitDataRow})`);
          formulaPartsT.push(`SUM(${tLetter}${infonavitStartRow}:${tLetter}${lastInfonavitDataRow})`);
        }

        if (loanPaymentRows.length > 0 && lastLoanDataRow !== null) {
          const loanStartRow = lastLoanDataRow - loanPaymentRows.length + 1;
          formulaPartsG.push(`SUM(${gLetter}${loanStartRow}:${gLetter}${lastLoanDataRow})`);
          formulaPartsT.push(`SUM(${tLetter}${loanStartRow}:${tLetter}${lastLoanDataRow})`);
        }

        if (formulaPartsG.length > 0) {
          const totalFormulaG = formulaPartsG.join("+");
          sumRow.getCell(LOAN_AMOUNT_COL).value = { formula: totalFormulaG } as any;
          sumRow.getCell(LOAN_AMOUNT_COL).numFmt = '"$"#,##0.00';
          sumRow.getCell(LOAN_AMOUNT_COL).font = { ...(sumRow.getCell(LOAN_AMOUNT_COL).font || {}), bold: true };
          const mergeRangeG = `${gLetter}${sumRowNumber}:${iLetter}${sumRowNumber}`;
          try { wsConcentrado.mergeCells(mergeRangeG); } catch {}
          const masterCellG = sumRow.getCell(LOAN_AMOUNT_COL);
          masterCellG.alignment = {
            ...(masterCellG.alignment || {}),
            horizontal: "center",
            vertical: "middle"
          };
        }

        if (formulaPartsT.length > 0) {
          const totalFormulaT = formulaPartsT.join("+");
          sumRow.getCell(LOAN_TOTAL_AMOUNT_COL).value = { formula: totalFormulaT } as any;
          sumRow.getCell(LOAN_TOTAL_AMOUNT_COL).numFmt = '"$"#,##0.00';
          sumRow.getCell(LOAN_TOTAL_AMOUNT_COL).font = { ...(sumRow.getCell(LOAN_TOTAL_AMOUNT_COL).font || {}), bold: true };
          const mergeRangeT = `${tLetter}${sumRowNumber}:${uLetter}${sumRowNumber}`;
          try { wsConcentrado.mergeCells(mergeRangeT); } catch {}
          const masterCellT = sumRow.getCell(LOAN_TOTAL_AMOUNT_COL);
          masterCellT.alignment = {
            ...(masterCellT.alignment || {}),
            horizontal: "center",
            vertical: "middle"
          };
        }

        sumRow.commit();
        lastGIumRowRef = sumRowNumber;
      }

      if (sumBaseRowNumberRef !== null) {
        const adLetter = colLetter(30);

        const rangeStartRow = sumBaseRowNumberRef + 4;
        const rangeEndRow = sumBaseRowNumberRef + 8;
        const adFormulaRowNumber = sumBaseRowNumberRef + 9;
        const adTargetRow = wsConcentrado.getRow(adFormulaRowNumber);
        adTargetRow.getCell(30).value = {
          formula: `SUM(${adLetter}${rangeStartRow}:${adLetter}${rangeEndRow})`
        } as any;
        adTargetRow.getCell(30).numFmt = '"$"#,##0.00';
        adTargetRow.commit();

        const positiveParts: string[] = [];
        if (sumProjectRowNumberRef !== null) {
          positiveParts.push(`${adLetter}${sumProjectRowNumberRef}`);
        }
        positiveParts.push(`${adLetter}${sumBaseRowNumberRef}`);
        const negativePart = `${adLetter}${rangeStartRow}`;
        const secondFormula = `${positiveParts.join("+")}-${negativePart}`;

        const adSecondFormulaRowNumber = sumBaseRowNumberRef + 11;
        const adSecondTargetRow = wsConcentrado.getRow(adSecondFormulaRowNumber);
        adSecondTargetRow.getCell(30).value = { formula: secondFormula } as any;
        adSecondTargetRow.getCell(30).numFmt = '"$"#,##0.00';
        adSecondTargetRow.commit();

        const thirdParts: string[] = [];
        if (sumProjectRowNumberRef !== null) {
          thirdParts.push(`${adLetter}${sumProjectRowNumberRef}`);
        }
        thirdParts.push(`${adLetter}${sumBaseRowNumberRef}`);
        thirdParts.push(`${adLetter}${sumBaseRowNumberRef + 5}`);
        thirdParts.push(`${adLetter}${sumBaseRowNumberRef + 6}`);
        thirdParts.push(`${adLetter}${sumBaseRowNumberRef + 7}`);
        thirdParts.push(`${adLetter}${sumBaseRowNumberRef + 8}`);

        const thirdFormula = thirdParts.join("+");
        const adThirdFormulaRowNumber = sumBaseRowNumberRef + 12;
        const adThirdTargetRow = wsConcentrado.getRow(adThirdFormulaRowNumber);
        adThirdTargetRow.getCell(30).value = { formula: thirdFormula } as any;
        adThirdTargetRow.getCell(30).numFmt = '"$"#,##0.00';
        adThirdTargetRow.commit();
      }

      if (lastGIumRowRef !== null) {
        const mergeTargetRow = lastGIumRowRef + 2;
        mergeAndCenterRow(wsConcentrado, mergeTargetRow, 4, 5);
        mergeAndCenterRow(wsConcentrado, mergeTargetRow, 6, 7);
        mergeAndCenterRow(wsConcentrado, mergeTargetRow, 10, 14);
        mergeAndCenterRow(wsConcentrado, mergeTargetRow, 15, 24);
        mergeAndCenterRow(wsConcentrado, mergeTargetRow, 25, 27);
        mergeAndCenterRow(wsConcentrado, mergeTargetRow, 28, 30);
      }

      const startYmd = ymdOf(startDateValue);
      const endYmd = ymdOf(endDateValue);

      if (startYmd && endYmd) {
        for (const w of projectWorkers) {
          const endContractYmd = ymdOf(w.ContractEndDate);
          if (!endContractYmd) continue;
          if (endContractYmd >= startYmd && endContractYmd <= endYmd) {
            const salary = w.SalaryIMSS !== null && w.SalaryIMSS !== undefined ? Number(w.SalaryIMSS) : null;
            contractsExpiringThisWeek.push({
              fullName: (w.FullName || "NO DISPONIBLE").trim(),
              position: (w.Position || "").trim(),
              contractStartDate: toExcelSerial(w.ContractStartDate),
              contractEndDate: toExcelSerial(w.ContractEndDate),
              rfc: (w.RFC || "").trim(),
              nss: (w.NSS || "").trim(),
              salaryIMSS: salary,
              salarioDiario: salary !== null ? salary / 5 : null,
              ownerKey: `PP:${w.ProjectPersonnelID}`,
              employeeId: Number(w.EmployeeID),
            });
          }
        }
        for (const b of baseWorkers) {
          const endAssignmentYmd = ymdOf(b.AssignmentEndDate);
          if (!endAssignmentYmd) continue;
          if (endAssignmentYmd >= startYmd && endAssignmentYmd <= endYmd) {
            const salary = b.SalaryIMSS !== null && b.SalaryIMSS !== undefined ? Number(b.SalaryIMSS) : null;
            contractsExpiringThisWeek.push({
              fullName: (b.FullName || "NO DISPONIBLE").trim(),
              position: (b.Position || "").trim(),
              contractStartDate: toExcelSerial(b.AssignmentStartDate),
              contractEndDate: toExcelSerial(b.AssignmentEndDate),
              rfc: (b.RFC || "").trim(),
              nss: (b.NSS || "").trim(),
              salaryIMSS: salary,
              salarioDiario: salary !== null ? salary / 5 : null,
              ownerKey: `AS:${b.AssignmentID}`,
              employeeId: Number(b.EmployeeID),
            });
          }
        }
      }

      if (lastGIumRowRef !== null && contractsExpiringThisWeek.length > 0) {
        const modelRowNumber = lastGIumRowRef + 3;
        const extraRows = contractsExpiringThisWeek.length - 1;
        if (extraRows > 0) shiftRowsDown(wsConcentrado, modelRowNumber + 1, extraRows);

        const modelRow = wsConcentrado.getRow(modelRowNumber);
        const contractModelHeight = modelRow.height;
        const contractModelStyles: Record<number, any> = {};
        const contractModelNumFmt: Record<number, string> = {};
        for (let col = 1; col <= CONCENTRADO_LAST_COL; col++) {
          const cell = modelRow.getCell(col);
          contractModelStyles[col] = JSON.parse(JSON.stringify(cell.style || {}));
          if (cell.numFmt) contractModelNumFmt[col] = cell.numFmt;
        }

        const writeContractRow = (rn: number, worker: ContractExpiringWorker, index: number) => {
          const row = wsConcentrado.getRow(rn);
          if (contractModelHeight !== undefined) row.height = contractModelHeight;
          for (let col = 1; col <= CONCENTRADO_LAST_COL; col++) {
            const cell = row.getCell(col);
            cell.style = JSON.parse(JSON.stringify(contractModelStyles[col] || {}));
            if (contractModelNumFmt[col]) cell.numFmt = contractModelNumFmt[col];
          }
          row.getCell(9).value = index + 1;
          row.getCell(10).value = worker.position;
          row.getCell(15).value = worker.fullName;
          if (worker.contractStartDate !== null) {
            row.getCell(25).value = worker.contractStartDate;
            row.getCell(25).numFmt = "dd/mm/yyyy";
          } else row.getCell(25).value = null;
          if (worker.contractEndDate !== null) {
            row.getCell(28).value = worker.contractEndDate;
            row.getCell(28).numFmt = "dd/mm/yyyy";
          } else row.getCell(28).value = null;
          row.commit();

          contratoVencerRowByOwner.set(worker.ownerKey, rn);
        };

        for (let i = 0; i < contractsExpiringThisWeek.length; i++) {
          const rn = modelRowNumber + i;
          writeContractRow(rn, contractsExpiringThisWeek[i], i);
          mergeAndCenterRow(wsConcentrado, rn, 4, 5);
          mergeAndCenterRow(wsConcentrado, rn, 6, 7);
          mergeAndCenterRow(wsConcentrado, rn, 10, 14);
          mergeAndCenterRow(wsConcentrado, rn, 15, 24);
          mergeAndCenterRow(wsConcentrado, rn, 25, 27);
          mergeAndCenterRow(wsConcentrado, rn, 28, 30);
        }
      }

      const loanShift = loanPaymentRows.length;

      if (infonavitRows.length > 0) {
        const discountParts: string[] = [];

        for (const inf of infonavitRows) {
          const empId = Number(inf.EmployeeID);
          let totalDiasTrabajados = 0;
          let employeeRow: number | undefined;

          for (const pw of projectWorkers) {
            if (Number(pw.EmployeeID) === empId) {
              const mapped = concentradoRowByProjectPersonnel.get(pw.ProjectPersonnelID);
              if (mapped !== undefined) {
                employeeRow = mapped;
                totalDiasTrabajados = dayWorkedProject.get(pw.ProjectPersonnelID)?.size
                  || dayWorkedEmployee.get(empId)?.size
                  || 0;
                break;
              }
            }
          }
          if (employeeRow === undefined || totalDiasTrabajados === 0) {
            for (const bw of baseWorkers) {
              if (Number(bw.EmployeeID) === empId) {
                const mapped = concentradoRowByAssignment.get(Number(bw.AssignmentID));
                if (mapped !== undefined) {
                  employeeRow = mapped;
                  totalDiasTrabajados = dayWorkedAssignment.get(Number(bw.AssignmentID))?.size
                    || dayWorkedEmployee.get(empId)?.size
                    || 0;
                  break;
                }
              }
            }
          }

          if (totalDiasTrabajados <= 0) continue;

          const montoDiario = Number(inf.DailyAmount) || 0;
          const montoFinal = montoDiario * totalDiasTrabajados;
          const montoFormateado = montoFinal.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
          const nombreEmpleado = (inf.FullName || "NO DISPONIBLE").trim();

          discountParts.push(`SE DESCUENTA INFONAVIT A: ${nombreEmpleado} POR ${montoFormateado}`);

          if (employeeRow !== undefined) {
            addLoanAmountToConcentradoAB(wsConcentrado, employeeRow, montoFinal);
          }
        }

        if (discountParts.length > 0) {
          const discountRowNumber = lastSumRowNumber + 3 + loanShift - 3;
          const discountStartLetter = colLetter(INFONAVIT_DISCOUNT_LABEL_COL_START);
          const discountEndLetter = colLetter(INFONAVIT_DISCOUNT_LABEL_COL_END);

          const existingCell = wsConcentrado.getRow(discountRowNumber).getCell(INFONAVIT_DISCOUNT_LABEL_COL_START);
          const hasExisting = existingCell.value !== null && existingCell.value !== undefined && existingCell.value !== "";
          if (hasExisting) shiftRowsDown(wsConcentrado, discountRowNumber, 1);

          const summaryRow = wsConcentrado.getRow(discountRowNumber);
          const rangeStr = `${discountStartLetter}${discountRowNumber}:${discountEndLetter}${discountRowNumber}`;
          try { wsConcentrado.mergeCells(rangeStr); } catch {}

          const masterCell = summaryRow.getCell(INFONAVIT_DISCOUNT_LABEL_COL_START);
          masterCell.value = discountParts.join("\n");
          masterCell.font = { ...(masterCell.font || {}), bold: true };
          masterCell.alignment = {
            ...(masterCell.alignment || {}),
            horizontal: "center",
            vertical: "middle",
            wrapText: true
          };
          masterCell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: INFONAVIT_DISCOUNT_FILL_COLOR }
          };
          summaryRow.height = Math.max(15, discountParts.length * 15);
          summaryRow.commit();
        }
      }

      if (loanPaymentRows.length > 0) {
        const loanParts: string[] = [];
        for (const lp of loanPaymentRows) {
          const monto = Number(lp.Amount) || 0;
          const montoFormateado = monto.toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });
          const nombreEmpleado = (lp.FullName || "NO DISPONIBLE").trim();
          loanParts.push(
            `SE DESCUENTA PRÉSTAMO A: ${nombreEmpleado} POR ${montoFormateado}`
          );
        }

        if (loanParts.length > 0) {
          const loanSummaryRowNumber = infonavitRows.length > 0
            ? lastSumRowNumber + loanShift + 1
            : lastSumRowNumber + loanShift;

          const loanStartLetter = colLetter(INFONAVIT_DISCOUNT_LABEL_COL_START);
          const loanEndLetter = colLetter(INFONAVIT_DISCOUNT_LABEL_COL_END);

          const existingCell = wsConcentrado.getRow(loanSummaryRowNumber).getCell(INFONAVIT_DISCOUNT_LABEL_COL_START);
          const hasExisting = existingCell.value !== null && existingCell.value !== undefined && existingCell.value !== "";
          if (hasExisting) shiftRowsDown(wsConcentrado, loanSummaryRowNumber, 1);

          const loanSummaryRow = wsConcentrado.getRow(loanSummaryRowNumber);
          const rangeStr = `${loanStartLetter}${loanSummaryRowNumber}:${loanEndLetter}${loanSummaryRowNumber}`;
          try { wsConcentrado.mergeCells(rangeStr); } catch {}

          const masterCell = loanSummaryRow.getCell(INFONAVIT_DISCOUNT_LABEL_COL_START);
          masterCell.value = loanParts.join("\n");
          masterCell.font = { ...(masterCell.font || {}), bold: true };
          masterCell.alignment = {
            ...(masterCell.alignment || {}),
            horizontal: "center",
            vertical: "middle",
            wrapText: true
          };
          masterCell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: LOAN_DISCOUNT_FILL_COLOR }
          };
          loanSummaryRow.height = Math.max(15, loanParts.length * 15);
          loanSummaryRow.commit();
        }
      }
    }

    // ============================================================
    // PEGAR UN RECIBO POR EMPLEADO EN LA MISMA HOJA RECIBOS
    // ============================================================
    if (wsRecibos && reciboModel) {
      interface ReciboEmpleado {
        employeeId: number | null;
        ownerKey: string;
        fullName: string;
        position: string;
        areaLaboral: string;
        rfc: string;
        nss: string;
        salaryIMSS: number | null;
        salarioDiario: number | null;
        totalHN: number;
        totalHE: number;
        diasTrabajados: number;
        infonavitMonto: number;
        prestamoMonto: number;
        contractStartDate: number | null;
      }

      const recibosMap = new Map<string, ReciboEmpleado>();

      for (const w of projectWorkers) {
        const key = `PP:${w.ProjectPersonnelID}`;
        const eid = Number(w.EmployeeID);
        const totalHN = regularHoursEmployee.get(eid) || 0;
        const totalHE = extraHoursTotalEmployee.get(eid) || 0;
        const dias = (dayWorkedProject.get(w.ProjectPersonnelID)?.size) || (dayWorkedEmployee.get(eid)?.size) || 0;
        const salary = w.SalaryIMSS !== null && w.SalaryIMSS !== undefined ? Number(w.SalaryIMSS) : null;
        recibosMap.set(key, {
          employeeId: eid,
          ownerKey: key,
          fullName: (w.FullName || "NO DISPONIBLE").trim(),
          position: (w.Position || "").trim(),
          areaLaboral: projectAreaDeTrabajo,
          rfc: (w.RFC || "").trim(),
          nss: (w.NSS || "").trim(),
          salaryIMSS: salary,
          salarioDiario: salary !== null ? salary / 5 : null,
          totalHN, totalHE, diasTrabajados: dias,
          infonavitMonto: 0, prestamoMonto: 0,
          contractStartDate: toExcelSerial(w.ContractStartDate),
        });
      }

      for (const b of baseWorkers) {
        const key = `AS:${b.AssignmentID}`;
        const eid = Number(b.EmployeeID);
        const totalHN = regularHoursEmployee.get(eid) || 0;
        const totalHE = extraHoursTotalEmployee.get(eid) || 0;
        const dias = (dayWorkedAssignment.get(Number(b.AssignmentID))?.size) || (dayWorkedEmployee.get(eid)?.size) || 0;
        const salary = b.SalaryIMSS !== null && b.SalaryIMSS !== undefined ? Number(b.SalaryIMSS) : null;
        recibosMap.set(key, {
          employeeId: eid,
          ownerKey: key,
          fullName: (b.FullName || "NO DISPONIBLE").trim(),
          position: (b.Position || "").trim(),
          areaLaboral: projectAreaDeTrabajo,
          rfc: (b.RFC || "").trim(),
          nss: (b.NSS || "").trim(),
          salaryIMSS: salary,
          salarioDiario: salary !== null ? salary / 5 : null,
          totalHN, totalHE, diasTrabajados: dias,
          infonavitMonto: 0, prestamoMonto: 0,
          contractStartDate: toExcelSerial(b.AssignmentStartDate),
        });
      }

      for (const inf of infonavitRows) {
        const empId = Number(inf.EmployeeID);
        let dias = 0;
        for (const w of projectWorkers) {
          if (Number(w.EmployeeID) === empId) {
            dias = (dayWorkedProject.get(w.ProjectPersonnelID)?.size) || (dayWorkedEmployee.get(empId)?.size) || 0;
            break;
          }
        }
        if (dias === 0) {
          for (const b of baseWorkers) {
            if (Number(b.EmployeeID) === empId) {
              dias = (dayWorkedAssignment.get(Number(b.AssignmentID))?.size) || (dayWorkedEmployee.get(empId)?.size) || 0;
              break;
            }
          }
        }
        const montoFinal = dias > 0 ? (Number(inf.DailyAmount) || 0) * dias : 0;
        for (const rec of recibosMap.values()) {
          if (rec.employeeId === empId) rec.infonavitMonto += montoFinal;
        }
      }

      for (const lp of loanPaymentRows) {
        const empId = Number(lp.EmployeeID);
        for (const rec of recibosMap.values()) {
          if (rec.employeeId === empId) rec.prestamoMonto += Number(lp.Amount) || 0;
        }
      }

      const mergeSet = new Set(reciboModel.merges);
      for (const r of RECIBO_EXTRA_MERGES) mergeSet.add(r);
      reciboModel.merges = Array.from(mergeSet);

      let blockIndex = 0;
      for (const rec of recibosMap.values()) {
        const overrides: Record<string, any> = {};

        overrides[`${RECIBO_ID_ROW}:${RECIBO_ID_COL}`] = blockIndex + 1;
        overrides[`${RECIBO_NOMBRE_ROW}:${RECIBO_NOMBRE_START_COL}`] = rec.fullName;
        overrides[`${RECIBO_PERIODO_ROW}:${RECIBO_PERIODO_COL}`] = periodoTextoParaRecibos;

        overrides[`${RECIBO_PUESTO_ROW}:${RECIBO_PUESTO_COL}`] = rec.position;
        overrides[`${RECIBO_AREA_ROW}:${RECIBO_AREA_COL}`] = rec.areaLaboral;
        overrides[`${RECIBO_RFC_ROW}:${RECIBO_RFC_COL}`] = rec.rfc;
        overrides[`${RECIBO_NSS_ROW}:${RECIBO_NSS_COL}`] = rec.nss;

        overrides[`${RECIBO_SALARIO_DIARIO_ROW}:${RECIBO_SALARIO_DIARIO_COL}`] = rec.salarioDiario;
        overrides[`${RECIBO_DIAS_TRABAJADOS_ROW}:${RECIBO_DIAS_TRABAJADOS_COL}`] = rec.diasTrabajados;
        overrides[`${RECIBO_SEMANA_ROW}:${RECIBO_SEMANA_COL}`] = weekNumberValue === "" ? null : weekNumberValue;
        overrides[`${RECIBO_HORAS_EXTRAS_ROW}:${RECIBO_HORAS_EXTRAS_COL}`] = rec.totalHE;
        overrides[`${RECIBO_FECHA_INICIO_ROW}:${RECIBO_FECHA_INICIO_COL}`] = rec.contractStartDate;

        overrides[`${RECIBO_PERIODO_A8_ROW}:${RECIBO_PERIODO_A8_COL}`] = periodoTextoParaRecibos;
        overrides[`${RECIBO_NOMBRE_A16_ROW}:${RECIBO_NOMBRE_A16_COL}`] = rec.fullName;

        for (const dyn of RECIBO_DYNAMIC_CELLS) {
          let value: any = null;
          switch (dyn.key) {
            case "fullName": value = rec.fullName; break;
            case "position": value = rec.position; break;
            case "salaryIMSS": value = rec.salaryIMSS ?? null; break;
            case "totalHN": value = rec.totalHN; break;
            case "totalHE": value = rec.totalHE; break;
            case "diasTrabajados": value = rec.diasTrabajados; break;
            case "infonavit": value = rec.infonavitMonto; break;
            case "prestamo": value = rec.prestamoMonto; break;
            case "periodo": value = periodoTextoParaRecibos; break;
            default: value = null;
          }
          overrides[`${dyn.row}:${dyn.col}`] = value;
        }

        pasteBlock(wsRecibos, reciboModel, blockIndex, RECIBO_HEIGHT, overrides);

        const blockRowOffset = blockIndex * RECIBO_HEIGHT;

        const e5AbsRow  = RECIBO_DIAS_TRABAJADOS_ROW + blockRowOffset;
        const k10AbsRow = RECIBO_FORMULA_K10_ROW + blockRowOffset;
        const k11AbsRow = RECIBO_FORMULA_K11_ROW + blockRowOffset;
        const k13AbsRow = RECIBO_FORMULA_K13_ROW + blockRowOffset;
        const eAbsRow   = RECIBO_SALARIO_DIARIO_ROW + blockRowOffset;

        const k10Cell = wsRecibos.getRow(k10AbsRow).getCell(RECIBO_FORMULA_K10_COL);
        k10Cell.value = { formula: `E${eAbsRow}*5/7*6` } as any;
        wsRecibos.getRow(k10AbsRow).commit();

        const k11Cell = wsRecibos.getRow(k11AbsRow).getCell(RECIBO_FORMULA_K11_COL);
        k11Cell.value = { formula: `E${eAbsRow}*5/7` } as any;
        wsRecibos.getRow(k11AbsRow).commit();

        const k12AbsRow = RECIBO_FORMULA_K12_ROW + blockRowOffset;
        const concentradoRowForEmployee = concentradoRowByOwner.get(rec.ownerKey);
        const k12Cell = wsRecibos.getRow(k12AbsRow).getCell(RECIBO_FORMULA_K12_COL);
        if (concentradoRowForEmployee !== undefined) {
          k12Cell.value = { formula: `CONCENTRADO!W${concentradoRowForEmployee}` } as any;
        } else {
          k12Cell.value = null;
        }
        wsRecibos.getRow(k12AbsRow).commit();

        const k13Cell = wsRecibos.getRow(k13AbsRow).getCell(RECIBO_FORMULA_K13_COL);
        if (concentradoRowForEmployee !== undefined) {
          k13Cell.value = { formula: `CONCENTRADO!AA${concentradoRowForEmployee}` } as any;
        } else {
          k13Cell.value = null;
        }
        wsRecibos.getRow(k13AbsRow).commit();

        const k14AbsRow = RECIBO_FORMULA_K14_ROW + blockRowOffset;
        const registroRowForEmployee = registroRowByOwner.get(rec.ownerKey);
        const k14Cell = wsRecibos.getRow(k14AbsRow).getCell(RECIBO_FORMULA_K14_COL);
        if (registroRowForEmployee !== undefined) {
          k14Cell.value = { formula: `'HOJA_DE_REGISTRO'!I${registroRowForEmployee}` } as any;
        } else {
          k14Cell.value = null;
        }
        wsRecibos.getRow(k14AbsRow).commit();

        const m10AbsRow = RECIBO_FORMULA_M10_ROW + blockRowOffset;
        const m10Cell = wsRecibos.getRow(m10AbsRow).getCell(RECIBO_FORMULA_M10_COL);
        m10Cell.value = { formula: `(E${e5AbsRow}*1.2)*(K${k10AbsRow}/6)` } as any;
        wsRecibos.getRow(m10AbsRow).commit();

        const m11AbsRow = RECIBO_FORMULA_M11_ROW + blockRowOffset;
        const m11Cell = wsRecibos.getRow(m11AbsRow).getCell(RECIBO_FORMULA_M11_COL);
        m11Cell.value = { formula: `(K${k11AbsRow}/6)*(E${e5AbsRow}*1.2)` } as any;
        wsRecibos.getRow(m11AbsRow).commit();

        const m13AbsRow = RECIBO_FORMULA_M13_ROW + blockRowOffset;
        const m13Cell = wsRecibos.getRow(m13AbsRow).getCell(RECIBO_FORMULA_M13_COL);
        m13Cell.value = { formula: `K${k13AbsRow}` } as any;
        wsRecibos.getRow(m13AbsRow).commit();

        const m12AbsRow = RECIBO_FORMULA_M12_ROW + blockRowOffset;
        const m12Cell = wsRecibos.getRow(m12AbsRow).getCell(RECIBO_FORMULA_M12_COL);
        if (concentradoRowForEmployee !== undefined) {
          m12Cell.value = { formula: `CONCENTRADO!Y${concentradoRowForEmployee}` } as any;
        } else {
          m12Cell.value = null;
        }
        wsRecibos.getRow(m12AbsRow).commit();

        const m14AbsRow = RECIBO_FORMULA_M14_ROW + blockRowOffset;
        const m14Cell = wsRecibos.getRow(m14AbsRow).getCell(RECIBO_FORMULA_M14_COL);
        if (concentradoRowForEmployee !== undefined) {
          m14Cell.value = { formula: `CONCENTRADO!Z${concentradoRowForEmployee}` } as any;
        } else {
          m14Cell.value = null;
        }
        wsRecibos.getRow(m14AbsRow).commit();

        const m15AbsRow = RECIBO_FORMULA_M15_ROW + blockRowOffset;
        const m15Cell = wsRecibos.getRow(m15AbsRow).getCell(RECIBO_FORMULA_M15_COL);
        if (concentradoRowForEmployee !== undefined) {
          m15Cell.value = { formula: `CONCENTRADO!AB${concentradoRowForEmployee}` } as any;
        } else {
          m15Cell.value = null;
        }
        wsRecibos.getRow(m15AbsRow).commit();

        const m16AbsRow = RECIBO_FORMULA_M16_ROW + blockRowOffset;
        const m16Cell = wsRecibos.getRow(m16AbsRow).getCell(RECIBO_FORMULA_M16_COL);
        m16Cell.value = {
          formula: `M${m10AbsRow}+M${m11AbsRow}+M${m12AbsRow}+M${m13AbsRow}+M${m14AbsRow}+M${m15AbsRow}`
        } as any;
        wsRecibos.getRow(m16AbsRow).commit();

        const e4Cell = wsRecibos.getRow(RECIBO_SALARIO_DIARIO_ROW + blockRowOffset).getCell(RECIBO_SALARIO_DIARIO_COL);
        if (typeof e4Cell.value === "number") {
          e4Cell.numFmt = '"$"#,##0.00';
        }

        const m4Cell = wsRecibos.getRow(RECIBO_FECHA_INICIO_ROW + blockRowOffset).getCell(RECIBO_FECHA_INICIO_COL);
        if (typeof m4Cell.value === "number") {
          m4Cell.numFmt = "dd/mm/yyyy";
        }

        blockIndex++;
      }
    }

    // ============================================================
    // PEGAR UN FINIQUITO POR CADA TRABAJADOR CON CONTRATO VENCIDO
    // EN LA HOJA FINIQUITOS (bloque de 45 filas × 6 columnas)
    // ============================================================
    if (wsFiniquitos && finiquitoModel && contractsExpiringThisWeek.length > 0) {
      const finiquitoMergeSet = new Set(finiquitoModel.merges);
      for (const r of FINIQUITO_EXTRA_MERGES) finiquitoMergeSet.add(r);
      finiquitoModel.merges = Array.from(finiquitoMergeSet);

      let finiquitoBlockIndex = 0;
      for (const w of contractsExpiringThisWeek) {
        const overrides: Record<string, any> = {};

        overrides[`${FINIQUITO_NOMBRE_ROW}:${FINIQUITO_NOMBRE_COL}`] = w.fullName;
        overrides[`${FINIQUITO_PUESTO_ROW}:${FINIQUITO_PUESTO_COL}`] = w.position;

        for (const dyn of FINIQUITO_DYNAMIC_CELLS) {
          let value: any = null;
          switch (dyn.key) {
            case "fullName": value = w.fullName; break;
            case "position": value = w.position; break;
            case "fechaInicio": value = w.contractStartDate; break;
            case "fechaFin": value = w.contractEndDate; break;
            case "salaryIMSS": value = w.salaryIMSS ?? null; break;
            case "salarioDiario": value = w.salarioDiario ?? null; break;
            case "rfc": value = w.rfc; break;
            case "nss": value = w.nss; break;
            default: value = null;
          }
          overrides[`${dyn.row}:${dyn.col}`] = value;
        }

        pasteBlock(wsFiniquitos, finiquitoModel, finiquitoBlockIndex, FINIQUITO_HEIGHT, overrides);

        const blockRowOffset = finiquitoBlockIndex * FINIQUITO_HEIGHT;

        const b3AbsRow  = FINIQUITO_NOMBRE_ROW + blockRowOffset;
        const b5AbsRow  = FINIQUITO_FORMULA_FECHA_INICIO_ROW + blockRowOffset;
        const b6AbsRow  = FINIQUITO_FORMULA_FECHA_FIN_ROW + blockRowOffset;
        const b7AbsRow  = FINIQUITO_FORMULA_DIAS_ROW + blockRowOffset;
        const b8AbsRow  = FINIQUITO_FORMULA_SALARIO_ROW + blockRowOffset;
        const b9AbsRow  = FINIQUITO_FORMULA_SALARIO_DIA_ROW + blockRowOffset;
        const b13AbsRow = FINIQUITO_FORMULA_B13_ROW + blockRowOffset;
        const b14AbsRow = FINIQUITO_FORMULA_B14_ROW + blockRowOffset;
        const c13AbsRow = FINIQUITO_FORMULA_C13_ROW + blockRowOffset;
        const c14AbsRow = FINIQUITO_FORMULA_C14_ROW + blockRowOffset;
        const c15AbsRow = FINIQUITO_FORMULA_C15_ROW + blockRowOffset;
        const c18AbsRow = FINIQUITO_FORMULA_C18_ROW + blockRowOffset;
        const c24AbsRow = FINIQUITO_FORMULA_C24_ROW + blockRowOffset;
        const c26AbsRow = FINIQUITO_FORMULA_C26_ROW + blockRowOffset;
        const c29AbsRow = FINIQUITO_FORMULA_C29_ROW + blockRowOffset;
        const d31AbsRow = FINIQUITO_FORMULA_D31_ROW + blockRowOffset;
        const f31AbsRow = FINIQUITO_FORMULA_F31_ROW + blockRowOffset;
        const b38AbsRow = FINIQUITO_FORMULA_B38_ROW + blockRowOffset;
        const a43AbsRow = FINIQUITO_FORMULA_A43_ROW + blockRowOffset;
        const a30AbsRow = FINIQUITO_LETRA_ROW + blockRowOffset;

        const contratoVencerRow = contratoVencerRowByOwner.get(w.ownerKey);
        const concentradoRowForEmployee = concentradoRowByOwner.get(w.ownerKey);

        const b5Cell = wsFiniquitos.getRow(b5AbsRow).getCell(FINIQUITO_FORMULA_FECHA_INICIO_COL);
        if (contratoVencerRow !== undefined) {
          b5Cell.value = { formula: `CONCENTRADO!Y${contratoVencerRow}` } as any;
          b5Cell.numFmt = "dd/mm/yyyy";
        } else {
          b5Cell.value = null;
        }
        wsFiniquitos.getRow(b5AbsRow).commit();

        const b6Cell = wsFiniquitos.getRow(b6AbsRow).getCell(FINIQUITO_FORMULA_FECHA_FIN_COL);
        if (contratoVencerRow !== undefined) {
          b6Cell.value = { formula: `CONCENTRADO!AB${contratoVencerRow}` } as any;
          b6Cell.numFmt = "dd/mm/yyyy";
        } else {
          b6Cell.value = null;
        }
        wsFiniquitos.getRow(b6AbsRow).commit();

        const b7Cell = wsFiniquitos.getRow(b7AbsRow).getCell(FINIQUITO_FORMULA_DIAS_COL);
        b7Cell.value = { formula: `B${b6AbsRow}-B${b5AbsRow}+1` } as any;
        wsFiniquitos.getRow(b7AbsRow).commit();

        const b8Cell = wsFiniquitos.getRow(b8AbsRow).getCell(FINIQUITO_FORMULA_SALARIO_COL);
        if (concentradoRowForEmployee !== undefined) {
          b8Cell.value = { formula: `CONCENTRADO!D${concentradoRowForEmployee}` } as any;
          b8Cell.numFmt = '"$"#,##0.00';
        } else {
          b8Cell.value = null;
        }
        wsFiniquitos.getRow(b8AbsRow).commit();

        const b9Cell = wsFiniquitos.getRow(b9AbsRow).getCell(FINIQUITO_FORMULA_SALARIO_DIA_COL);
        b9Cell.value = { formula: `B${b8AbsRow}/7` } as any;
        b9Cell.numFmt = '"$"#,##0.00';
        wsFiniquitos.getRow(b9AbsRow).commit();

        const b13Cell = wsFiniquitos.getRow(b13AbsRow).getCell(FINIQUITO_FORMULA_B13_COL);
        b13Cell.value = { formula: `B${b7AbsRow}/365*15` } as any;
        wsFiniquitos.getRow(b13AbsRow).commit();

        const b14Cell = wsFiniquitos.getRow(b14AbsRow).getCell(FINIQUITO_FORMULA_B14_COL);
        b14Cell.value = { formula: `B${b7AbsRow}/365*12` } as any;
        wsFiniquitos.getRow(b14AbsRow).commit();

        const c13Cell = wsFiniquitos.getRow(c13AbsRow).getCell(FINIQUITO_FORMULA_C13_COL);
        c13Cell.value = { formula: `B${b13AbsRow}*B${b9AbsRow}` } as any;
        wsFiniquitos.getRow(c13AbsRow).commit();

        const c14Cell = wsFiniquitos.getRow(c14AbsRow).getCell(FINIQUITO_FORMULA_C14_COL);
        c14Cell.value = { formula: `B${b14AbsRow}*B${b9AbsRow}` } as any;
        wsFiniquitos.getRow(c14AbsRow).commit();

        const c15Cell = wsFiniquitos.getRow(c15AbsRow).getCell(FINIQUITO_FORMULA_C15_COL);
        c15Cell.value = { formula: `(C${c14AbsRow}*25%)` } as any;
        wsFiniquitos.getRow(c15AbsRow).commit();

        const c18Cell = wsFiniquitos.getRow(c18AbsRow).getCell(FINIQUITO_FORMULA_C18_COL);
        c18Cell.value = { formula: `SUM(C${c13AbsRow}:C${c13AbsRow + 3})` } as any;
        wsFiniquitos.getRow(c18AbsRow).commit();

        const c24Cell = wsFiniquitos.getRow(c24AbsRow).getCell(FINIQUITO_FORMULA_C24_COL);
        c24Cell.value = { formula: `SUM(C${c24AbsRow - 3}:C${c24AbsRow - 1})` } as any;
        wsFiniquitos.getRow(c24AbsRow).commit();

        const c26Cell = wsFiniquitos.getRow(c26AbsRow).getCell(FINIQUITO_FORMULA_C26_COL);
        c26Cell.value = { formula: `C${c18AbsRow}-C${c24AbsRow}` } as any;
        wsFiniquitos.getRow(c26AbsRow).commit();

        const c29Cell = wsFiniquitos.getRow(c29AbsRow).getCell(FINIQUITO_FORMULA_C29_COL);
        c29Cell.value = { formula: `C${c26AbsRow}` } as any;
        c29Cell.numFmt = '"$"#,##0.00';
        wsFiniquitos.getRow(c29AbsRow).commit();

        // ★ NUEVO: escribir C26 del finiquito en CONCENTRADO!AC del empleado
        //   Se usa la fila absoluta del bloque de finiquito (c26AbsRow) para
        //   que la referencia funcione con múltiples bloques apilados.
        if (concentradoRowForEmployee !== undefined) {
          const acCell = wsConcentrado!.getRow(concentradoRowForEmployee).getCell(CONCENTRADO_FINIQUITO_TOTAL_COL);
          acCell.value = { formula: `FINIQUITOS!C${c26AbsRow}` } as any;
          acCell.numFmt = '"$"#,##0.00';
          wsConcentrado!.getRow(concentradoRowForEmployee).commit();
        }

        // A30 → cantidad de C29 con letra en MAYÚSCULAS
        try {
          let diasContrato = 0;
          if (w.contractStartDate !== null && w.contractEndDate !== null) {
            diasContrato = (w.contractEndDate - w.contractStartDate) + 1;
            if (diasContrato < 0) diasContrato = 0;
          }
          const salIMSS = w.salaryIMSS !== null && isFinite(Number(w.salaryIMSS)) ? Number(w.salaryIMSS) : 0;
          const salSemanal = salIMSS / 7;
          const b13Val = (diasContrato / 365) * 15;
          const b14Val = (diasContrato / 365) * 12;
          const c13Val = b13Val * salSemanal;
          const c14Val = b14Val * salSemanal;
          const c15Val = c14Val * 0.25;
          const c18Val = c13Val + c14Val + c15Val;
          const c24Val = 0;
          const c26Val = c18Val - c24Val;
          const c29Val = c26Val;

          const a30Text = montoALetrasMXN(c29Val);
          const a30Cell = wsFiniquitos.getRow(a30AbsRow).getCell(FINIQUITO_LETRA_COL);
          a30Cell.value = a30Text;
          wsFiniquitos.getRow(a30AbsRow).commit();
        } catch (e) {
          const a30Cell = wsFiniquitos.getRow(a30AbsRow).getCell(FINIQUITO_LETRA_COL);
          a30Cell.value = null;
          wsFiniquitos.getRow(a30AbsRow).commit();
        }

        const d31Cell = wsFiniquitos.getRow(d31AbsRow).getCell(FINIQUITO_FORMULA_D31_COL);
        d31Cell.value = { formula: `B${b5AbsRow}` } as any;
        d31Cell.numFmt = "dd/mm/yyyy";
        wsFiniquitos.getRow(d31AbsRow).commit();

        // F31 → =B6
        const f31Cell = wsFiniquitos.getRow(f31AbsRow).getCell(FINIQUITO_FORMULA_F31_COL);
        f31Cell.value = { formula: `B${b6AbsRow}` } as any;
        f31Cell.numFmt = "dd/mm/yyyy";
        wsFiniquitos.getRow(f31AbsRow).commit();

        // B38 → fecha larga en MAYÚSCULAS calculada en TypeScript
        const b38Cell = wsFiniquitos.getRow(b38AbsRow).getCell(FINIQUITO_FORMULA_B38_COL);
        if (w.contractEndDate !== null && w.contractEndDate !== undefined) {
          const msInDay = 86400000;
          const epoch = Date.UTC(1899, 11, 30);
          const dateObj = new Date(epoch + w.contractEndDate * msInDay);
          b38Cell.value = formatFechaLargaEs(dateObj);
        } else {
          b38Cell.value = null;
        }
        wsFiniquitos.getRow(b38AbsRow).commit();

        const a43Cell = wsFiniquitos.getRow(a43AbsRow).getCell(FINIQUITO_FORMULA_A43_COL);
        a43Cell.value = { formula: `B${b3AbsRow}` } as any;
        wsFiniquitos.getRow(a43AbsRow).commit();

        for (const dyn of FINIQUITO_DYNAMIC_CELLS) {
          const absRow = dyn.row + blockRowOffset;
          const cell = wsFiniquitos.getRow(absRow).getCell(dyn.col);
          if (dyn.key === "fechaInicio" || dyn.key === "fechaFin") {
            if (typeof cell.value === "number") cell.numFmt = "dd/mm/yyyy";
          } else if (dyn.key === "salaryIMSS" || dyn.key === "salarioDiario" || dyn.key === "totalPagar") {
            if (typeof cell.value === "number") cell.numFmt = '"$"#,##0.00';
          }
          wsFiniquitos.getRow(absRow).commit();
        }

        finiquitoBlockIndex++;
      }
    }

    // ============================================================
    // Cabecera de la hoja REPORTE_PERSONAL
    // ============================================================
    ws.getCell("H6").value = projectName;
    ws.getCell("AD6").value = projectName;
    ws.getCell("H7").value = projectOC ?? "";
    ws.getCell("AD7").value = projectOC ?? "";
    ws.getCell("M9").value = projectAddress;
    ws.getCell("AI9").value = projectAddress;
    ws.getCell("D10").value = weekNumberValue;
    ws.getCell("Z10").value = weekNumberValue;

    const serial = toExcelSerial(startDateValue);
    if (serial !== null) {
      ws.getCell("E11").value = serial;
      ws.getCell("AA11").value = serial;
    } else {
      ws.getCell("E11").value = null;
      ws.getCell("AA11").value = serial;
    }

    // ============================================================
    // Agrupar filas de nómina por empleado (REPORTE_PERSONAL)
    // ============================================================
    type EmployeeKey = string;
    interface EmpGroup {
      periodId: number; ownerId: string; employeeId: number | null;
      fullName: string; position: string | null; shift: "DIA" | "NOCHE";
      days: Record<number, { hn: number; he: number }>; diasViaticos: number;
    }
    const groups = new Map<EmployeeKey, EmpGroup>();

    for (const r of rows) {
      const shift: "DIA" | "NOCHE" = r.Shift === "NOCHE" ? "NOCHE" : "DIA";
      const ownerId = r.ProjectPersonnelID !== null && r.ProjectPersonnelID !== undefined
        ? `PP:${r.ProjectPersonnelID}`
        : r.AssignmentID !== null && r.AssignmentID !== undefined
          ? `AS:${r.AssignmentID}`
          : `EM:${r.EmployeeID ?? "NULL"}`;
      const key = `${r.PayrollPeriodID}::${ownerId}::${shift}`;
      let g = groups.get(key);
      if (!g) {
        g = {
          periodId: r.PayrollPeriodID, ownerId,
          employeeId: r.EmployeeID ?? null,
          fullName: r.FullName || "NO DISPONIBLE",
          position: r.Position || null,
          shift, days: {}, diasViaticos: 0
        };
        groups.set(key, g);
      }
      const workYmd = ymdOf(r.WorkDate);
      if (workYmd) {
        const dayIdx = jsDayFromYmd(workYmd);
        if (!g.days[dayIdx]) g.days[dayIdx] = { hn: 0, he: 0 };
        g.days[dayIdx].hn += Number(r.RegularHours) || 0;
        g.days[dayIdx].he += Number(r.ExtraHours) || 0;
      }
      const dv = Number(r.DiasViaticos) || 0;
      if (dv > g.diasViaticos) g.diasViaticos = dv;
    }

    const allGroups = Array.from(groups.values());
    const dayGroups = allGroups.filter(g => g.shift === "DIA");
    const nightGroups = allGroups.filter(g => g.shift === "NOCHE");

    const COLUMN_COUNT = Math.max(ws.columnCount || 0, LAST_DATA_COL_ABS);
    const modelRow = ws.getRow(START_ROW);
    const modelHeight = modelRow.height;

    const dayModelStyles: any[] = [];
    for (let col = 1; col <= REL_LAST_DATA_COL; col++) {
      dayModelStyles[col] = JSON.parse(JSON.stringify(modelRow.getCell(col).style || {}));
    }
    const nightModelStyles: any[] = [];
    for (let col = 1; col <= REL_LAST_DATA_COL; col++) {
      const absCol = NIGHT_BLOCK_OFFSET + col;
      nightModelStyles[col] = JSON.parse(JSON.stringify(modelRow.getCell(absCol).style || {}));
    }

    const maxRowToClean = Math.max(ws.rowCount, START_ROW);
    for (let rn = START_ROW; rn <= maxRowToClean; rn++) {
      const row = ws.getRow(rn);
      for (let relCol = REL_FIRST_DATA_COL; relCol <= REL_LAST_DATA_COL; relCol++) {
        const absCol = NIGHT_BLOCK_OFFSET + relCol;
        const cell = row.getCell(absCol);
        cell.value = null;
        cell.style = {};
      }
      row.commit();
    }

    const mergesToRemove: string[] = [];
    // @ts-ignore
    const merges: Record<string, any> = (ws as any)._merges || {};
    for (const range of Object.keys(merges)) {
      const match = range.match(/^([A-Z]+)(\d+):([A-Z]+)(\d+)$/);
      if (!match) continue;
      const startColLetter = match[1];
      const startRowNum = parseInt(match[2], 10);
      if (startRowNum < START_ROW) continue;
      let colNum = 0;
      for (let i = 0; i < startColLetter.length; i++) {
        colNum = colNum * 26 + (startColLetter.charCodeAt(i) - 64);
      }
      if (colNum >= NIGHT_BLOCK_OFFSET + REL_FIRST_DATA_COL) mergesToRemove.push(range);
    }
    for (const range of mergesToRemove) {
      try { ws.unMergeCells(range); } catch {}
    }

    function writeBlock(groupsList: EmpGroup[], blockOffset: number, modelStyles: any[]): BlockResult {
      let currentRow = START_ROW;
      let employeeIndex = 1;
      const firstEmployeeRow = START_ROW;

      for (const emp of groupsList) {
        const row = ws.getRow(currentRow);
        clearSharedFormulasInRow(row, blockOffset + REL_FIRST_DATA_COL, blockOffset + REL_LAST_DATA_COL);
        row.height = modelHeight;
        for (let relCol = REL_FIRST_DATA_COL; relCol <= REL_LAST_DATA_COL; relCol++) {
          const absCol = blockOffset + relCol;
          row.getCell(absCol).style = JSON.parse(JSON.stringify(modelStyles[relCol] || {}));
        }
        const absNumCol = blockCol(1, blockOffset);
        const absNameCol = blockCol(2, blockOffset);
        const absPosCol = blockCol(3, blockOffset);
        row.getCell(absNumCol).value = employeeIndex;
        row.getCell(absNameCol).value = emp.fullName;
        row.getCell(absPosCol).value = emp.position || "";
        for (const { dayIndex, hn, he } of DAY_COLUMNS_REL) {
          const data = emp.days[dayIndex] || { hn: 0, he: 0 };
          row.getCell(blockCol(hn, blockOffset)).value = data.hn;
          row.getCell(blockCol(he, blockOffset)).value = data.he;
        }
        row.getCell(blockCol(REL_TOTAL_HN_COL, blockOffset)).value = { formula: buildTotalHNFormula(currentRow, blockOffset) } as any;
        row.getCell(blockCol(REL_TOTAL_HE_COL, blockOffset)).value = { formula: buildTotalHEFormula(currentRow, blockOffset) } as any;
        row.getCell(blockCol(REL_TOPPED_HE_COL, blockOffset)).value = { formula: buildToppedHEFormula(currentRow, blockOffset) } as any;
        row.getCell(blockCol(REL_EXCESS_HE_COL, blockOffset)).value = { formula: buildExcessHEFormula(currentRow, blockOffset) } as any;
        row.getCell(blockCol(REL_VIATICOS_COL, blockOffset)).value = emp.diasViaticos;
        row.commit();
        currentRow++;
        employeeIndex++;
      }
      const lastEmployeeRow = currentRow - 1;
      return { firstEmployeeRow, lastEmployeeRow, nextRow: currentRow };
    }

    const dayBlock: BlockResult = writeBlock(dayGroups, DAY_BLOCK_OFFSET, dayModelStyles);
    const nightBlock: BlockResult = writeBlock(nightGroups, NIGHT_BLOCK_OFFSET, nightModelStyles);

    const summaryRelCols = [
      4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17,
      REL_TOTAL_HN_COL, REL_TOTAL_HE_COL, REL_TOPPED_HE_COL, REL_EXCESS_HE_COL, REL_VIATICOS_COL
    ];

    function writeSummaryAndSignatures(
      block: BlockResult, blockOffset: number, modelStyles: any[],
      adminNameVal: string, pmNameVal: string, smNameVal: string
    ): number {
      const summaryRowNumber = block.lastEmployeeRow + 1;
      const summaryRow = ws.getRow(summaryRowNumber);
      clearSharedFormulasInRow(summaryRow, blockOffset + REL_FIRST_DATA_COL, blockOffset + REL_LAST_DATA_COL);

      for (const relCol of summaryRelCols) {
        const absCol = blockCol(relCol, blockOffset);
        const letter = colLetter(absCol);
        summaryRow.getCell(absCol).style = JSON.parse(JSON.stringify(modelStyles[relCol] || {}));
        summaryRow.getCell(absCol).value = { formula: `SUM(${letter}${block.firstEmployeeRow}:${letter}${block.lastEmployeeRow})` } as any;
        summaryRow.getCell(absCol).font = { ...(summaryRow.getCell(absCol).font || {}), bold: true };
      }
      summaryRow.commit();

      const sigRow = summaryRowNumber + 3;
      const sigColsRel: [number, number, string][] = [
        [1, 2, "ELABORA"], [4, 9, "REVISA"], [18, 22, "APROBACIÓN"]
      ];
      for (const [relStart, relEnd, label] of sigColsRel) {
        writeSignatureHeader(ws, sigRow, blockCol(relStart, blockOffset), blockCol(relEnd, blockOffset), label);
      }
      const lineRow = sigRow + 2;
      for (const [relStart, relEnd] of sigColsRel) {
        writeSignatureLine(ws, lineRow, blockCol(relStart, blockOffset), blockCol(relEnd, blockOffset));
      }
      const namesRow = sigRow + 3;
      writeSignatureName(ws, namesRow, blockCol(1, blockOffset), blockCol(2, blockOffset), adminNameVal);
      writeSignatureName(ws, namesRow, blockCol(4, blockOffset), blockCol(9, blockOffset), pmNameVal);
      writeSignatureName(ws, namesRow, blockCol(18, blockOffset), blockCol(22, blockOffset), smNameVal);
      return namesRow;
    }

    const dayNamesRow = writeSummaryAndSignatures(dayBlock, DAY_BLOCK_OFFSET, dayModelStyles, adminName, projectManagerName, siteManagerName);
    const nightNamesRow = writeSummaryAndSignatures(nightBlock, NIGHT_BLOCK_OFFSET, nightModelStyles, adminName, projectManagerName, siteManagerName);

    const lastWrittenRow = Math.max(dayNamesRow, nightNamesRow);
    const safeLastRow = Math.max(ws.rowCount, lastWrittenRow);
    const lastAbsCol = NIGHT_BLOCK_OFFSET + REL_LAST_DATA_COL;

    for (let rn = lastWrittenRow + 1; rn <= safeLastRow; rn++) {
      const row = ws.getRow(rn);
      let hasData = false;
      for (let col = 1; col <= lastAbsCol; col++) {
        const v = row.getCell(col).value;
        if (v !== null && v !== undefined && v !== "") { hasData = true; break; }
      }
      if (!hasData) continue;
      clearSharedFormulasInRow(row, 1, lastAbsCol);
      for (let col = 1; col <= lastAbsCol; col++) row.getCell(col).value = null;
      row.commit();
    }

    workbook.calcProperties.fullCalcOnLoad = true;

    const buffer = await workbook.xlsx.writeBuffer();
    const filename = periodId
      ? `NOMINA_${projectId}_SEM_${periodId}.xlsx`
      : `NOMINA_${projectId}.xlsx`;

    return new NextResponse(buffer as ArrayBuffer, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error("Error al generar NOMINA:", error);
    return NextResponse.json({ success: false, message: error.sqlMessage || error.message || "Error al generar el documento" }, { status: 500 });
  } finally {
    if (connection) connection.release();
  }
}