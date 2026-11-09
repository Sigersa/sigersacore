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

// GET: viáticos de todos los empleados de un periodo
export async function GET(request: NextRequest): Promise<NextResponse> {
  let connection: PoolConnection | undefined;
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const periodId = searchParams.get('periodId');
    if (!periodId) return NextResponse.json({ message: 'periodId requerido' }, { status: 400 });

    connection = (await getConnection()) as PoolConnection;

    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT pv.ViaticoID, pv.PayrollPeriodID, pv.ProjectPersonnelID, pv.AssignmentID, pv.DiasViaticos,
              CASE WHEN pv.AssignmentID IS NULL THEN 'PROJECT' ELSE 'BASE' END AS Source,
              CASE
                WHEN pv.AssignmentID IS NULL
                  THEN CONCAT(per.FirstName,' ',per.LastName,' ',IFNULL(per.MiddleName,''))
                ELSE CONCAT(bp.FirstName,' ',bp.LastName,' ',IFNULL(bp.MiddleName,''))
              END AS FullName
       FROM payroll_employee_viaticos pv
       LEFT JOIN projectpersonnel per ON per.ProjectPersonnelID = pv.ProjectPersonnelID
       LEFT JOIN projectpersonnelassignment ppa ON ppa.AssignmentID = pv.AssignmentID
       LEFT JOIN basepersonnel bp ON bp.EmployeeID = ppa.EmployeeID
       WHERE pv.PayrollPeriodID = ?`,
      [periodId]
    );

    return NextResponse.json(rows.map(r => ({
      ViaticoID: r.ViaticoID,
      PayrollPeriodID: r.PayrollPeriodID,
      ProjectPersonnelID: r.ProjectPersonnelID,
      AssignmentID: r.AssignmentID,
      Source: r.Source,
      DiasViaticos: Number(r.DiasViaticos) || 0,
      FullName: r.FullName
    })));
  } catch (error) {
    console.error('Error viáticos GET:', error);
    return NextResponse.json({ message: 'Error' }, { status: 500 });
  } finally {
    if (connection) connection.release();
  }
}

// POST (upsert): guardar días de viáticos
export async function POST(request: NextRequest): Promise<NextResponse> {
  let connection: PoolConnection | undefined;
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { periodId, source, projectPersonnelId, assignmentId, diasViaticos } = await request.json();
    const isBase = source === 'BASE';

    if (!periodId || (isBase ? !assignmentId : !projectPersonnelId)) {
      return NextResponse.json({ message: 'Datos incompletos' }, { status: 400 });
    }

    const dias = Number(diasViaticos) || 0;
    if (dias < 0 || dias > 7) {
      return NextResponse.json({ message: 'Días viáticos debe estar entre 0 y 7' }, { status: 400 });
    }

    connection = (await getConnection()) as PoolConnection;

    const [p] = await connection.execute<RowDataPacket[]>(
      `SELECT Status FROM payroll_periods WHERE PayrollPeriodID = ?`,
      [periodId]
    );
    if (p.length === 0) return NextResponse.json({ message: 'Periodo no existe' }, { status: 404 });
    if (Number(p[0].Status) === 2) {
      return NextResponse.json({ message: 'La semana está cerrada' }, { status: 409 });
    }

    if (isBase) {
      await connection.execute<ResultSetHeader>(
        `INSERT INTO payroll_employee_viaticos
           (PayrollPeriodID, ProjectPersonnelID, AssignmentID, DiasViaticos)
         VALUES (?, NULL, ?, ?)
         ON DUPLICATE KEY UPDATE DiasViaticos = VALUES(DiasViaticos)`,
        [periodId, assignmentId, dias]
      );
    } else {
      await connection.execute<ResultSetHeader>(
        `INSERT INTO payroll_employee_viaticos
           (PayrollPeriodID, ProjectPersonnelID, AssignmentID, DiasViaticos)
         VALUES (?, ?, NULL, ?)
         ON DUPLICATE KEY UPDATE DiasViaticos = VALUES(DiasViaticos)`,
        [periodId, projectPersonnelId, dias]
      );
    }

    return NextResponse.json({ message: 'Viáticos guardados' });
  } catch (error) {
    console.error('Error viáticos POST:', error);
    return NextResponse.json({ message: 'Error' }, { status: 500 });
  } finally {
    if (connection) connection.release();
  }
}

// DELETE: eliminar viáticos de un empleado en un periodo
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  let connection: PoolConnection | undefined;
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const periodId = searchParams.get('periodId');
    const source = searchParams.get('source');
    const projectPersonnelId = searchParams.get('projectPersonnelId');
    const assignmentId = searchParams.get('assignmentId');
    const isBase = source === 'BASE';

    if (!periodId || (isBase ? !assignmentId : !projectPersonnelId)) {
      return NextResponse.json({ message: 'Datos incompletos' }, { status: 400 });
    }

    connection = (await getConnection()) as PoolConnection;

    if (isBase) {
      await connection.execute<ResultSetHeader>(
        `DELETE FROM payroll_employee_viaticos
         WHERE PayrollPeriodID = ? AND AssignmentID = ?`,
        [periodId, assignmentId]
      );
    } else {
      await connection.execute<ResultSetHeader>(
        `DELETE FROM payroll_employee_viaticos
         WHERE PayrollPeriodID = ? AND ProjectPersonnelID = ?`,
        [periodId, projectPersonnelId]
      );
    }

    return NextResponse.json({ message: 'Viáticos eliminados' });
  } catch (error) {
    console.error('Error viáticos DELETE:', error);
    return NextResponse.json({ message: 'Error' }, { status: 500 });
  } finally {
    if (connection) connection.release();
  }
}