import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { validateAndRenewSession } from '@/lib/auth';
import { RowDataPacket } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';

async function getAuthenticatedUser(request: NextRequest) {
  const sessionId = request.cookies.get('session')?.value;
  if (!sessionId) return null;
  return await validateAndRenewSession(sessionId);
}

interface WorkerRow extends RowDataPacket {
  ProjectPersonnelID: number | null;
  AssignmentID: number | null;
  EmployeeID: number;
  Source: 'PROJECT' | 'BASE';
  FirstName: string | null;
  LastName: string | null;
  MiddleName: string | null;
  Position: string | null;
  SalaryIMSS: number | null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  let connection: PoolConnection | undefined;
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get('projectId');
    if (!projectId) return NextResponse.json({ message: 'projectId requerido' }, { status: 400 });

    connection = (await getConnection()) as PoolConnection;

    // 1) Personal de PROYECTO (con contrato vigente en este proyecto)
    //    Salario a mostrar: projectcontracts.SalaryIMSS
    const [projectRows] = await connection.execute<WorkerRow[]>(
      `SELECT
         pp.ProjectPersonnelID,
         NULL AS AssignmentID,
         pp.EmployeeID,
         'PROJECT' AS Source,
         pp.FirstName,
         pp.LastName,
         pp.MiddleName,
         pc.Position,
         pc.SalaryIMSS
       FROM projectpersonnel pp
       INNER JOIN projectcontracts pc
         ON pc.ProjectPersonnelID = pp.ProjectPersonnelID
        AND pc.ProjectID = ?
        AND pc.ContractID = (
              SELECT MAX(pc2.ContractID)
              FROM projectcontracts pc2
              WHERE pc2.ProjectPersonnelID = pp.ProjectPersonnelID
                AND pc2.ProjectID = ?
            )
       ORDER BY pp.LastName ASC, pp.FirstName ASC`,
      [projectId, projectId]
    );

    // 2) Personal BASE asignado al proyecto (activo)
    //    Salario a mostrar: basecontracts.SalaryIMSS (último contrato)
    const [baseRows] = await connection.execute<WorkerRow[]>(
      `SELECT
         NULL AS ProjectPersonnelID,
         ppa.AssignmentID,
         ppa.EmployeeID,
         'BASE' AS Source,
         bp.FirstName,
         bp.LastName,
         bp.MiddleName,
         COALESCE(ppa.Position, bp.Position) AS Position,
         (
           SELECT bc.SalaryIMSS
           FROM basecontracts bc
           WHERE bc.BasePersonnelID = bp.BasePersonnelID
           ORDER BY bc.ContractID DESC
           LIMIT 1
         ) AS SalaryIMSS
       FROM projectpersonnelassignment ppa
       INNER JOIN basepersonnel bp ON bp.EmployeeID = ppa.EmployeeID
       WHERE ppa.ProjectID = ? AND ppa.Status = 1
       ORDER BY bp.LastName ASC, bp.FirstName ASC`,
      [projectId]
    );

    const mapRow = (r: WorkerRow) => ({
      ProjectPersonnelID: r.ProjectPersonnelID,
      AssignmentID: r.AssignmentID,
      EmployeeID: r.EmployeeID,
      Source: r.Source,
      // Nombre, Apellido Paterno, Apellido Materno
      FullName: `${r.FirstName || ''} ${r.LastName || ''} ${r.MiddleName || ''}`.trim().replace(/\s+/g, ' '),
      Position: r.Position,
      SalaryIMSS: r.SalaryIMSS !== null ? Number(r.SalaryIMSS) : null
    });

    // Orden final: PROJECT primero, luego BASE
    const workers = [...projectRows.map(mapRow), ...baseRows.map(mapRow)];

    return NextResponse.json(workers);
  } catch (error) {
    console.error('Error al obtener personal:', error);
    return NextResponse.json({ message: 'Error al obtener personal' }, { status: 500 });
  } finally {
    if (connection) connection.release();
  }
}