import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { validateAndRenewSession } from '@/lib/auth';
import { RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';

const EXTRA_FACTOR = 1.5;

interface PeriodRow extends RowDataPacket {
  PayrollPeriodID: number;
  ProjectID: number;
  WeekNumber: number;
  StartDate: string | Date;
  EndDate: string | Date;
  Status: number;
  TotalWeek: number | null;
  TotalRegularHours: number | null;
  TotalExtraHours: number | null;
  TotalEntries: number | null;
  PayrollID: number | null;
  Total: number | null;
  PayrollStatus: number | null;
  Archivos: string | null;
  MethodID: number | null;
  MethodName: string | null;
}

async function getAuthenticatedUser(request: NextRequest) {
  const sessionId = request.cookies.get('session')?.value;
  if (!sessionId) return null;
  return await validateAndRenewSession(sessionId);
}

const ymd = (d: string | Date) =>
  typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10);

export async function GET(request: NextRequest): Promise<NextResponse> {
  let connection: PoolConnection | undefined;
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    if (!projectId) return NextResponse.json({ message: 'Project ID es requerido' }, { status: 400 });

    connection = (await getConnection()) as PoolConnection;

    const [rows] = await connection.execute<PeriodRow[]>(
      `SELECT
         pp.PayrollPeriodID,
         pp.ProjectID,
         pp.WeekNumber,
         pp.StartDate,
         pp.EndDate,
         pp.Status,
         py.PayrollID,
         py.Total,
         py.Archivos,
         py.MethodID,
         pm.MethodName,
         MAX(py.status) AS PayrollStatus,
         COALESCE(SUM(
           pe.RegularHours * (COALESCE(COALESCE(pc.Salary, ppa.SalaryInProject),0) / 8)
           + pe.ExtraHours * (COALESCE(COALESCE(pc.Salary, ppa.SalaryInProject),0) / 8) * ${EXTRA_FACTOR}
         ), 0) AS TotalWeek,
         COALESCE(SUM(pe.RegularHours), 0) AS TotalRegularHours,
         COALESCE(SUM(pe.ExtraHours), 0)   AS TotalExtraHours,
         COUNT(pe.EntryID)                 AS TotalEntries
       FROM payroll_periods pp
       LEFT JOIN payroll py ON py.PayrollPeriodID = pp.PayrollPeriodID
       LEFT JOIN paymentmethods pm ON pm.MethodID = py.MethodID
       LEFT JOIN payroll_entries pe ON pe.PayrollPeriodID = pp.PayrollPeriodID
       LEFT JOIN projectcontracts pc
         ON pc.ProjectPersonnelID = pe.ProjectPersonnelID
        AND pc.ProjectID = pp.ProjectID
        AND pc.ContractID = (
              SELECT MAX(pc2.ContractID)
              FROM projectcontracts pc2
              WHERE pc2.ProjectPersonnelID = pe.ProjectPersonnelID
                AND pc2.ProjectID = pp.ProjectID
            )
       LEFT JOIN projectpersonnelassignment ppa ON ppa.AssignmentID = pe.AssignmentID
       WHERE pp.ProjectID = ?
       GROUP BY pp.PayrollPeriodID, pp.ProjectID, pp.WeekNumber, pp.StartDate,
                pp.EndDate, pp.Status, py.PayrollID, py.Total, py.status, py.Archivos,
                py.MethodID, pm.MethodName
       ORDER BY pp.StartDate DESC`,
      [projectId]
    );

    return NextResponse.json(
      rows.map(r => ({
        PayrollPeriodID: r.PayrollPeriodID,
        ProjectID: r.ProjectID,
        WeekNumber: r.WeekNumber,
        StartDate: ymd(r.StartDate),
        EndDate: ymd(r.EndDate),
        Status: r.Status,
        TotalWeek: Number(r.TotalWeek) || 0,
        TotalRegularHours: Number(r.TotalRegularHours) || 0,
        TotalExtraHours: Number(r.TotalExtraHours) || 0,
        TotalEntries: Number(r.TotalEntries) || 0,
        Total: r.Total !== null ? Number(r.Total) : null,
        PayrollStatus: r.PayrollStatus !== null ? Number(r.PayrollStatus) : null,
        Archivos: r.Archivos || null,
        MethodID: r.MethodID !== null ? Number(r.MethodID) : null,
        MethodName: r.MethodName || null,
      }))
    );
  } catch (error) {
    console.error('Error al obtener periodos:', error);
    return NextResponse.json({ message: 'Error al obtener periodos' }, { status: 500 });
  } finally {
    if (connection) connection.release();
  }
}