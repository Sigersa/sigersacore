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

// GET: lista de INFONAVIT del personal del proyecto
export async function GET(request: NextRequest): Promise<NextResponse> {
  let connection: PoolConnection | undefined;
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    if (!projectId) return NextResponse.json({ message: 'projectId requerido' }, { status: 400 });

    connection = (await getConnection()) as PoolConnection;

    const [rows] = await connection.execute<RowDataPacket[]>(
      `SELECT
         ei.InfonavitID,
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
         SELECT pp2.EmployeeID
         FROM projectpersonnel pp2
         INNER JOIN projectcontracts pc ON pc.ProjectPersonnelID = pp2.ProjectPersonnelID
         WHERE pc.ProjectID = ?
         UNION
         SELECT ppa.EmployeeID
         FROM projectpersonnelassignment ppa
         WHERE ppa.ProjectID = ? AND ppa.Status = 1
       )
       ORDER BY FullName ASC`,
      [projectId, projectId]
    );

    return NextResponse.json(rows.map(r => ({
      InfonavitID: r.InfonavitID,
      EmployeeID: r.EmployeeID,
      DailyAmount: Number(r.DailyAmount) || 0,
      FullName: r.FullName
    })));
  } catch (error) {
    console.error('Error infonavit GET:', error);
    return NextResponse.json({ message: 'Error' }, { status: 500 });
  } finally {
    if (connection) connection.release();
  }
}

// POST (upsert): recibe source + id, resuelve EmployeeID en el servidor
export async function POST(request: NextRequest): Promise<NextResponse> {
  let connection: PoolConnection | undefined;
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const body = await request.json();
    const { source, projectPersonnelId, assignmentId, dailyAmount } = body;

    const isBase = source === 'BASE';

    if (isBase && !assignmentId) {
      return NextResponse.json({ message: 'assignmentId requerido para BASE' }, { status: 400 });
    }
    if (!isBase && !projectPersonnelId) {
      return NextResponse.json({ message: 'projectPersonnelId requerido para PROJECT' }, { status: 400 });
    }

    const amount = Number(dailyAmount) || 0;
    if (amount < 0) {
      return NextResponse.json({ message: 'El monto no puede ser negativo' }, { status: 400 });
    }

    connection = (await getConnection()) as PoolConnection;

    // Resolver EmployeeID en el servidor (así no dependemos del front)
    let employeeId: number | null = null;

    if (isBase) {
      const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT EmployeeID FROM projectpersonnelassignment WHERE AssignmentID = ? LIMIT 1`,
        [assignmentId]
      );
      if (rows.length === 0) {
        return NextResponse.json({ message: 'Asignación no encontrada' }, { status: 404 });
      }
      employeeId = Number(rows[0].EmployeeID);
    } else {
      const [rows] = await connection.execute<RowDataPacket[]>(
        `SELECT EmployeeID FROM projectpersonnel WHERE ProjectPersonnelID = ? LIMIT 1`,
        [projectPersonnelId]
      );
      if (rows.length === 0) {
        return NextResponse.json({ message: 'Trabajador de proyecto no encontrado' }, { status: 404 });
      }
      employeeId = Number(rows[0].EmployeeID);
    }

    if (!employeeId) {
      return NextResponse.json({ message: 'No se pudo resolver el EmployeeID' }, { status: 400 });
    }

    // Si monto = 0 → eliminar (no tiene INFONAVIT)
    if (amount === 0) {
      await connection.execute<ResultSetHeader>(
        `DELETE FROM employee_infonavit WHERE EmployeeID = ?`,
        [employeeId]
      );
      return NextResponse.json({ message: 'INFONAVIT eliminado' });
    }

    await connection.execute<ResultSetHeader>(
      `INSERT INTO employee_infonavit (EmployeeID, DailyAmount)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE DailyAmount = VALUES(DailyAmount)`,
      [employeeId, amount]
    );

    return NextResponse.json({ message: 'INFONAVIT guardado', employeeId });
  } catch (error) {
    console.error('Error infonavit POST:', error);
    return NextResponse.json({ message: 'Error' }, { status: 500 });
  } finally {
    if (connection) connection.release();
  }
}