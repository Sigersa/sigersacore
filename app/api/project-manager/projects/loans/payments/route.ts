// src/app/api/project-manager/projects/loans/payments/route.ts
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

// GET: cuotas de un préstamo
export async function GET(request: NextRequest): Promise<NextResponse> {
  let connection: PoolConnection | undefined;
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const loanId = searchParams.get('loanId');
    if (!loanId) return NextResponse.json({ message: 'loanId requerido' }, { status: 400 });

    connection = (await getConnection()) as PoolConnection;

    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT
         lp.PaymentID,
         lp.LoansID,
         lp.PaymentNumber,
         lp.PaymentDate,
         lp.Amount,
         lp.PayrollPeriodID,
         lp.Status,
         pp.WeekNumber,
         pp.StartDate AS PeriodStart,
         pp.EndDate AS PeriodEnd
       FROM loan_payments lp
       LEFT JOIN payroll_periods pp ON pp.PayrollPeriodID = lp.PayrollPeriodID
       WHERE lp.LoansID = ?
       ORDER BY lp.PaymentNumber ASC`,
      [loanId]
    );

    return NextResponse.json(
      rows.map(r => ({
        PaymentID: r.PaymentID,
        LoansID: r.LoansID,
        PaymentNumber: r.PaymentNumber,
        PaymentDate: r.PaymentDate ? ymd(r.PaymentDate) : null,
        Amount: Number(r.Amount),
        PayrollPeriodID: r.PayrollPeriodID,
        WeekNumber: r.WeekNumber ?? null,
        PeriodStart: r.PeriodStart ? ymd(r.PeriodStart) : null,
        PeriodEnd: r.PeriodEnd ? ymd(r.PeriodEnd) : null,
        Status: r.Status
      }))
    );
  } catch (error) {
    console.error('Error al obtener cuotas:', error);
    return NextResponse.json({ message: 'Error al obtener cuotas' }, { status: 500 });
  } finally {
    if (connection) connection.release();
  }
}

// PUT: marcar cuota como pagada/pendiente
export async function PUT(request: NextRequest): Promise<NextResponse> {
  let connection: PoolConnection | undefined;
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const paymentId = searchParams.get('paymentId');
    if (!paymentId) return NextResponse.json({ message: 'paymentId requerido' }, { status: 400 });

    const { status, payrollPeriodId } = await request.json();
    // status: 0 = pendiente, 1 = pagado, 2 = vencido, 3 = cancelado

    if (![0, 1, 2, 3].includes(Number(status))) {
      return NextResponse.json({ message: 'Status inválido' }, { status: 400 });
    }

    connection = (await getConnection()) as PoolConnection;

    const paymentDate = Number(status) === 1 ? new Date().toISOString().slice(0, 10) : null;

    const fields: string[] = ['Status = ?'];
    const values: any[] = [status];

    if (Number(status) === 1) {
      fields.push('PaymentDate = ?');
      values.push(paymentDate);
    } else if (Number(status) === 0) {
      fields.push('PaymentDate = NULL');
    }

    if (payrollPeriodId !== undefined) {
      fields.push('PayrollPeriodID = ?');
      values.push(payrollPeriodId ?? null);
    }

    values.push(paymentId);

    const [result] = await connection.execute<ResultSetHeader>(
      `UPDATE loan_payments SET ${fields.join(', ')} WHERE PaymentID = ?`,
      values
    );

    if (result.affectedRows === 0) {
      return NextResponse.json({ message: 'Cuota no encontrada' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Cuota actualizada' });
  } catch (error) {
    console.error('Error al actualizar cuota:', error);
    return NextResponse.json({ message: 'Error al actualizar cuota' }, { status: 500 });
  } finally {
    if (connection) connection.release();
  }
}