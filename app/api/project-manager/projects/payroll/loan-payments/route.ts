// src/app/api/project-manager/projects/payroll/loan-payments/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { validateAndRenewSession } from '@/lib/auth';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';

async function getAuthenticatedUser(request: NextRequest) {
  const sessionId = request.cookies.get('session')?.value;
  if (!sessionId) return null;
  return await validateAndRenewSession(sessionId);
}

const ymd = (d: string | Date) =>
  typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10);

// GET: cuotas de préstamos que caen en la semana de nómina indicada
export async function GET(request: NextRequest): Promise<NextResponse> {
  let connection: PoolConnection | undefined;
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const periodId = searchParams.get('periodId');
    if (!periodId) {
      return NextResponse.json({ message: 'periodId requerido' }, { status: 400 });
    }

    connection = (await getConnection()) as PoolConnection;

    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT
         lp.PaymentID,
         lp.LoansID,
         lp.PaymentNumber,
         lp.Amount,
         lp.Status,
         lp.PaymentDate,
         lp.PayrollPeriodID,
         l.Total AS LoanTotal,
         l.NumberOfPayments,
         l.ProjectPersonnelID,
         CONCAT_WS(' ', pp.FirstName, pp.LastName, pp.MiddleName) AS EmployeeName,
         (SELECT COUNT(*) FROM loan_payments lp2 WHERE lp2.LoansID = l.LoansID AND lp2.Status = 1) AS CuotasPagadas,
         (SELECT COUNT(*) FROM loan_payments lp2 WHERE lp2.LoansID = l.LoansID) AS TotalCuotas
       FROM loan_payments lp
       INNER JOIN loans l ON l.LoansID = lp.LoansID
       LEFT JOIN projectpersonnel pp ON pp.ProjectPersonnelID = l.ProjectPersonnelID
       WHERE lp.PayrollPeriodID = ?
       ORDER BY EmployeeName ASC, lp.PaymentNumber ASC`,
      [periodId]
    );

    return NextResponse.json(
      rows.map(r => ({
        PaymentID: r.PaymentID,
        LoansID: r.LoansID,
        PaymentNumber: r.PaymentNumber,
        Amount: Number(r.Amount),
        Status: Number(r.Status),
        PaymentDate: r.PaymentDate ? ymd(r.PaymentDate) : null,
        PayrollPeriodID: r.PayrollPeriodID,
        LoanTotal: Number(r.LoanTotal),
        NumberOfPayments: Number(r.NumberOfPayments),
        ProjectPersonnelID: r.ProjectPersonnelID,
        EmployeeName: r.EmployeeName || '—',
        CuotasPagadas: Number(r.CuotasPagadas),
        TotalCuotas: Number(r.TotalCuotas),
        Progreso: `${Number(r.CuotasPagadas)} de ${Number(r.TotalCuotas)}`
      }))
    );
  } catch (error) {
    console.error('Error al obtener cuotas de la semana:', error);
    return NextResponse.json({ message: 'Error' }, { status: 500 });
  } finally {
    if (connection) connection.release();
  }
}

// PUT: aplicar descuentos (marcar como pagadas todas las cuotas pendientes de la semana)
export async function PUT(request: NextRequest): Promise<NextResponse> {
  let connection: PoolConnection | undefined;
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const body = await request.json();
    const { periodId, paymentIds } = body as {
      periodId?: number;
      paymentIds?: number[];
    };

    if (!periodId) {
      return NextResponse.json({ message: 'periodId requerido' }, { status: 400 });
    }
    if (!Array.isArray(paymentIds) || paymentIds.length === 0) {
      return NextResponse.json({ message: 'paymentIds requerido' }, { status: 400 });
    }

    connection = (await getConnection()) as PoolConnection;
    await connection.beginTransaction();

    // Validar que la semana exista y esté abierta
    const [periodRows] = await connection.execute<RowDataPacket[]>(
      `SELECT Status FROM payroll_periods WHERE PayrollPeriodID = ?`,
      [periodId]
    );
    if (periodRows.length === 0) {
      await connection.rollback();
      return NextResponse.json({ message: 'Semana no encontrada' }, { status: 404 });
    }
    if (Number(periodRows[0].Status) === 2) {
      await connection.rollback();
      return NextResponse.json(
        { message: 'La semana está cerrada, no puedes aplicar descuentos' },
        { status: 409 }
      );
    }

    const today = new Date().toISOString().slice(0, 10);

    let updated = 0;
    for (const pid of paymentIds) {
      const [res] = await connection.execute<ResultSetHeader>(
        `UPDATE loan_payments
         SET Status = 1, PaymentDate = ?, PayrollPeriodID = ?
         WHERE PaymentID = ? AND PayrollPeriodID = ? AND Status <> 1`,
        [today, periodId, pid, periodId]
      );
      updated += res.affectedRows;
    }

    await connection.commit();

    return NextResponse.json({
      message: `${updated} cuota(s) marcada(s) como pagada(s)`,
      updated
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error('Error al aplicar descuentos:', error);
    return NextResponse.json({ message: 'Error al aplicar descuentos' }, { status: 500 });
  } finally {
    if (connection) connection.release();
  }
}