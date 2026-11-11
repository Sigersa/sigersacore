import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from "@/lib/db";
import { validateAndRenewSession } from "@/lib/auth";

const normalizarMayusculas = (texto: string): string => {
  if (!texto) return '';
  return texto.toUpperCase();
};

const formatearFechaMySQL = (fecha: string | null | undefined): string | null => {
  if (!fecha) return null;
  try {
    if (fecha.includes('T')) return fecha.split('T')[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return fecha;
    return fecha;
  } catch {
    return null;
  }
};

// POST: Crear asignación
// ⚠️ Status NO se captura en frontend: se hereda de employees.Status
export async function POST(request: NextRequest) {
  let connection;
  try {
    const sessionId = request.cookies.get("session")?.value;
    if (!sessionId) return NextResponse.json({ success: false, message: 'NO AUTORIZADO' }, { status: 401 });

    const user = await validateAndRenewSession(sessionId);
    if (!user) return NextResponse.json({ success: false, message: 'SESIÓN INVÁLIDA O EXPIRADA' }, { status: 401 });
    if (user.UserTypeID !== 2 && user.UserTypeID !== 1) {
      return NextResponse.json({ success: false, message: 'ACCESO DENEGADO' }, { status: 403 });
    }

    const body = await request.json();
    const { employeeId, assignment } = body;

    if (!employeeId) {
      return NextResponse.json({ success: false, message: 'EL ID DEL EMPLEADO ES REQUERIDO' }, { status: 400 });
    }
    if (!assignment || !assignment.ProjectID) {
      return NextResponse.json({ success: false, message: 'EL PROYECTO ES REQUERIDO' }, { status: 400 });
    }
    if (!assignment.Position) {
      return NextResponse.json({ success: false, message: 'EL PUESTO ES REQUERIDO' }, { status: 400 });
    }
    if (!assignment.StartDate) {
      return NextResponse.json({ success: false, message: 'LA FECHA DE INICIO ES REQUERIDA' }, { status: 400 });
    }

    connection = await getConnection();

    // Verificar que el empleado sea BASE y obtener su Status
    const [empRows] = await connection.execute(
      `SELECT EmployeeID, EmployeeType, Status FROM employees WHERE EmployeeID = ?`,
      [employeeId]
    ) as any;

    if (!Array.isArray(empRows) || empRows.length === 0) {
      return NextResponse.json({ success: false, message: 'EMPLEADO NO ENCONTRADO' }, { status: 404 });
    }
    if (empRows[0].EmployeeType !== 'BASE') {
      return NextResponse.json({ success: false, message: 'SOLO SE PUEDE ASIGNAR PERSONAL BASE A PROYECTOS' }, { status: 400 });
    }

    const employeeStatus = empRows[0].Status ?? 1; // ⚠️ Heredado de employees

    // Verificar que el proyecto exista
    const [projRows] = await connection.execute(
      `SELECT ProjectID FROM projects WHERE ProjectID = ?`,
      [assignment.ProjectID]
    ) as any;
    if (!Array.isArray(projRows) || projRows.length === 0) {
      return NextResponse.json({ success: false, message: 'EL PROYECTO NO EXISTE' }, { status: 400 });
    }

    const startDate = formatearFechaMySQL(assignment.StartDate);
    const endDate = formatearFechaMySQL(assignment.EndDate);

    if (endDate && startDate && endDate < startDate) {
      return NextResponse.json({ success: false, message: 'LA FECHA DE FIN NO PUEDE SER MENOR QUE LA FECHA DE INICIO' }, { status: 400 });
    }

    const [result] = await connection.execute(
      `INSERT INTO projectpersonnelassignment 
        (EmployeeID, ProjectID, RoleInProject, Position, StartDate, EndDate, WorkSchedule, SalaryInProject, Residence, Status, Observations)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        employeeId,
        assignment.ProjectID,
        normalizarMayusculas(assignment.RoleInProject || ''),
        normalizarMayusculas(assignment.Position || ''),
        startDate,
        endDate,
        normalizarMayusculas(assignment.WorkSchedule || ''),
        assignment.SalaryInProject !== null && assignment.SalaryInProject !== undefined && assignment.SalaryInProject !== ''
          ? parseFloat(assignment.SalaryInProject)
          : null,
        normalizarMayusculas(assignment.Residence || ''),
        employeeStatus, // ⚠️ Heredado de employees.Status
        normalizarMayusculas(assignment.Observations || '')
      ]
    ) as any;

    return NextResponse.json({
      success: true,
      message: 'ASIGNACIÓN CREADA EXITOSAMENTE',
      assignmentId: result.insertId
    });
  } catch (error) {
    console.error('Error al crear asignación:', error);
    return NextResponse.json({
      success: false,
      message: 'ERROR AL CREAR LA ASIGNACIÓN',
      error: process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : undefined
    }, { status: 500 });
  } finally {
    if (connection) {
      try { await connection.release(); } catch (e) { console.error(e); }
    }
  }
}