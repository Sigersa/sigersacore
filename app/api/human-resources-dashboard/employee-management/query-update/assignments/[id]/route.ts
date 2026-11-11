import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from "@/lib/db";
import { validateAndRenewSession } from "@/lib/auth";

// PUT: Actualizar asignación por ID
// ⚠️ El Status NO se recibe del frontend: se re-sincroniza con employees.Status
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let connection;
  try {
    const { id } = await params;
    const assignmentId = id;

    const sessionId = request.cookies.get("session")?.value;
    if (!sessionId) return NextResponse.json({ success: false, message: 'NO AUTORIZADO' }, { status: 401 });

    const user = await validateAndRenewSession(sessionId);
    if (!user) return NextResponse.json({ success: false, message: 'SESIÓN INVÁLIDA O EXPIRADA' }, { status: 401 });
    if (user.UserTypeID !== 2 && user.UserTypeID !== 1) {
      return NextResponse.json({ success: false, message: 'ACCESO DENEGADO' }, { status: 403 });
    }

    if (!assignmentId) {
      return NextResponse.json({ success: false, message: 'ID DE ASIGNACIÓN REQUERIDO' }, { status: 400 });
    }

    const body = await request.json();
    const { assignment } = body;

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

    // Obtener el EmployeeID de la asignación
    const [assignRows] = await connection.execute(
      `SELECT EmployeeID FROM projectpersonnelassignment WHERE AssignmentID = ?`,
      [assignmentId]
    ) as any;

    if (!Array.isArray(assignRows) || assignRows.length === 0) {
      return NextResponse.json({ success: false, message: 'ASIGNACIÓN NO ENCONTRADA' }, { status: 404 });
    }

    const employeeId = assignRows[0].EmployeeID;

    // Obtener Status actual del empleado (fuente de verdad)
    const [empRows] = await connection.execute(
      `SELECT Status FROM employees WHERE EmployeeID = ?`,
      [employeeId]
    ) as any;

    const employeeStatus = Array.isArray(empRows) && empRows.length > 0 ? empRows[0].Status : 1;

    const startDate = assignment.StartDate ? String(assignment.StartDate).split('T')[0] : null;
    const endDate = assignment.EndDate ? String(assignment.EndDate).split('T')[0] : null;

    if (endDate && startDate && endDate < startDate) {
      return NextResponse.json({ success: false, message: 'LA FECHA DE FIN NO PUEDE SER MENOR QUE LA FECHA DE INICIO' }, { status: 400 });
    }

    const [result] = await connection.execute(
      `UPDATE projectpersonnelassignment SET
        ProjectID = ?,
        RoleInProject = ?,
        Position = ?,
        StartDate = ?,
        EndDate = ?,
        WorkSchedule = ?,
        SalaryInProject = ?,
        Residence = ?,
        Status = ?,
        Observations = ?
       WHERE AssignmentID = ?`,
      [
        assignment.ProjectID,
        assignment.RoleInProject ? String(assignment.RoleInProject).toUpperCase() : '',
        assignment.Position ? String(assignment.Position).toUpperCase() : '',
        startDate,
        endDate,
        assignment.WorkSchedule ? String(assignment.WorkSchedule).toUpperCase() : '',
        assignment.SalaryInProject !== null && assignment.SalaryInProject !== undefined && assignment.SalaryInProject !== ''
          ? parseFloat(assignment.SalaryInProject)
          : null,
        assignment.Residence ? String(assignment.Residence).toUpperCase() : '',
        employeeStatus, // ⚠️ Se hereda de employees.Status
        assignment.Observations ? String(assignment.Observations).toUpperCase() : '',
        assignmentId
      ]
    ) as any;

    if (result.affectedRows === 0) {
      return NextResponse.json({ success: false, message: 'ASIGNACIÓN NO ENCONTRADA' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'ASIGNACIÓN ACTUALIZADA EXITOSAMENTE'
    });
  } catch (error) {
    console.error('Error al actualizar asignación:', error);
    return NextResponse.json({
      success: false,
      message: 'ERROR AL ACTUALIZAR LA ASIGNACIÓN',
      error: process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : undefined
    }, { status: 500 });
  } finally {
    if (connection) {
      try { await connection.release(); } catch (e) { console.error(e); }
    }
  }
}

// DELETE: Eliminar asignación por ID
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let connection;
  try {
    const { id } = await params;
    const assignmentId = id;

    const sessionId = request.cookies.get("session")?.value;
    if (!sessionId) return NextResponse.json({ success: false, message: 'NO AUTORIZADO' }, { status: 401 });

    const user = await validateAndRenewSession(sessionId);
    if (!user) return NextResponse.json({ success: false, message: 'SESIÓN INVÁLIDA O EXPIRADA' }, { status: 401 });
    if (user.UserTypeID !== 2 && user.UserTypeID !== 1) {
      return NextResponse.json({ success: false, message: 'ACCESO DENEGADO' }, { status: 403 });
    }

    if (!assignmentId) {
      return NextResponse.json({ success: false, message: 'ID DE ASIGNACIÓN REQUERIDO' }, { status: 400 });
    }

    connection = await getConnection();

    const [result] = await connection.execute(
      `DELETE FROM projectpersonnelassignment WHERE AssignmentID = ?`,
      [assignmentId]
    ) as any;

    if (result.affectedRows === 0) {
      return NextResponse.json({ success: false, message: 'ASIGNACIÓN NO ENCONTRADA' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      message: 'ASIGNACIÓN ELIMINADA EXITOSAMENTE'
    });
  } catch (error) {
    console.error('Error al eliminar asignación:', error);
    return NextResponse.json({
      success: false,
      message: 'ERROR AL ELIMINAR LA ASIGNACIÓN',
      error: process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : undefined
    }, { status: 500 });
  } finally {
    if (connection) {
      try { await connection.release(); } catch (e) { console.error(e); }
    }
  }
}