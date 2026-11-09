import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { validateAndRenewSession } from '@/lib/auth';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';
import { UTApi } from 'uploadthing/server';

const utapi = new UTApi();

interface ArchivoAdjunto {
  nombre: string;
  url: string;
  tipo: string;
  key: string;
}

async function getAuthenticatedUser(request: NextRequest) {
  const sessionId = request.cookies.get('session')?.value;
  if (!sessionId) return null;
  return await validateAndRenewSession(sessionId);
}

const ymd = (d: string | Date) =>
  typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10);

// ======================= GET =======================
export async function GET(request: NextRequest): Promise<NextResponse> {
  let connection: PoolConnection | undefined;
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ message: 'No autorizado' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    if (!projectId) return NextResponse.json({ message: 'projectId requerido' }, { status: 400 });

    connection = (await getConnection()) as PoolConnection;

    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT pp.PayrollPeriodID, pp.WeekNumber, pp.StartDate, pp.EndDate, pp.Status,
              py.PayrollID, py.Total AS PayrollTotal, py.status AS PayrollStatus,
              py.Archivos AS PayrollArchivos
       FROM payroll_periods pp
       LEFT JOIN payroll py ON py.PayrollPeriodID = pp.PayrollPeriodID
       WHERE pp.ProjectID = ?
       ORDER BY pp.StartDate DESC`,
      [projectId]
    );

    const latest = rows[0] || null;
    let suggestedNext: { startDate: string; endDate: string } | null = null;

    if (latest) {
      const lastEnd = new Date(`${ymd(latest.EndDate)}T00:00:00Z`);
      lastEnd.setUTCDate(lastEnd.getUTCDate() + 1);
      const sun = new Date(lastEnd); sun.setUTCDate(sun.getUTCDate() + 6);
      suggestedNext = { startDate: ymd(lastEnd), endDate: ymd(sun) };
    } else {
      const today = new Date();
      const day = today.getUTCDay();
      const diff = day === 0 ? -6 : 1 - day;
      const mon = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + diff));
      const sun = new Date(mon); sun.setUTCDate(sun.getUTCDate() + 6);
      suggestedNext = { startDate: ymd(mon), endDate: ymd(sun) };
    }

    return NextResponse.json({
      periods: rows.map(r => ({
        PayrollPeriodID: r.PayrollPeriodID,
        WeekNumber: r.WeekNumber,
        StartDate: ymd(r.StartDate),
        EndDate: ymd(r.EndDate),
        Status: r.Status,
        PayrollID: r.PayrollID ?? null,
        PayrollTotal: r.PayrollTotal ?? null,
        PayrollStatus: r.PayrollStatus ?? null,
        Archivos: r.PayrollArchivos ?? null,
      })),
      latest,
      suggestedNext
    });
  } catch (error) {
    console.error('Error al consultar periodos:', error);
    return NextResponse.json({ message: 'Error' }, { status: 500 });
  } finally {
    if (connection) connection.release();
  }
}

// ======================= POST (crear siguiente semana) =======================
export async function POST(request: NextRequest): Promise<NextResponse> {
  let connection: PoolConnection | undefined;
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ message: 'No autorizado' }, { status: 401 });

    const body = await request.json();
    const { projectId, startDate, endDate } = body;

    if (!projectId) return NextResponse.json({ message: 'projectId requerido' }, { status: 400 });

    connection = (await getConnection()) as PoolConnection;
    await connection.beginTransaction();

    const [projRows] = await connection.execute<RowDataPacket[]>(
      `SELECT ProjectID FROM projects WHERE ProjectID = ? LIMIT 1`,
      [projectId]
    );
    if (projRows.length === 0) {
      await connection.rollback();
      return NextResponse.json({ message: 'Proyecto no existe' }, { status: 400 });
    }

    let finalStart = startDate;
    let finalEnd = endDate;

    if (!finalStart || !finalEnd) {
      const [maxRow] = await connection.execute<RowDataPacket[]>(
        `SELECT EndDate FROM payroll_periods WHERE ProjectID = ? ORDER BY EndDate DESC LIMIT 1`,
        [projectId]
      );
      if (maxRow.length === 0) {
        const today = new Date();
        const day = today.getUTCDay();
        const diff = day === 0 ? -6 : 1 - day;
        const mon = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + diff));
        const sun = new Date(mon); sun.setUTCDate(sun.getUTCDate() + 6);
        finalStart = ymd(mon);
        finalEnd = ymd(sun);
      } else {
        const lastEnd = new Date(`${ymd(maxRow[0].EndDate)}T00:00:00Z`);
        lastEnd.setUTCDate(lastEnd.getUTCDate() + 1);
        const sun = new Date(lastEnd); sun.setUTCDate(sun.getUTCDate() + 6);
        finalStart = ymd(lastEnd);
        finalEnd = ymd(sun);
      }
    }

    const [overlap] = await connection.execute<RowDataPacket[]>(
      `SELECT PayrollPeriodID FROM payroll_periods
       WHERE ProjectID = ? AND NOT (EndDate < ? OR StartDate > ?)
       LIMIT 1`,
      [projectId, finalStart, finalEnd]
    );
    if (overlap.length > 0) {
      await connection.rollback();
      return NextResponse.json({ message: 'Ya existe una semana en ese rango' }, { status: 409 });
    }

    const [maxRow] = await connection.execute<RowDataPacket[]>(
      `SELECT COALESCE(MAX(WeekNumber), 0) AS MaxWeek FROM payroll_periods WHERE ProjectID = ?`,
      [projectId]
    );
    const nextWeek = Number(maxRow[0].MaxWeek) + 1;

    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO payroll_periods (ProjectID, WeekNumber, StartDate, EndDate, Status)
       VALUES (?, ?, ?, ?, 0)`,
      [projectId, nextWeek, finalStart, finalEnd]
    );
    const newPeriodId = result.insertId;

    await connection.execute<ResultSetHeader>(
      `INSERT INTO payroll (ProjectID, PayrollPeriodID, Date, MethodID, Total, status)
       VALUES (?, ?, ?, 1, 0, 0)`,
      [projectId, newPeriodId, finalStart]
    );

    await connection.commit();

    return NextResponse.json(
      { message: 'Semana creada', id: newPeriodId, weekNumber: nextWeek, startDate: finalStart, endDate: finalEnd },
      { status: 201 }
    );
  } catch (error: any) {
    if (connection) await connection.rollback();
    console.error('Error al crear periodo:', error);
    return NextResponse.json({ message: error.sqlMessage || error.message || 'Error' }, { status: 500 });
  } finally {
    if (connection) connection.release();
  }
}

// ======================= PUT (cerrar / reabrir / validar) =======================
export async function PUT(request: NextRequest): Promise<NextResponse> {
  let connection: PoolConnection | undefined;
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ message: 'No autorizado' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ message: 'ID requerido' }, { status: 400 });

    const body = await request.json();
    const { status, total, methodId, payrollStatus, archivos, filesToDelete } = body;

    connection = (await getConnection()) as PoolConnection;
    await connection.beginTransaction();

    // ---------- Caso 1: solo cambiar status de la tabla payroll ----------
    if (payrollStatus !== undefined) {
      if (payrollStatus !== 0 && payrollStatus !== 1) {
        await connection.rollback();
        return NextResponse.json(
          { message: 'payrollStatus inválido (0=pendiente, 1=validado)' },
          { status: 400 }
        );
      }

      const [upd] = await connection.execute<ResultSetHeader>(
        `UPDATE payroll SET status = ? WHERE PayrollPeriodID = ?`,
        [payrollStatus, id]
      );

      if (upd.affectedRows === 0) {
        await connection.rollback();
        return NextResponse.json(
          { message: 'No se encontró registro de nómina para esta semana' },
          { status: 404 }
        );
      }

      await connection.commit();
      return NextResponse.json({
        message: payrollStatus === 1 ? 'Nómina validada' : 'Nómina marcada como pendiente'
      });
    }

    // ---------- Caso 2: cerrar / reabrir semana (status del periodo) ----------
    if (status !== 0 && status !== 2) {
      await connection.rollback();
      return NextResponse.json(
        { message: 'Status inválido (0=abierta, 2=cerrada)' },
        { status: 400 }
      );
    }

    if (status === 2) {
      const totalNum = Number(total);
      if (total === undefined || total === null || total === '' || isNaN(totalNum) || totalNum < 0) {
        await connection.rollback();
        return NextResponse.json(
          { message: 'Debes ingresar el Total de nómina de la semana (número >= 0)' },
          { status: 400 }
        );
      }

      const methodIdNum = Number(methodId);
      if (methodId === undefined || methodId === null || methodId === '' || isNaN(methodIdNum) || methodIdNum <= 0) {
        await connection.rollback();
        return NextResponse.json(
          { message: 'Debes seleccionar un método de pago válido' },
          { status: 400 }
        );
      }

      const [methodRows] = await connection.execute<RowDataPacket[]>(
        `SELECT MethodID FROM paymentmethods WHERE MethodID = ? LIMIT 1`,
        [methodIdNum]
      );
      if (methodRows.length === 0) {
        await connection.rollback();
        return NextResponse.json(
          { message: 'El método de pago seleccionado no existe' },
          { status: 400 }
        );
      }

      const [cnt] = await connection.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS Total FROM payroll_entries WHERE PayrollPeriodID = ?`,
        [id]
      );
      if (Number(cnt[0].Total) === 0) {
        await connection.rollback();
        return NextResponse.json(
          { message: 'No puedes cerrar una semana sin registros' },
          { status: 400 }
        );
      }
    }

    const [result] = await connection.execute<ResultSetHeader>(
      `UPDATE payroll_periods SET Status = ? WHERE PayrollPeriodID = ?`,
      [status, id]
    );

    if (result.affectedRows === 0) {
      await connection.rollback();
      return NextResponse.json({ message: 'Semana no encontrada' }, { status: 404 });
    }

    if (status === 2) {
      // ============ CERRAR ============
      if (Array.isArray(filesToDelete) && filesToDelete.length > 0) {
        try {
          const validKeys = filesToDelete.filter((k: any) => typeof k === 'string' && k.length > 0);
          if (validKeys.length > 0) {
            await utapi.deleteFiles(validKeys);
          }
        } catch (e) {
          console.error('Error al eliminar archivos antiguos de UploadThing:', e);
        }
      }

      const archivosJson =
        Array.isArray(archivos) && archivos.length > 0
          ? JSON.stringify(archivos)
          : null;

      await connection.execute<ResultSetHeader>(
        `UPDATE payroll 
         SET status = 0, Total = ?, MethodID = ?, Archivos = ? 
         WHERE PayrollPeriodID = ?`,
        [Number(total), Number(methodId), archivosJson, id]
      );
    } else {
      // ============ REABRIR ============
      const [payrollRows] = await connection.execute<RowDataPacket[]>(
        `SELECT Archivos FROM payroll WHERE PayrollPeriodID = ? LIMIT 1`,
        [id]
      );

      const archivosRaw = payrollRows[0]?.Archivos as string | null | undefined;

      if (archivosRaw) {
        try {
          const archivosArr: ArchivoAdjunto[] = JSON.parse(archivosRaw);
          const fileKeys = Array.isArray(archivosArr)
            ? archivosArr.filter(a => a && a.key).map(a => a.key)
            : [];

          if (fileKeys.length > 0) {
            await utapi.deleteFiles(fileKeys);
          }
        } catch (e) {
          console.error('Error al eliminar archivos de UploadThing al reabrir:', e);
        }
      }

      await connection.execute<ResultSetHeader>(
        `UPDATE payroll SET status = 0, Total = 0, MethodID = 1, Archivos = NULL WHERE PayrollPeriodID = ?`,
        [id]
      );
    }

    await connection.commit();

    return NextResponse.json({
      message: status === 2 ? 'Semana cerrada' : 'Semana reabierta'
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('Error al actualizar periodo:', error);
    return NextResponse.json({ message: 'Error' }, { status: 500 });
  } finally {
    if (connection) connection.release();
  }
}

// ======================= DELETE (eliminar semana en cascada) =======================
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  let connection: PoolConnection | undefined;
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ message: 'No autorizado' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ message: 'ID requerido' }, { status: 400 });

    connection = (await getConnection()) as PoolConnection;
    await connection.beginTransaction();

    const [periodRows] = await connection.execute<RowDataPacket[]>(
      `SELECT pp.PayrollPeriodID, pp.WeekNumber, pp.ProjectID, pp.Status, py.Archivos AS PayrollArchivos
       FROM payroll_periods pp
       LEFT JOIN payroll py ON py.PayrollPeriodID = pp.PayrollPeriodID
       WHERE pp.PayrollPeriodID = ?`,
      [id]
    );
    if (periodRows.length === 0) {
      await connection.rollback();
      return NextResponse.json({ message: 'Semana no encontrada' }, { status: 404 });
    }

    const archivosRaw = periodRows[0].PayrollArchivos;
    if (archivosRaw) {
      try {
        const archivos: ArchivoAdjunto[] = JSON.parse(archivosRaw);
        const fileKeys = archivos
          .filter(a => a && a.key)
          .map(a => a.key);
        if (fileKeys.length > 0) {
          await utapi.deleteFiles(fileKeys);
        }
      } catch (e) {
        console.error('Error al eliminar archivos de UploadThing:', e);
      }
    }

    await connection.execute<ResultSetHeader>(
      `UPDATE loan_payments
       SET Status = 0, PaymentDate = NULL, PayrollPeriodID = NULL
       WHERE PayrollPeriodID = ? AND Status = 1`,
      [id]
    );
    await connection.execute<ResultSetHeader>(
      `UPDATE loan_payments SET PayrollPeriodID = NULL WHERE PayrollPeriodID = ?`,
      [id]
    );
    await connection.execute<ResultSetHeader>(
      `DELETE FROM payroll WHERE PayrollPeriodID = ?`,
      [id]
    );
    await connection.execute<ResultSetHeader>(
      `DELETE FROM payroll_employee_viaticos WHERE PayrollPeriodID = ?`,
      [id]
    );
    await connection.execute<ResultSetHeader>(
      `DELETE FROM payroll_entries WHERE PayrollPeriodID = ?`,
      [id]
    );
    const [delResult] = await connection.execute<ResultSetHeader>(
      `DELETE FROM payroll_periods WHERE PayrollPeriodID = ?`,
      [id]
    );

    if (delResult.affectedRows === 0) {
      await connection.rollback();
      return NextResponse.json({ message: 'Semana no encontrada' }, { status: 404 });
    }

    await connection.commit();

    return NextResponse.json({
      message: `Semana ${periodRows[0].WeekNumber} eliminada correctamente`
    });
  } catch (error: any) {
    if (connection) await connection.rollback();
    console.error('Error al eliminar periodo:', error);
    return NextResponse.json(
      { message: error.sqlMessage || error.message || 'Error al eliminar semana' },
      { status: 500 }
    );
  } finally {
    if (connection) connection.release();
  }
}