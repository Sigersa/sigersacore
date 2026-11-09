import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from "@/lib/db";
import { validateAndRenewSession } from "@/lib/auth";
import { RowDataPacket, ResultSetHeader } from 'mysql2';

interface SiteManager extends RowDataPacket {
  SiteManagerID: number;
  NameSiteManager: string;
  ClientID: number;
  Email: string | null;
  Phone: string | null;
}

interface Client extends RowDataPacket {
  ClientID: number;
  ClientName: string;
}

// GET - Obtener todos los Site Managers
export async function GET(request: NextRequest): Promise<NextResponse> {
  let connection = null;

  try {
    const sessionId = request.cookies.get("session")?.value;

    if (!sessionId) {
      return NextResponse.json({ error: "NO AUTORIZADO" }, { status: 401 });
    }

    const user = await validateAndRenewSession(sessionId);

    if (!user) {
      return NextResponse.json({ error: "SESIÓN INVÁLIDA" }, { status: 401 });
    }

    connection = await getConnection();

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get('clientId');

    let query = `
      SELECT
        sm.SiteManagerID,
        sm.NameSiteManager,
        sm.ClientID,
        sm.Email,
        sm.Phone,
        c.ClientName
      FROM sitemanager sm
      LEFT JOIN clients c ON sm.ClientID = c.ClientID
    `;
    const params: any[] = [];

    if (clientId) {
      query += ` WHERE sm.ClientID = ?`;
      params.push(clientId);
    }

    query += ` ORDER BY sm.NameSiteManager ASC`;

    const [managers] = await connection.query<SiteManager[]>(query, params);

    return NextResponse.json(managers);
  } catch (error) {
    console.error('Error al obtener site managers:', error);
    return NextResponse.json(
      { message: 'Error al obtener site managers' },
      { status: 500 }
    );
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

// POST - Crear nuevo Site Manager
export async function POST(request: NextRequest): Promise<NextResponse> {
  let connection = null;

  try {
    const sessionId = request.cookies.get("session")?.value;

    if (!sessionId) {
      return NextResponse.json({ error: "NO AUTORIZADO" }, { status: 401 });
    }

    const user = await validateAndRenewSession(sessionId);

    if (!user) {
      return NextResponse.json({ error: "SESIÓN INVÁLIDA" }, { status: 401 });
    }

    const { NameSiteManager, ClientID, Email, Phone } = await request.json();

    if (!NameSiteManager || !ClientID) {
      return NextResponse.json(
        { message: 'El nombre del Site Manager y el Cliente son requeridos' },
        { status: 400 }
      );
    }

    connection = await getConnection();
    await connection.beginTransaction();

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

    const [result] = await connection.query<ResultSetHeader>(
      `INSERT INTO sitemanager (NameSiteManager, ClientID, Email, Phone)
       VALUES (?, ?, ?, ?)`,
      [NameSiteManager, ClientID, Email || null, Phone || null]
    );

    const SiteManagerID = result.insertId;

    await connection.commit();

    return NextResponse.json({
      message: 'Site Manager creado correctamente',
      SiteManagerID,
      NameSiteManager,
      ClientID,
      Email,
      Phone
    }, { status: 201 });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Error al crear site manager:', error);
    return NextResponse.json(
      { message: 'Error al crear site manager' },
      { status: 500 }
    );
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

// PUT - Actualizar Site Manager
export async function PUT(request: NextRequest): Promise<NextResponse> {
  let connection = null;

  try {
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
      return NextResponse.json({ message: 'ID es requerido' }, { status: 400 });
    }

    const { NameSiteManager, ClientID, Email, Phone } = await request.json();

    if (!NameSiteManager || !ClientID) {
      return NextResponse.json(
        { message: 'El nombre del Site Manager y el Cliente son requeridos' },
        { status: 400 }
      );
    }

    connection = await getConnection();
    await connection.beginTransaction();

    const [managerRows] = await connection.query<SiteManager[]>(
      `SELECT * FROM sitemanager WHERE SiteManagerID = ?`,
      [id]
    );

    if (managerRows.length === 0) {
      await connection.rollback();
      return NextResponse.json(
        { message: 'Site Manager no encontrado' },
        { status: 404 }
      );
    }

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

    const manager = managerRows[0];
    const hasChanges =
      manager.NameSiteManager !== NameSiteManager ||
      manager.ClientID !== ClientID ||
      (manager.Email || '') !== (Email || '') ||
      (manager.Phone || '') !== (Phone || '');

    if (!hasChanges) {
      await connection.commit();
      return NextResponse.json({
        message: 'No se realizaron cambios',
        SiteManagerID: parseInt(id),
        NameSiteManager,
        ClientID,
        Email,
        Phone
      });
    }

    const [result] = await connection.query<ResultSetHeader>(
      `UPDATE sitemanager SET
        NameSiteManager = ?,
        ClientID = ?,
        Email = ?,
        Phone = ?
       WHERE SiteManagerID = ?`,
      [NameSiteManager, ClientID, Email || null, Phone || null, id]
    );

    await connection.commit();

    return NextResponse.json({
      message: 'Site Manager actualizado correctamente',
      affectedRows: result.affectedRows,
      SiteManagerID: parseInt(id),
      NameSiteManager,
      ClientID,
      Email,
      Phone
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Error al actualizar site manager:', error);
    return NextResponse.json(
      { message: 'Error al actualizar site manager' },
      { status: 500 }
    );
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

// DELETE - Eliminar Site Manager
export async function DELETE(request: NextRequest): Promise<NextResponse> {
  let connection = null;

  try {
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
      return NextResponse.json({ message: 'ID es requerido' }, { status: 400 });
    }

    connection = await getConnection();
    await connection.beginTransaction();

    const [managerRows] = await connection.query<SiteManager[]>(
      `SELECT * FROM sitemanager WHERE SiteManagerID = ?`,
      [id]
    );

    if (managerRows.length === 0) {
      await connection.rollback();
      return NextResponse.json(
        { message: 'No se encontró el Site Manager a eliminar' },
        { status: 404 }
      );
    }

    const [projectRows] = await connection.query<RowDataPacket[]>(
      `SELECT COUNT(*) as count FROM projects WHERE SiteManagerID = ?`,
      [id]
    );

    if (projectRows[0].count > 0) {
      await connection.rollback();
      return NextResponse.json(
        {
          message: 'No se puede eliminar el Site Manager porque tiene proyectos asociados. Reasigne los proyectos primero.'
        },
        { status: 409 }
      );
    }

    const [result] = await connection.query<ResultSetHeader>(
      `DELETE FROM sitemanager WHERE SiteManagerID = ?`,
      [id]
    );

    await connection.commit();

    return NextResponse.json({
      message: 'Site Manager eliminado correctamente',
      affectedRows: result.affectedRows
    });
  } catch (error: any) {
    if (connection) {
      await connection.rollback();
    }
    console.error('Error al eliminar site manager:', error);

    if (error.code === 'ER_ROW_IS_REFERENCED_2' || error.code === 'ER_ROW_IS_REFERENCED') {
      return NextResponse.json(
        {
          message: 'No se puede eliminar el Site Manager porque tiene registros dependientes en otras tablas.'
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { message: 'Error al eliminar site manager' },
      { status: 500 }
    );
  } finally {
    if (connection) {
      connection.release();
    }
  }
}