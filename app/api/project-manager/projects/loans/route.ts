// src/app/api/project-manager/projects/loans/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { validateAndRenewSession } from '@/lib/auth';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';
import { UTApi } from 'uploadthing/server';

interface LoanRow extends RowDataPacket {
  LoansID: number;
  ProjectID: number;
  ProjectPersonnelID: number | null;
  EmployeeName: string | null;
  Date: string | Date;
  MethodID: number;
  MethodName: string;
  Total: number;
  FirstDiscount: string | Date;
  NumberOfPayments: number;
  Observations: string | null;
  Status: number;
  Archivos: string | null;
  TotalCuotas: number;
  CuotasPagadas: number;
  CuotasVencidas: number;
  MontoPagado: number;
}

interface ArchivoAdjunto {
  nombre: string;
  url: string;
  tipo: string;
  key: string;
}

const utapi = new UTApi();

async function getAuthenticatedUser(request: NextRequest) {
  const sessionId = request.cookies.get('session')?.value;
  if (!sessionId) return null;
  return await validateAndRenewSession(sessionId);
}

const ymd = (d: string | Date) =>
  typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10);

function addMonths(isoDate: string, months: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  const originalDay = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  if (d.getUTCDate() < originalDay) {
    d.setUTCDate(0);
  }
  return ymd(d);
}

// ============================================================
// FIX REGEX: '-' al FINAL del char class → literal, no rango
// ============================================================
function extractFileKeyFromUrl(url: string): string | null {
  if (!url) return null;
  try {
    const matches = url.match(/\/f\/([a-zA-Z0-9_-]+)/);
    return matches ? matches[1] : null;
  } catch {
    return null;
  }
}

// ============================================================
// HELPER CENTRALIZADO: extrae TODOS los keys de un JSON de Archivos
// - Usa 'key' si existe
// - Si no, extrae el key desde la URL (registros viejos)
// - Devuelve solo keys válidos (no vacíos)
// ============================================================
function extractAllKeys(archivosJson: string | null | undefined): string[] {
  if (!archivosJson) return [];
  let archivos: any[] = [];
  try {
    const parsed = JSON.parse(archivosJson);
    if (Array.isArray(parsed)) archivos = parsed;
    else if (parsed && typeof parsed === 'object') archivos = [parsed];
  } catch (e) {
    console.error('[loans] Error parseando Archivos JSON:', e);
    return [];
  }

  const keys: string[] = [];
  for (const a of archivos) {
    if (!a) continue;
    let key: string | null = null;

    // 1) Intentar usar el campo 'key' guardado
    if (typeof a.key === 'string' && a.key.trim().length > 0) {
      key = a.key.trim();
    }
    // 2) Fallback: extraerlo de la URL
    else if (typeof a.url === 'string' && a.url.length > 0) {
      key = extractFileKeyFromUrl(a.url);
      if (key) {
        console.log(`[loans] Key recuperado desde URL para "${a.nombre || 'sin nombre'}": ${key}`);
      }
    }

    if (key) keys.push(key);
    else console.warn('[loans] ⚠️ No se pudo obtener key del archivo:', a);
  }

  return keys;
}

// ============================================================
// HELPER: elimina archivos de UploadThing con logging robusto
// Devuelve { success, deleted, failed }
// ============================================================
async function deleteFromUploadThing(
  keys: string[]
): Promise<{ success: boolean; deleted: number; failed: string[] }> {
  const validKeys = Array.from(
    new Set(keys.filter(k => typeof k === 'string' && k.trim().length > 0))
  );

  if (validKeys.length === 0) {
    return { success: true, deleted: 0, failed: [] };
  }

  console.log(`[loans] Eliminando ${validKeys.length} archivo(s) de UploadThing:`, validKeys);

  try {
    const result: any = await utapi.deleteFiles(validKeys);
    console.log('[loans] Resultado deleteFiles:', JSON.stringify(result));

    // UploadThing devuelve { success: true, deletedCount: N }
    // o en versiones viejas un booleano
    const success = result?.success === true || result === true;
    const deleted =
      typeof result?.deletedCount === 'number'
        ? result.deletedCount
        : success
        ? validKeys.length
        : 0;

    if (!success) {
      console.warn('[loans] ⚠️ deleteFiles no confirmó éxito:', result);
      return { success: false, deleted, failed: validKeys };
    }

    return { success: true, deleted, failed: [] };
  } catch (e: any) {
    console.error('[loans] ❌ Error en utapi.deleteFiles:', e?.message || e);
    return { success: false, deleted: 0, failed: validKeys };
  }
}

/**
 * Genera las cuotas del préstamo dentro de una transacción.
 */
async function generateLoanPayments(
  connection: PoolConnection,
  loanId: number,
  projectId: number,
  total: number,
  numberOfPayments: number,
  firstDiscountIso: string
): Promise<number> {
  await connection.execute(`DELETE FROM loan_payments WHERE LoansID = ?`, [loanId]);

  if (numberOfPayments <= 0) return 0;

  const baseAmount = Math.round((total / numberOfPayments) * 100) / 100;
  const diff = Math.round((total - baseAmount * numberOfPayments) * 100) / 100;

  for (let i = 0; i < numberOfPayments; i++) {
    const paymentNumber = i + 1;
    const dueDate = addMonths(firstDiscountIso, i);
    const amount = i === numberOfPayments - 1 ? baseAmount + diff : baseAmount;

    const [periodRows] = await connection.execute<RowDataPacket[]>(
      `SELECT PayrollPeriodID
       FROM payroll_periods
       WHERE ProjectID = ?
         AND StartDate <= ?
         AND EndDate >= ?
       ORDER BY StartDate ASC
       LIMIT 1`,
      [projectId, dueDate, dueDate]
    );

    const payrollPeriodId =
      periodRows.length > 0 ? Number(periodRows[0].PayrollPeriodID) : null;

    await connection.execute<ResultSetHeader>(
      `INSERT INTO loan_payments
        (LoansID, PaymentNumber, Amount, PayrollPeriodID, Status)
       VALUES (?, ?, ?, ?, 0)`,
      [loanId, paymentNumber, amount, payrollPeriodId]
    );
  }

  return numberOfPayments;
}

// ─────────────────────────────────────────────────────────────
// GET: lista de préstamos del proyecto con progreso
// ─────────────────────────────────────────────────────────────
export async function GET(request: NextRequest): Promise<NextResponse> {
  let connection: PoolConnection | undefined;
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    if (!projectId) {
      return NextResponse.json({ message: 'Project ID es requerido' }, { status: 400 });
    }

    connection = (await getConnection()) as PoolConnection;

    const [rows] = await connection.execute<LoanRow[]>(
      `SELECT
         l.LoansID,
         l.ProjectID,
         l.ProjectPersonnelID,
         CONCAT_WS(' ', pp.FirstName, pp.LastName, pp.MiddleName) AS EmployeeName,
         l.Date,
         l.MethodID,
         pm.MethodName,
         l.Total,
         l.FirstDiscount,
         l.NumberOfPayments,
         l.Observations,
         l.Status,
         l.Archivos,
         COUNT(lp.PaymentID) AS TotalCuotas,
         COALESCE(SUM(CASE WHEN lp.Status = 1 THEN 1 ELSE 0 END), 0) AS CuotasPagadas,
         COALESCE(SUM(CASE WHEN lp.Status = 2 THEN 1 ELSE 0 END), 0) AS CuotasVencidas,
         COALESCE(SUM(CASE WHEN lp.Status = 1 THEN lp.Amount ELSE 0 END), 0) AS MontoPagado
       FROM loans l
       INNER JOIN paymentmethods pm ON l.MethodID = pm.MethodID
       LEFT JOIN projectpersonnel pp ON pp.ProjectPersonnelID = l.ProjectPersonnelID
       LEFT JOIN loan_payments lp ON lp.LoansID = l.LoansID
       WHERE l.ProjectID = ?
       GROUP BY l.LoansID
       ORDER BY l.Date DESC`,
      [projectId]
    );

    return NextResponse.json(
      rows.map(r => ({
        LoansID: r.LoansID,
        ProjectID: r.ProjectID,
        ProjectPersonnelID: r.ProjectPersonnelID,
        EmployeeName: r.EmployeeName || '—',
        Date: ymd(r.Date),
        MethodID: r.MethodID,
        MethodName: r.MethodName,
        Total: Number(r.Total),
        FirstDiscount: ymd(r.FirstDiscount),
        NumberOfPayments: r.NumberOfPayments,
        Observations: r.Observations || '',
        Status: r.Status,
        Archivos: r.Archivos,
        TotalCuotas: Number(r.TotalCuotas),
        CuotasPagadas: Number(r.CuotasPagadas),
        CuotasVencidas: Number(r.CuotasVencidas),
        MontoPagado: Number(r.MontoPagado),
        Progreso: `${Number(r.CuotasPagadas)} de ${Number(r.TotalCuotas)}`
      }))
    );
  } catch (error) {
    console.error('Error al obtener préstamos:', error);
    return NextResponse.json({ message: 'Error al obtener préstamos' }, { status: 500 });
  } finally {
    if (connection) connection.release();
  }
}

// ─────────────────────────────────────────────────────────────
// POST: crear préstamo + generar cuotas
// ─────────────────────────────────────────────────────────────
export async function POST(request: NextRequest): Promise<NextResponse> {
  let connection: PoolConnection | undefined;
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const {
      projectId,
      projectPersonnelId,
      date,
      total,
      firstDiscount,
      observations,
      methodId,
      numberOfPayments
    } = await request.json();

    if (
      !projectId ||
      !projectPersonnelId ||
      !date ||
      !total ||
      !methodId ||
      !firstDiscount ||
      !numberOfPayments
    ) {
      return NextResponse.json({ message: 'Faltan campos requeridos' }, { status: 400 });
    }

    if (numberOfPayments < 1) {
      return NextResponse.json(
        { message: 'El número de pagos debe ser al menos 1' },
        { status: 400 }
      );
    }

    connection = (await getConnection()) as PoolConnection;
    await connection.beginTransaction();

    // Validar proyecto
    const [projRows] = await connection.execute<RowDataPacket[]>(
      `SELECT ProjectID FROM projects WHERE ProjectID = ?`,
      [projectId]
    );
    if (projRows.length === 0) {
      await connection.rollback();
      return NextResponse.json({ message: 'Proyecto no existe' }, { status: 400 });
    }

    // Validar empleado de proyecto
    const [ppRows] = await connection.execute<RowDataPacket[]>(
      `SELECT ProjectPersonnelID FROM projectpersonnel WHERE ProjectPersonnelID = ?`,
      [projectPersonnelId]
    );
    if (ppRows.length === 0) {
      await connection.rollback();
      return NextResponse.json({ message: 'Empleado de proyecto no existe' }, { status: 400 });
    }

    // Validar método de pago
    const [methodRows] = await connection.execute<RowDataPacket[]>(
      `SELECT MethodID FROM paymentmethods WHERE MethodID = ?`,
      [methodId]
    );
    if (methodRows.length === 0) {
      await connection.rollback();
      return NextResponse.json({ message: 'Método de pago no válido' }, { status: 400 });
    }

    const dateIso = ymd(date);
    const firstDiscountIso = ymd(firstDiscount);

    // Archivos inicia vacío: generate-pdf lo llena después
    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO loans
        (ProjectID, ProjectPersonnelID, Date, MethodID, Total, FirstDiscount,
         NumberOfPayments, Observations, Status, Archivos)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
      [
        projectId,
        projectPersonnelId,
        dateIso,
        methodId,
        total,
        firstDiscountIso,
        numberOfPayments,
        observations || null,
        JSON.stringify([])
      ]
    );

    const loanId = result.insertId;

    const totalCuotas = await generateLoanPayments(
      connection,
      loanId,
      Number(projectId),
      Number(total),
      Number(numberOfPayments),
      firstDiscountIso
    );

    await connection.commit();

    return NextResponse.json(
      {
        message: 'Préstamo creado con cuotas generadas',
        id: loanId,
        totalCuotas
      },
      { status: 201 }
    );
  } catch (error: any) {
    if (connection) await connection.rollback();
    console.error('Error al crear préstamo:', error);
    return NextResponse.json(
      { message: error.sqlMessage || 'Error al crear préstamo' },
      { status: 500 }
    );
  } finally {
    if (connection) connection.release();
  }
}

// ─────────────────────────────────────────────────────────────
// PUT: actualizar préstamo (NO toca Archivos)
// ─────────────────────────────────────────────────────────────
export async function PUT(request: NextRequest): Promise<NextResponse> {
  let connection: PoolConnection | undefined;
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ message: 'ID es requerido' }, { status: 400 });

    const {
      projectPersonnelId,
      date,
      total,
      firstDiscount,
      observations,
      methodId,
      numberOfPayments
    } = await request.json();

    connection = (await getConnection()) as PoolConnection;
    await connection.beginTransaction();

    const [loanRows] = await connection.execute<RowDataPacket[]>(
      `SELECT * FROM loans WHERE LoansID = ?`,
      [id]
    );
    if (loanRows.length === 0) {
      await connection.rollback();
      return NextResponse.json({ message: 'Préstamo no encontrado' }, { status: 404 });
    }
    const loan = loanRows[0];

    // Validar método
    const [methodRows] = await connection.execute<RowDataPacket[]>(
      `SELECT MethodID FROM paymentmethods WHERE MethodID = ?`,
      [methodId]
    );
    if (methodRows.length === 0) {
      await connection.rollback();
      return NextResponse.json({ message: 'Método de pago no válido' }, { status: 400 });
    }

    // ¿Hay cuotas ya pagadas?
    const [paidRows] = await connection.execute<RowDataPacket[]>(
      `SELECT COUNT(*) AS Pagadas FROM loan_payments WHERE LoansID = ? AND Status = 1`,
      [id]
    );
    const hayPagadas = Number(paidRows[0].Pagadas) > 0;

    const dateIso = ymd(date);
    const firstDiscountIso = ymd(firstDiscount);
    const cambiaEstructura =
      Number(loan.Total) !== Number(total) ||
      Number(loan.NumberOfPayments) !== Number(numberOfPayments) ||
      ymd(loan.FirstDiscount) !== firstDiscountIso;

    if (cambiaEstructura && hayPagadas) {
      await connection.rollback();
      return NextResponse.json(
        {
          message:
            'No puedes cambiar monto, número de pagos o primera fecha porque ya hay cuotas pagadas. Cancela el préstamo y crea uno nuevo.'
        },
        { status: 409 }
      );
    }

    // NO tocar Archivos: generate-pdf lo reemplaza después
    await connection.execute<ResultSetHeader>(
      `UPDATE loans SET
        ProjectPersonnelID = ?,
        Date = ?,
        MethodID = ?,
        Total = ?,
        FirstDiscount = ?,
        NumberOfPayments = ?,
        Observations = ?,
        Status = 0
       WHERE LoansID = ?`,
      [
        projectPersonnelId,
        dateIso,
        methodId,
        total,
        firstDiscountIso,
        numberOfPayments,
        observations || null,
        id
      ]
    );

    if (cambiaEstructura) {
      await generateLoanPayments(
        connection,
        Number(id),
        Number(loan.ProjectID),
        Number(total),
        Number(numberOfPayments),
        firstDiscountIso
      );
    }

    await connection.commit();

    return NextResponse.json({
      message: 'Préstamo actualizado',
      cuotasRegeneradas: cambiaEstructura
    });
  } catch (error: any) {
    if (connection) await connection.rollback();
    console.error('Error al actualizar préstamo:', error);
    return NextResponse.json({ message: 'Error al actualizar préstamo' }, { status: 500 });
  } finally {
    if (connection) connection.release();
  }
}

// ─────────────────────────────────────────────────────────────
// DELETE: eliminar préstamo + archivos de UploadThing
// ─────────────────────────────────────────────────────────────
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  let connection: PoolConnection | undefined;
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ message: 'ID es requerido' }, { status: 400 });

    connection = (await getConnection()) as PoolConnection;

    // 1) Obtener los Archivos antes de borrar la fila
    const [loanRows] = await connection.execute<RowDataPacket[]>(
      `SELECT LoansID, Archivos FROM loans WHERE LoansID = ?`,
      [id]
    );
    if (loanRows.length === 0) {
      return NextResponse.json({ message: 'Préstamo no encontrado' }, { status: 404 });
    }

    const archivosJson: string | null = loanRows[0].Archivos || null;

    // 2) Extraer TODOS los keys (con fallback desde URL)
    const keys = extractAllKeys(archivosJson);
    console.log(`[loans/DELETE] Préstamo ${id} → ${keys.length} archivo(s) a eliminar de UploadThing`);

    // 3) Eliminar de UploadThing ANTES de borrar la fila
    let deleteResult: { success: boolean; deleted: number; failed: string[] } = {
      success: true,
      deleted: 0,
      failed: []
    };
    if (keys.length > 0) {
      deleteResult = await deleteFromUploadThing(keys);
      if (!deleteResult.success) {
        console.warn(
          `[loans/DELETE] ⚠️ No se pudieron eliminar algunos archivos de UploadThing:`,
          deleteResult.failed
        );
        // ⚠️ Continuamos de todos modos: preferimos borrar el registro
        // de la BD aunque queden archivos huérfanos en UploadThing,
        // a quedarnos con un registro imposible de eliminar.
      }
    }

    // 4) Borrar la fila de la BD (cuotas se van por CASCADE)
    const [result] = await connection.execute<ResultSetHeader>(
      `DELETE FROM loans WHERE LoansID = ?`,
      [id]
    );

    return NextResponse.json({
      message: 'Préstamo y cuotas eliminados',
      affectedRows: result.affectedRows,
      archivosEliminados: deleteResult.deleted,
      archivosFallidos: deleteResult.failed.length,
      // Solo devolvemos detalle de fallos si los hubo
      ...(deleteResult.failed.length > 0 && {
        advertencia:
          'El registro se eliminó, pero algunos archivos no pudieron borrarse de UploadThing.',
        archivosFallidosKeys: deleteResult.failed
      })
    });
  } catch (error: any) {
    console.error('Error al eliminar préstamo:', error);
    return NextResponse.json(
      { message: error.sqlMessage || 'Error al eliminar préstamo' },
      { status: 500 }
    );
  } finally {
    if (connection) connection.release();
  }
}