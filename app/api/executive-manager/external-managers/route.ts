import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from "@/lib/db";
import { validateAndRenewSession } from "@/lib/auth";
import { RowDataPacket, ResultSetHeader } from 'mysql2';

interface ExternalProjectManager extends RowDataPacket {
  ExternalProjectManagerID: number;
  NameProjectManager: string;
  ClientID: number;
  Email: string | null;
  Phone: string | null;
}

interface Client extends RowDataPacket {
  ClientID: number;
  ClientName: string;
}

// GET - Obtener todos los Project Managers Externos
export async function GET(request: NextRequest): Promise<NextResponse> {
  let connection = null;
  
  try {
    // Validar sesión
    const sessionId = request.cookies.get("session")?.value;
    
    if (!sessionId) {
      return NextResponse.json({ error: "NO AUTORIZADO" }, { status: 401 });
    }

    const user = await validateAndRenewSession(sessionId);
    
    if (!user) {
      return NextResponse.json({ error: "SESIÓN INVÁLIDA" }, { status: 401 });
    }

    connection = await getConnection();

    const [managers] = await connection.query<ExternalProjectManager[]>(
      `SELECT 
          epm.ExternalProjectManagerID,
          epm.NameProjectManager,
          epm.ClientID,
          epm.Email,
          epm.Phone,
          c.ClientName
        FROM externalprojectmanager epm
        LEFT JOIN clients c ON epm.ClientID = c.ClientID
        ORDER BY epm.NameProjectManager ASC`
    );

    return NextResponse.json(managers);
  } catch (error) {
    console.error('Error al obtener project managers externos:', error);
    return NextResponse.json(
      { message: 'Error al obtener project managers externos' },
      { status: 500 }
    );
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

// POST - Crear nuevo Project Manager Externo
export async function POST(request: NextRequest): Promise<NextResponse> {
  let connection = null;
  
  try {
    // Validar sesión
    const sessionId = request.cookies.get("session")?.value;
    
    if (!sessionId) {
      return NextResponse.json({ error: "NO AUTORIZADO" }, { status: 401 });
    }

    const user = await validateAndRenewSession(sessionId);
    
    if (!user) {
      return NextResponse.json({ error: "SESIÓN INVÁLIDA" }, { status: 401 });
    }

    const {
      NameProjectManager,
      ClientID,
      Email,
      Phone
    } = await request.json();

    // Validación de campos requeridos
    if (!NameProjectManager || !ClientID) {
      return NextResponse.json(
        { message: 'El nombre del Project Manager y el Cliente son requeridos' },
        { status: 400 }
      );
    }

    connection = await getConnection();
    await connection.beginTransaction();

    // Verificar que el cliente existe
    const [clientRows] = await connection.query<Client[]>(
      `SELECT ClientID FROM clients WHERE ClientID = ?`,
      [ClientID]
    );

    if (clientRows.length === 0) {
      await connection.rollback();
      return NextResponse.json(
        { message: 'El cliente seleccionado no existe' },
        { status: 404 }
      );
    }

    // Insertar el registro
    const [result] = await connection.query<ResultSetHeader>(
      `INSERT INTO externalprojectmanager 
       (NameProjectManager, ClientID, Email, Phone) 
       VALUES (?, ?, ?, ?)`,
      [
        NameProjectManager,
        ClientID,
        Email || null,
        Phone || null
      ]
    );

    const ExternalProjectManagerID = result.insertId;

    await connection.commit();

    return NextResponse.json({ 
      message: 'Project Manager Externo creado correctamente',
      ExternalProjectManagerID,
      NameProjectManager,
      ClientID,
      Email,
      Phone
    }, { status: 201 });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Error al crear project manager externo:', error);
    return NextResponse.json(
      { message: 'Error al crear project manager externo' },
      { status: 500 }
    );
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

// PUT - Actualizar Project Manager Externo existente
export async function PUT(request: NextRequest): Promise<NextResponse> {
  let connection = null;
  
  try {
    // Validar sesión
    const sessionId = request.cookies.get("session")?.value;
    
    if (!sessionId) {
      return NextResponse.json({ error: "NO AUTORIZADO" }, { status: 401 });
    }

    const user = await validateAndRenewSession(sessionId);
    
    if (!user) {
      return NextResponse.json({ error: "SESIÓN INVÁLIDA" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { message: 'ID es requerido' },
        { status: 400 }
      );
    }

    const {
      NameProjectManager,
      ClientID,
      Email,
      Phone
    } = await request.json();

    // Validación de campos requeridos
    if (!NameProjectManager || !ClientID) {
      return NextResponse.json(
        { message: 'El nombre del Project Manager y el Cliente son requeridos' },
        { status: 400 }
      );
    }

    connection = await getConnection();
    await connection.beginTransaction();

    // Verificar que el Project Manager existe
    const [managerRows] = await connection.query<ExternalProjectManager[]>(
      `SELECT * FROM externalprojectmanager WHERE ExternalProjectManagerID = ?`,
      [id]
    );
    
    if (managerRows.length === 0) {
      await connection.rollback();
      return NextResponse.json(
        { message: 'Project Manager no encontrado' },
        { status: 404 }
      );
    }

    // Verificar que el cliente existe (si se está cambiando)
    const [clientRows] = await connection.query<Client[]>(
      `SELECT ClientID FROM clients WHERE ClientID = ?`,
      [ClientID]
    );

    if (clientRows.length === 0) {
      await connection.rollback();
      return NextResponse.json(
        { message: 'El cliente seleccionado no existe' },
        { status: 404 }
      );
    }

    // Verificar si hay cambios reales
    const manager = managerRows[0];
    const hasChanges = 
      manager.NameProjectManager !== NameProjectManager ||
      manager.ClientID !== ClientID ||
      (manager.Email || '') !== (Email || '') ||
      (manager.Phone || '') !== (Phone || '');

    // Si no hay cambios, retornar sin actualizar
    if (!hasChanges) {
      await connection.commit();
      return NextResponse.json({ 
        message: 'No se realizaron cambios',
        ExternalProjectManagerID: parseInt(id),
        NameProjectManager,
        ClientID,
        Email,
        Phone
      });
    }

    // Actualizar el registro
    const [result] = await connection.query<ResultSetHeader>(
      `UPDATE externalprojectmanager SET
        NameProjectManager = ?,
        ClientID = ?,
        Email = ?,
        Phone = ?
       WHERE ExternalProjectManagerID = ?`,
      [
        NameProjectManager,
        ClientID,
        Email || null,
        Phone || null,
        id
      ]
    );

    await connection.commit();

    return NextResponse.json({ 
      message: 'Project Manager actualizado correctamente',
      affectedRows: result.affectedRows,
      ExternalProjectManagerID: parseInt(id),
      NameProjectManager,
      ClientID,
      Email,
      Phone
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Error al actualizar project manager externo:', error);
    return NextResponse.json(
      { message: 'Error al actualizar project manager externo' },
      { status: 500 }
    );
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

// DELETE - Eliminar Project Manager Externo
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  let connection = null;
  
  try {
    // Validar sesión
    const sessionId = request.cookies.get("session")?.value;
    
    if (!sessionId) {
      return NextResponse.json({ error: "NO AUTORIZADO" }, { status: 401 });
    }

    const user = await validateAndRenewSession(sessionId);
    
    if (!user) {
      return NextResponse.json({ error: "SESIÓN INVÁLIDA" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json(
        { message: 'ID es requerido' },
        { status: 400 }
      );
    }

    connection = await getConnection();
    await connection.beginTransaction();

    // Verificar que el Project Manager existe
    const [managerRows] = await connection.query<ExternalProjectManager[]>(
      `SELECT * FROM externalprojectmanager WHERE ExternalProjectManagerID = ?`,
      [id]
    );
    
    if (managerRows.length === 0) {
      await connection.rollback();
      return NextResponse.json(
        { message: 'No se encontró el Project Manager a eliminar' },
        { status: 404 }
      );
    }

    // Verificar si tiene proyectos asociados
    const [projectRows] = await connection.query<RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM projects WHERE ExternalProjectManagerID = ?`,
      [id]
    );

    if (projectRows[0].count > 0) {
      await connection.rollback();
      return NextResponse.json(
        { 
          message: 'No se puede eliminar el Project Manager porque tiene proyectos asociados. Reasigne los proyectos primero.' 
        },
        { status: 409 }
      );
    }

    // Eliminar el registro
    const [result] = await connection.query<ResultSetHeader>(
      `DELETE FROM externalprojectmanager WHERE ExternalProjectManagerID = ?`,
      [id]
    );

    await connection.commit();

    return NextResponse.json({ 
      message: 'Project Manager eliminado correctamente',
      affectedRows: result.affectedRows 
    });
  } catch (error: any) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Error al eliminar project manager externo:', error);

    // Manejar errores de clave foránea
    if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.code === 'ER_ROW_IS_REFERENCED') {
      return NextResponse.json(
        { 
          message: 'No se puede eliminar el Project Manager porque tiene registros dependientes en otras tablas.' 
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { message: 'Error al eliminar project manager externo' },
      { status: 500 }
    );
  } finally {
    if (connection) {
      connection.release();
    }
  }
}