import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { validateAndRenewSession } from '@/lib/auth';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import type { PoolConnection } from 'mysql2/promise';

const EXTRA_FACTOR = 1.5;

interface EntryRow extends RowDataPacket {
  EntryID: number;
  PayrollPeriodID: number;
  ProjectPersonnelID: number | null;
  AssignmentID: number | null;
  Source: 'PROJECT' | 'BASE';
  WorkDate: string | Date;
  Shift: 'DIA' | 'NOCHE';
  RegularHours: number;
  ExtraHours: number;
  WorkerName: string | null;
  WorkerPosition: string | null;
  Salary: number | null;
  RegularAmount: number | null;
  ExtraAmount: number | null;
  TotalAmount: number | null;
  DiasViaticos: number | null;
}

async function getAuthenticatedUser(request: NextRequest) {
  const sessionId = request.cookies.get('session')?.value;
  if (!sessionId) return null;
  return await validateAndRenewSession(sessionId);
}

const ymd = (d: string | Date) =>
  typeof d === 'string' ? d.slice(0, 10) : d.toISOString().slice(0, 10);

const normalizeShift = (s: unknown): 'DIA' | 'NOCHE' | null => {
  if (s === 'DIA' || s === 'NOCHE') return s;
  return null;
};

async function assertPeriodOpen(
  connection: PoolConnection,
  periodId: number
): Promise<{ ok: boolean; code?: number; message?: string }> {
  const [rows] = await connection.execute<RowDataPacket[]>(
    `SELECT Status FROM payroll_periods WHERE PayrollPeriodID = ?`,
    [periodId]
  );
  if (rows.length === 0) return { ok: false, code: 404, message: 'Periodo no existe' };
  if (Number(rows[0].Status) === 2) return { ok: false, code: 409, message: 'La semana está cerrada' };
  return { ok: true };
}

// ------------------------------------------------------------
// GET: lista de entradas del periodo
// ------------------------------------------------------------
export async function GET(request: NextRequest): Promise<NextResponse> {
  let connection: PoolConnection | undefined;
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const periodId = searchParams.get('periodId');
    if (!periodId) return NextResponse.json({ message: 'periodId es requerido' }, { status: 400 });

    connection = (await getConnection()) as PoolConnection;

    const [rows] = await connection.execute<EntryRow[]>(
      `SELECT
         pe.EntryID,
         pe.PayrollPeriodID,
         pe.ProjectPersonnelID,
         pe.AssignmentID,
         CASE WHEN pe.AssignmentID IS NULL THEN 'PROJECT' ELSE 'BASE' END AS Source,
         pe.WorkDate,
         pe.Shift,
         pe.RegularHours,
         pe.ExtraHours,
         CASE
           WHEN pe.AssignmentID IS NULL
             THEN CONCAT(per.FirstName,' ',per.LastName,' ',IFNULL(per.MiddleName,''))
           ELSE CONCAT(bp.FirstName,' ',bp.LastName,' ',IFNULL(bp.MiddleName,''))
         END AS WorkerName,
         CASE
           WHEN pe.AssignmentID IS NULL THEN pc.Position
           ELSE ppa.Position
         END AS WorkerPosition,
         CASE
           WHEN pe.AssignmentID IS NULL THEN pc.Salary
           ELSE ppa.SalaryInProject
         END AS Salary,
         (pe.RegularHours * (COALESCE(
            CASE WHEN pe.AssignmentID IS NULL THEN pc.Salary ELSE ppa.SalaryInProject END
         ,0)/8)) AS RegularAmount,
         (pe.ExtraHours * (COALESCE(
            CASE WHEN pe.AssignmentID IS NULL THEN pc.Salary ELSE ppa.SalaryInProject END
         ,0)/8) * ${EXTRA_FACTOR}) AS ExtraAmount,
         ((pe.RegularHours * (COALESCE(
            CASE WHEN pe.AssignmentID IS NULL THEN pc.Salary ELSE ppa.SalaryInProject END
         ,0)/8))
           + (pe.ExtraHours * (COALESCE(
            CASE WHEN pe.AssignmentID IS NULL THEN pc.Salary ELSE ppa.SalaryInProject END
         ,0)/8) * ${EXTRA_FACTOR})) AS TotalAmount,
         pv.DiasViaticos
       FROM payroll_entries pe
       INNER JOIN payroll_periods pp ON pp.PayrollPeriodID = pe.PayrollPeriodID
       LEFT JOIN projectpersonnel per ON per.ProjectPersonnelID = pe.ProjectPersonnelID
       LEFT JOIN projectpersonnelassignment ppa ON ppa.AssignmentID = pe.AssignmentID
       LEFT JOIN basepersonnel bp ON bp.EmployeeID = ppa.EmployeeID
       LEFT JOIN projectcontracts pc
         ON pc.ProjectPersonnelID = pe.ProjectPersonnelID
        AND pc.ProjectID = pp.ProjectID
        AND pc.ContractID = (
              SELECT MAX(pc2.ContractID)
              FROM projectcontracts pc2
              WHERE pc2.ProjectPersonnelID = pe.ProjectPersonnelID
                AND pc2.ProjectID = pp.ProjectID
            )
       LEFT JOIN payroll_employee_viaticos pv
         ON pv.PayrollPeriodID = pe.PayrollPeriodID
        AND (
          (pe.ProjectPersonnelID IS NOT NULL AND pv.ProjectPersonnelID = pe.ProjectPersonnelID)
          OR
          (pe.AssignmentID IS NOT NULL AND pv.AssignmentID = pe.AssignmentID)
        )
       WHERE pe.PayrollPeriodID = ?
       ORDER BY pe.WorkDate ASC, pe.Shift ASC, WorkerName ASC`,
      [periodId]
    );

    return NextResponse.json(
      rows.map(r => ({
        EntryID: r.EntryID,
        PayrollPeriodID: r.PayrollPeriodID,
        ProjectPersonnelID: r.ProjectPersonnelID,
        AssignmentID: r.AssignmentID,
        Source: r.Source,
        WorkDate: ymd(r.WorkDate),
        Shift: r.Shift,
        RegularHours: Number(r.RegularHours),
        ExtraHours: Number(r.ExtraHours),
        WorkerName: r.WorkerName,
        WorkerPosition: r.WorkerPosition,
        Salary: r.Salary !== null ? Number(r.Salary) : null,
        RegularAmount: Number(r.RegularAmount) || 0,
        ExtraAmount: Number(r.ExtraAmount) || 0,
        TotalAmount: Number(r.TotalAmount) || 0,
        DiasViaticos: Number(r.DiasViaticos) || 0
      }))
    );
  } catch (error) {
    console.error('Error al obtener entradas:', error);
    return NextResponse.json({ message: 'Error al obtener entradas' }, { status: 500 });
  } finally {
    if (connection) connection.release();
  }
}

// ------------------------------------------------------------
// POST: crear entrada diaria
// ------------------------------------------------------------
export async function POST(request: NextRequest): Promise<NextResponse> {
  let connection: PoolConnection | undefined;
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const {
      periodId,
      source,
      projectPersonnelId,
      assignmentId,
      workDate,
      shift,
      regularHours,
      extraHours
    } = await request.json();

    const isBase = source === 'BASE';

    if (!periodId || !workDate) {
      return NextResponse.json({ message: 'Datos incompletos' }, { status: 400 });
    }
    if (!isBase && !projectPersonnelId) {
      return NextResponse.json({ message: 'projectPersonnelId requerido para PROJECT' }, { status: 400 });
    }
    if (isBase && !assignmentId) {
      return NextResponse.json({ message: 'assignmentId requerido para BASE' }, { status: 400 });
    }

    const shiftValue = normalizeShift(shift);
    if (!shiftValue) {
      return NextResponse.json({ message: 'Turno inválido (DIA o NOCHE)' }, { status: 400 });
    }

    connection = (await getConnection()) as PoolConnection;

    const open = await assertPeriodOpen(connection, Number(periodId));
    if (!open.ok) return NextResponse.json({ message: open.message }, { status: open.code ?? 400 });

    const [periodRows] = await connection.execute<RowDataPacket[]>(
      `SELECT StartDate, EndDate, ProjectID FROM payroll_periods WHERE PayrollPeriodID = ?`,
      [periodId]
    );
    const start = ymd(periodRows[0].StartDate);
    const end = ymd(periodRows[0].EndDate);
    const projectId = periodRows[0].ProjectID;
    if (workDate < start || workDate > end) {
      return NextResponse.json(
        { message: `La fecha debe estar entre ${start} y ${end}` },
        { status: 400 }
      );
    }

    if (!isBase) {
      const [contractRows] = await connection.execute<RowDataPacket[]>(
        `SELECT Salary FROM projectcontracts
         WHERE ProjectPersonnelID = ? AND ProjectID = ?
         ORDER BY ContractID DESC LIMIT 1`,
        [projectPersonnelId, projectId]
      );
      if (contractRows.length === 0) {
        return NextResponse.json(
          { message: 'El trabajador no tiene contrato en este proyecto' },
          { status: 400 }
        );
      }
    } else {
      const [assignRows] = await connection.execute<RowDataPacket[]>(
        `SELECT AssignmentID FROM projectpersonnelassignment
         WHERE AssignmentID = ? AND ProjectID = ? AND Status = 1`,
        [assignmentId, projectId]
      );
      if (assignRows.length === 0) {
        return NextResponse.json(
          { message: 'La asignación BASE no existe o no está activa en este proyecto' },
          { status: 400 }
        );
      }
    }

    const regH = Number(regularHours) || 0;
    const extH = Number(extraHours) || 0;

    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO payroll_entries
         (PayrollPeriodID, ProjectPersonnelID, AssignmentID, WorkDate, Shift, RegularHours, ExtraHours)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        periodId,
        isBase ? null : projectPersonnelId,
        isBase ? assignmentId : null,
        workDate,
        shiftValue,
        regH,
        extH
      ]
    );

    return NextResponse.json({ message: 'Entrada creada', id: result.insertId }, { status: 201 });
  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') {
      return NextResponse.json(
        { message: 'Ya existe una entrada para ese trabajador en esa fecha y turno' },
        { status: 409 }
      );
    }
    console.error('Error al crear entrada:', error);
    return NextResponse.json({ message: 'Error al crear entrada' }, { status: 500 });
  } finally {
    if (connection) connection.release();
  }
}

// ------------------------------------------------------------
// PUT: actualizar entrada diaria
// ------------------------------------------------------------
export async function PUT(request: NextRequest): Promise<NextResponse> {
  let connection: PoolConnection | undefined;
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ message: 'ID es requerido' }, { status: 400 });

    const {
      source,
      projectPersonnelId,
      assignmentId,
      workDate,
      shift,
      regularHours,
      extraHours
    } = await request.json();

    const isBase = source === 'BASE';

    const shiftValue = normalizeShift(shift);
    if (!shiftValue) {
      return NextResponse.json({ message: 'Turno inválido (DIA o NOCHE)' }, { status: 400 });
    }

    connection = (await getConnection()) as PoolConnection;

    const [existing] = await connection.execute<RowDataPacket[]>(
      `SELECT * FROM payroll_entries WHERE EntryID = ?`,
      [id]
    );
    if (existing.length === 0) return NextResponse.json({ message: 'Entrada no encontrada' }, { status: 404 });

    const open = await assertPeriodOpen(connection, existing[0].PayrollPeriodID);
    if (!open.ok) return NextResponse.json({ message: open.message }, { status: open.code ?? 400 });

    const regH = Number(regularHours) || 0;
    const extH = Number(extraHours) || 0;

    const [result] = await connection.execute<ResultSetHeader>(
      `UPDATE payroll_entries SET
         ProjectPersonnelID = ?,
         AssignmentID = ?,
         WorkDate = ?,
         Shift = ?,
         RegularHours = ?,
         ExtraHours = ?
       WHERE EntryID = ?`,
      [
        isBase ? null : projectPersonnelId,
        isBase ? assignmentId : null,
        workDate,
        shiftValue,
        regH,
        extH,
        id
      ]
    );

    return NextResponse.json({ message: 'Entrada actualizada', affectedRows: result.affectedRows });
  } catch (error: any) {
    if (error.code === 'ER_DUP_ENTRY') {
      return NextResponse.json(
        { message: 'Ya existe una entrada para ese trabajador en esa fecha y turno' },
        { status: 409 }
      );
    }
    console.error('Error al actualizar entrada:', error);
    return NextResponse.json({ message: 'Error al actualizar entrada' }, { status: 500 });
  } finally {
    if (connection) connection.release();
  }
}

// ------------------------------------------------------------
// DELETE: eliminar entrada diaria
// ------------------------------------------------------------
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  let connection: PoolConnection | undefined;
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) return NextResponse.json({ message: 'ID es requerido' }, { status: 400 });

    connection = (await getConnection()) as PoolConnection;

    const [existing] = await connection.execute<RowDataPacket[]>(
      `SELECT PayrollPeriodID FROM payroll_entries WHERE EntryID = ?`,
      [id]
    );
    if (existing.length === 0) return NextResponse.json({ message: 'No encontrada' }, { status: 404 });

    const open = await assertPeriodOpen(connection, existing[0].PayrollPeriodID);
    if (!open.ok) return NextResponse.json({ message: open.message }, { status: open.code ?? 400 });

    const [result] = await connection.execute<ResultSetHeader>(
      `DELETE FROM payroll_entries WHERE EntryID = ?`,
      [id]
    );
    if (result.affectedRows === 0) return NextResponse.json({ message: 'No encontrada' }, { status: 404 });
    return NextResponse.json({ message: 'Entrada eliminada', affectedRows: result.affectedRows });
  } catch (error) {
    console.error('Error al eliminar entrada:', error);
    return NextResponse.json({ message: 'Error al eliminar entrada' }, { status: 500 });
  } finally {
    if (connection) connection.release();
  }
}