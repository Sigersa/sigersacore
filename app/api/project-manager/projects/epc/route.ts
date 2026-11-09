import { NextRequest, NextResponse } from "next/server";
import { getConnection } from "@/lib/db";
import { validateAndRenewSession } from "@/lib/auth";
import { RowDataPacket, ResultSetHeader } from "mysql2";

// ============ INTERFACES ============

interface EPCRequestBody {
  epcId?: number | string;
  projectId: number | string;
  advance: number | string;
  amount: number | string;
  weekNumber: number | string;
  estimateNumber: number | string;
  date: string;
}

interface EPCRow extends RowDataPacket {
  EPCID: number;
  ProjectID: number;
  Advance: number | null;
  Amount: number | null;
  WeekNumber: number | null;
  EstimateNumber: number | null;
  Date: string | Date | null;
}

// ============ UTILIDADES ============

function normalizeNumber(value: number | string, fieldName: string): number {
  if (value === null || value === undefined || value === "") {
    throw new Error(`El campo "${fieldName}" es obligatorio`);
  }
  let cleaned: number | string = value;
  if (typeof value === "string") {
    cleaned = value.replace(/,/g, "").replace(/\s/g, "").trim();
  }
  const parsed = typeof cleaned === "number" ? cleaned : Number(cleaned);
  if (!Number.isFinite(parsed)) {
    throw new Error(`El campo "${fieldName}" debe ser un número válido`);
  }
  return parsed;
}

function normalizeDate(value: string, fieldName: string): string {
  if (value === null || value === undefined || value === "") {
    throw new Error(`El campo "${fieldName}" es obligatorio`);
  }
  const trimmed = String(value).trim();
  // Acepta formatos YYYY-MM-DD o ISO (YYYY-MM-DDTHH:mm...)
  const datePart = trimmed.split("T")[0];
  const regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!regex.test(datePart)) {
    throw new Error(`El campo "${fieldName}" debe tener formato YYYY-MM-DD`);
  }
  const parsed = new Date(datePart + "T00:00:00");
  if (isNaN(parsed.getTime())) {
    throw new Error(`El campo "${fieldName}" no es una fecha válida`);
  }
  return datePart;
}

async function checkSession(request: NextRequest) {
  const sessionId = request.cookies.get("session")?.value;
  if (!sessionId) {
    return { ok: false as const, status: 401, message: "NO AUTORIZADO" };
  }
  const user = await validateAndRenewSession(sessionId);
  if (!user) {
    return { ok: false as const, status: 401, message: "SESIÓN INVÁLIDA O EXPIRADA" };
  }
  return { ok: true as const, user };
}

// ============ GET: Listar EPC por proyecto (o todos) ============

export async function GET(request: NextRequest) {
  let connection;

  try {
    const sessionCheck = await checkSession(request);
    if (!sessionCheck.ok) {
      return NextResponse.json(
        { success: false, message: sessionCheck.message },
        { status: sessionCheck.status }
      );
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");

    connection = await getConnection();

    let rows: EPCRow[];
    if (projectId) {
      const projectIdNum = Number(projectId);
      if (!Number.isInteger(projectIdNum) || projectIdNum <= 0) {
        return NextResponse.json(
          { success: false, message: "ID de proyecto inválido" },
          { status: 400 }
        );
      }
      const [result] = await connection.execute<EPCRow[]>(
        `SELECT EPCID, ProjectID, Advance, Amount, WeekNumber, EstimateNumber, \`Date\`
         FROM epc
         WHERE ProjectID = ?
         ORDER BY EPCID DESC`,
        [projectIdNum]
      );
      rows = result;
    } else {
      const [result] = await connection.execute<EPCRow[]>(
        `SELECT EPCID, ProjectID, Advance, Amount, WeekNumber, EstimateNumber, \`Date\`
         FROM epc
         ORDER BY EPCID DESC`
      );
      rows = result;
    }

    return NextResponse.json({ success: true, data: rows }, { status: 200 });
  } catch (error: any) {
    console.error("Error al listar EPC:", error);
    return NextResponse.json(
      { success: false, message: error.sqlMessage || error.message || "Error al listar EPC" },
      { status: 500 }
    );
  } finally {
    if (connection) {
      try { await connection.release(); } catch (e) { console.error(e); }
    }
  }
}

// ============ POST: Crear EPC ============

export async function POST(request: NextRequest) {
  let connection;

  try {
    const sessionCheck = await checkSession(request);
    if (!sessionCheck.ok) {
      return NextResponse.json(
        { success: false, message: sessionCheck.message },
        { status: sessionCheck.status }
      );
    }

    let body: EPCRequestBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, message: "Cuerpo de la petición inválido" },
        { status: 400 }
      );
    }

    const { projectId, advance, amount, weekNumber, estimateNumber, date } = body;

    if (projectId === null || projectId === undefined || projectId === "") {
      return NextResponse.json(
        { success: false, message: "El ID del proyecto es obligatorio" },
        { status: 400 }
      );
    }

    const projectIdNum = Number(projectId);
    if (!Number.isInteger(projectIdNum) || projectIdNum <= 0) {
      return NextResponse.json(
        { success: false, message: "El ID del proyecto debe ser un número entero válido" },
        { status: 400 }
      );
    }

    let advanceNum: number;
    let amountNum: number;
    let weekNumberNum: number;
    let estimateNumberNum: number;
    let dateStr: string;
    try {
      advanceNum = normalizeNumber(advance, "Avance");
      amountNum = normalizeNumber(amount, "Monto");
      weekNumberNum = normalizeNumber(weekNumber, "Número de semana");
      estimateNumberNum = normalizeNumber(estimateNumber, "Número de estimación");
      dateStr = normalizeDate(date, "Fecha");
    } catch (validationError: any) {
      return NextResponse.json(
        { success: false, message: validationError.message },
        { status: 400 }
      );
    }

    if (advanceNum < 0 || advanceNum > 100) {
      return NextResponse.json(
        { success: false, message: "El avance debe estar entre 0 y 100" },
        { status: 400 }
      );
    }
    if (amountNum < 0) {
      return NextResponse.json(
        { success: false, message: "El monto no puede ser negativo" },
        { status: 400 }
      );
    }
    if (!Number.isInteger(weekNumberNum) || weekNumberNum <= 0) {
      return NextResponse.json(
        { success: false, message: "El número de semana debe ser un entero positivo" },
        { status: 400 }
      );
    }
    if (!Number.isInteger(estimateNumberNum) || estimateNumberNum <= 0) {
      return NextResponse.json(
        { success: false, message: "El número de estimación debe ser un entero positivo" },
        { status: 400 }
      );
    }

    connection = await getConnection();

    const [projectExists] = await connection.execute<RowDataPacket[]>(
      `SELECT ProjectID FROM projects WHERE ProjectID = ?`,
      [projectIdNum]
    );
    if (!projectExists.length) {
      return NextResponse.json(
        { success: false, message: "El proyecto no existe" },
        { status: 404 }
      );
    }

    const [insertResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO epc (ProjectID, Advance, Amount, WeekNumber, EstimateNumber, \`Date\`)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [projectIdNum, advanceNum, amountNum, weekNumberNum, estimateNumberNum, dateStr]
    );

    return NextResponse.json(
      {
        success: true,
        message: "Registro EPC creado correctamente",
        data: {
          EPCID: insertResult.insertId,
          ProjectID: projectIdNum,
          Advance: advanceNum,
          Amount: amountNum,
          WeekNumber: weekNumberNum,
          EstimateNumber: estimateNumberNum,
          Date: dateStr,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("Error al crear EPC:", error);
    return NextResponse.json(
      { success: false, message: error.sqlMessage || error.message || "Error al crear EPC" },
      { status: 500 }
    );
  } finally {
    if (connection) {
      try { await connection.release(); } catch (e) { console.error(e); }
    }
  }
}

// ============ PUT: Actualizar EPC ============

export async function PUT(request: NextRequest) {
  let connection;

  try {
    const sessionCheck = await checkSession(request);
    if (!sessionCheck.ok) {
      return NextResponse.json(
        { success: false, message: sessionCheck.message },
        { status: sessionCheck.status }
      );
    }

    let body: EPCRequestBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, message: "Cuerpo de la petición inválido" },
        { status: 400 }
      );
    }

    const { epcId, projectId, advance, amount, weekNumber, estimateNumber, date } = body;

    if (epcId === null || epcId === undefined || epcId === "") {
      return NextResponse.json(
        { success: false, message: "El ID del registro EPC es obligatorio" },
        { status: 400 }
      );
    }

    const epcIdNum = Number(epcId);
    if (!Number.isInteger(epcIdNum) || epcIdNum <= 0) {
      return NextResponse.json(
        { success: false, message: "ID EPC inválido" },
        { status: 400 }
      );
    }

    if (projectId === null || projectId === undefined || projectId === "") {
      return NextResponse.json(
        { success: false, message: "El ID del proyecto es obligatorio" },
        { status: 400 }
      );
    }

    const projectIdNum = Number(projectId);
    if (!Number.isInteger(projectIdNum) || projectIdNum <= 0) {
      return NextResponse.json(
        { success: false, message: "ID de proyecto inválido" },
        { status: 400 }
      );
    }

    let advanceNum: number;
    let amountNum: number;
    let weekNumberNum: number;
    let estimateNumberNum: number;
    let dateStr: string;
    try {
      advanceNum = normalizeNumber(advance, "Avance");
      amountNum = normalizeNumber(amount, "Monto");
      weekNumberNum = normalizeNumber(weekNumber, "Número de semana");
      estimateNumberNum = normalizeNumber(estimateNumber, "Número de estimación");
      dateStr = normalizeDate(date, "Fecha");
    } catch (validationError: any) {
      return NextResponse.json(
        { success: false, message: validationError.message },
        { status: 400 }
      );
    }

    if (advanceNum < 0 || advanceNum > 100) {
      return NextResponse.json(
        { success: false, message: "El avance debe estar entre 0 y 100" },
        { status: 400 }
      );
    }
    if (amountNum < 0) {
      return NextResponse.json(
        { success: false, message: "El monto no puede ser negativo" },
        { status: 400 }
      );
    }
    if (!Number.isInteger(weekNumberNum) || weekNumberNum <= 0) {
      return NextResponse.json(
        { success: false, message: "El número de semana debe ser un entero positivo" },
        { status: 400 }
      );
    }
    if (!Number.isInteger(estimateNumberNum) || estimateNumberNum <= 0) {
      return NextResponse.json(
        { success: false, message: "El número de estimación debe ser un entero positivo" },
        { status: 400 }
      );
    }

    connection = await getConnection();

    const [existing] = await connection.execute<RowDataPacket[]>(
      `SELECT EPCID FROM epc WHERE EPCID = ?`,
      [epcIdNum]
    );
    if (!existing.length) {
      return NextResponse.json(
        { success: false, message: "El registro EPC no existe" },
        { status: 404 }
      );
    }

    await connection.execute(
      `UPDATE epc
       SET ProjectID = ?, Advance = ?, Amount = ?, WeekNumber = ?, EstimateNumber = ?, \`Date\` = ?
       WHERE EPCID = ?`,
      [projectIdNum, advanceNum, amountNum, weekNumberNum, estimateNumberNum, dateStr, epcIdNum]
    );

    return NextResponse.json(
      {
        success: true,
        message: "Registro EPC actualizado correctamente",
        data: {
          EPCID: epcIdNum,
          ProjectID: projectIdNum,
          Advance: advanceNum,
          Amount: amountNum,
          WeekNumber: weekNumberNum,
          EstimateNumber: estimateNumberNum,
          Date: dateStr,
        },
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error al actualizar EPC:", error);
    return NextResponse.json(
      { success: false, message: error.sqlMessage || error.message || "Error al actualizar EPC" },
      { status: 500 }
    );
  } finally {
    if (connection) {
      try { await connection.release(); } catch (e) { console.error(e); }
    }
  }
}

// ============ DELETE: Eliminar EPC ============

export async function DELETE(request: NextRequest) {
  let connection;

  try {
    const sessionCheck = await checkSession(request);
    if (!sessionCheck.ok) {
      return NextResponse.json(
        { success: false, message: sessionCheck.message },
        { status: sessionCheck.status }
      );
    }

    const { searchParams } = new URL(request.url);
    const epcId = searchParams.get("epcId");

    if (!epcId) {
      return NextResponse.json(
        { success: false, message: "Se requiere el ID del registro EPC" },
        { status: 400 }
      );
    }

    const epcIdNum = Number(epcId);
    if (!Number.isInteger(epcIdNum) || epcIdNum <= 0) {
      return NextResponse.json(
        { success: false, message: "ID EPC inválido" },
        { status: 400 }
      );
    }

    connection = await getConnection();

    const [existing] = await connection.execute<RowDataPacket[]>(
      `SELECT EPCID FROM epc WHERE EPCID = ?`,
      [epcIdNum]
    );
    if (!existing.length) {
      return NextResponse.json(
        { success: false, message: "El registro EPC no existe" },
        { status: 404 }
      );
    }

    await connection.execute(`DELETE FROM epc WHERE EPCID = ?`, [epcIdNum]);

    return NextResponse.json(
      { success: true, message: "Registro EPC eliminado correctamente" },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Error al eliminar EPC:", error);
    return NextResponse.json(
      { success: false, message: error.sqlMessage || error.message || "Error al eliminar EPC" },
      { status: 500 }
    );
  } finally {
    if (connection) {
      try { await connection.release(); } catch (e) { console.error(e); }
    }
  }
}