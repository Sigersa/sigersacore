import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from "@/lib/db";
import { validateAndRenewSession } from "@/lib/auth";

// Función para calcular años de antigüedad
const calcularAniosAntiguedad = (fechaInicio: string | Date): number => {
  if (!fechaInicio) return 0;
  
  const startDate = new Date(fechaInicio);
  const currentDate = new Date();
  
  let years = currentDate.getFullYear() - startDate.getFullYear();
  const monthDiff = currentDate.getMonth() - startDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && currentDate.getDate() < startDate.getDate())) {
    years--;
  }
  
  return years < 0 ? 0 : years;
};

// ✅ CORREGIDO: si la antigüedad es 0, devuelve 0 días (no 12)
const calcularDiasVacaciones = (aniosAntiguedad: number): number => {
  if (aniosAntiguedad <= 0) {
    return 0;
  } else if (aniosAntiguedad >= 1 && aniosAntiguedad <= 5) {
    return 12 + (aniosAntiguedad - 1) * 2;
  } else if (aniosAntiguedad >= 6 && aniosAntiguedad <= 10) {
    return 22;
  } else if (aniosAntiguedad >= 11 && aniosAntiguedad <= 15) {
    return 24;
  } else if (aniosAntiguedad >= 16 && aniosAntiguedad <= 20) {
    return 26;
  } else if (aniosAntiguedad >= 21 && aniosAntiguedad <= 25) {
    return 28;
  } else if (aniosAntiguedad >= 26 && aniosAntiguedad <= 30) {
    return 30;
  } else if (aniosAntiguedad >= 31 && aniosAntiguedad <= 35) {
    return 32;
  } else if (aniosAntiguedad > 35) {
    return 32;
  }
  return 0;
};

// Función para obtener los días totales usados en vacaciones
const getTotalUsedVacationDays = async (connection: any, employeeId: number): Promise<number> => {
  const [vacations] = await connection.execute(
    `SELECT COALESCE(SUM(Days), 0) as totalUsed
     FROM employeevacations 
     WHERE EmployeeID = ?`,
    [employeeId]
  );
  
  return (vacations as any[])[0]?.totalUsed || 0;
};

// Obtener fecha de inicio de contrato para BASE o PROJECT
const getContractStartDate = async (connection: any, employeeId: number): Promise<string | null> => {
  // 1. Intentar como BASE
  const [baseContract] = await connection.execute(
    `SELECT bc.StartDate
     FROM basecontracts bc
     INNER JOIN basepersonnel bp ON bc.BasePersonnelID = bp.BasePersonnelID
     WHERE bp.EmployeeID = ?
     ORDER BY bc.StartDate ASC
     LIMIT 1`,
    [employeeId]
  );

  if ((baseContract as any[]).length) {
    return (baseContract as any[])[0].StartDate;
  }

  // 2. Intentar como PROJECT
  const [projectContract] = await connection.execute(
    `SELECT pc.StartDate
     FROM projectcontracts pc
     INNER JOIN projectpersonnel pp ON pc.ProjectPersonnelID = pp.ProjectPersonnelID
     WHERE pp.EmployeeID = ?
     ORDER BY pc.StartDate ASC
     LIMIT 1`,
    [employeeId]
  );

  if ((projectContract as any[]).length) {
    return (projectContract as any[])[0].StartDate;
  }

  return null;
};

// Función para generar y guardar el PDF del período de vacaciones (SOLO CUANDO SE COMPLETAN LAS VACACIONES)
async function generateAndSaveVacationPDF(
  employeeId: number,
  vacationId: number,
  baseUrl: string,
  cookies?: string
): Promise<string | null> {
  try {
    console.log(`Generando PDF para EmployeeID: ${employeeId}, VacationID: ${vacationId}`);
    
    const url = `${baseUrl}/api/download/pdf/FT-RH-08?empleadoId=${employeeId}&vacationId=${vacationId}&save=1`;
    console.log('URL de generación:', url);
    
    const response = await fetch(url, {
      headers: {
        Cookie: cookies || ''
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error al generar PDF:', response.status, errorText);
      return null;
    }
    
    const result = await response.json();
    
    if (result.success && result.fileUrl) {
      console.log('PDF generado y URL obtenida:', result.fileUrl);
      return result.fileUrl;
    }
    
    console.log('No se pudo obtener la URL del PDF generado');
    return null;
  } catch (error) {
    console.error('Error en generateAndSaveVacationPDF:', error);
    return null;
  }
}

// Función para calcular fecha de término
const calculateEndDate = (startDate: string, days: number): string => {
  const startDateObj = new Date(startDate);
  const endDateObj = new Date(startDateObj);
  endDateObj.setDate(endDateObj.getDate() + days);
  return endDateObj.toISOString().split('T')[0];
};

// GET: Obtener todos los empleados (BASE y PROJECT) con días usados y restantes
export async function GET(req: NextRequest) {
  let connection;
  
  try {
    const sessionId = req.cookies.get("session")?.value;

    if (!sessionId) {
      return NextResponse.json({ error: "NO AUTORIZADO" }, { status: 401 });
    }

    const user = await validateAndRenewSession(sessionId);

    if (!user || user.UserTypeID !== 2) {
      return NextResponse.json({ error: "ACCESO DENEGADO" }, { status: 403 });
    }

    connection = await getConnection();
    
    // Empleados BASE + PROJECT unificados con días usados en una sola consulta
    const [rows] = await connection.execute(`
      SELECT 
        e.EmployeeID,
        bp.BasePersonnelID,
        pp.ProjectPersonnelID,
        COALESCE(bp.FirstName, pp.FirstName) AS FirstName,
        COALESCE(bp.LastName, pp.LastName) AS LastName,
        COALESCE(bp.MiddleName, pp.MiddleName) AS MiddleName,
        COALESCE(bp.Position, pc.Position) AS Position,
        COALESCE(bc.StartDate, pc.StartDate) AS ContractStartDate,
        e.Status,
        CASE 
          WHEN bp.BasePersonnelID IS NOT NULL THEN 'BASE'
          ELSE 'PROJECT'
        END AS tipo,
        COALESCE((
          SELECT SUM(ev.Days) 
          FROM employeevacations ev 
          WHERE ev.EmployeeID = e.EmployeeID
        ), 0) AS TotalUsedDays
      FROM employees e
      LEFT JOIN basepersonnel bp ON bp.EmployeeID = e.EmployeeID
      LEFT JOIN basecontracts bc ON bc.BasePersonnelID = bp.BasePersonnelID
      LEFT JOIN projectpersonnel pp ON pp.EmployeeID = e.EmployeeID
      LEFT JOIN projectcontracts pc ON pc.ProjectPersonnelID = pp.ProjectPersonnelID
      WHERE e.Status = 1
        AND (bp.BasePersonnelID IS NOT NULL OR pp.ProjectPersonnelID IS NOT NULL)
      ORDER BY LastName, FirstName
    `);

    // Eliminar duplicados por EmployeeID (un empleado puede tener varios contratos)
    const uniqueMap = new Map<number, any>();
    for (const emp of rows as any[]) {
      if (!uniqueMap.has(emp.EmployeeID)) {
        uniqueMap.set(emp.EmployeeID, emp);
      }
    }

    const employeesWithVacations = Array.from(uniqueMap.values()).map(employee => {
      const yearsOfSeniority = calcularAniosAntiguedad(employee.ContractStartDate);
      const daysOfVacations = calcularDiasVacaciones(yearsOfSeniority);
      const totalUsedDays = Number(employee.TotalUsedDays) || 0;
      const remainingDays = daysOfVacations - totalUsedDays;

      return {
        ...employee,
        YearsOfSeniority: yearsOfSeniority,
        DaysOfVacations: daysOfVacations,
        TotalUsedDays: totalUsedDays,
        RemainingDays: remainingDays
      };
    });

    return NextResponse.json(employeesWithVacations, { status: 200 });
    
  } catch (error) {
    console.error('Error fetching employees:', error);
    
    return NextResponse.json(
      { error: 'ERROR AL OBTENER LOS EMPLEADOS' },
      { status: 500 }
    );
  } finally {
    if (connection) connection.release();
  }
}

// POST: Crear un nuevo período de vacaciones
export async function POST(req: NextRequest) {
  let connection;
  
  try {
    const sessionId = req.cookies.get("session")?.value;

    if (!sessionId) {
      return NextResponse.json({ error: "NO AUTORIZADO" }, { status: 401 });
    }

    const user = await validateAndRenewSession(sessionId);

    if (!user || user.UserTypeID !== 2) {
      return NextResponse.json({ error: "ACCESO DENEGADO" }, { status: 403 });
    }

    const body = await req.json();
    let { EmployeeID, Days, StartDate, Observations } = body;

    if (!EmployeeID || !Days || !StartDate) {
      return NextResponse.json(
        { message: 'ALGUNOS CAMPOS SON REQUERIDOS' },
        { status: 400 }
      );
    }

    connection = await getConnection();
    
    await connection.beginTransaction();
    
    try {
      // Obtener fecha de inicio del contrato (BASE o PROJECT)
      const contractStartDate = await getContractStartDate(connection, EmployeeID);

      if (!contractStartDate) {
        throw new Error('NO SE ENCONTRÓ LA FECHA DE INICIO DEL CONTRATO PARA ESTE EMPLEADO');
      }

      const yearsOfSeniority = calcularAniosAntiguedad(contractStartDate);
      const daysOfVacations = calcularDiasVacaciones(yearsOfSeniority);
      
      // ✅ Validar explícitamente que tenga días disponibles (0 antigüedad → 0 días)
      if (daysOfVacations <= 0) {
        throw new Error('EL EMPLEADO NO TIENE DÍAS DE VACACIONES DISPONIBLES (ANTIGÜEDAD MENOR A 1 AÑO)');
      }
      
      const daysToTake = parseFloat(Days);
      if (isNaN(daysToTake) || daysToTake <= 0) {
        throw new Error('LOS DÍAS DEBEN SER UN NÚMERO POSITIVO');
      }
      
      // Obtener días totales usados ANTES de insertar
      const totalUsedDaysBefore = await getTotalUsedVacationDays(connection, EmployeeID);
      const remainingDays = daysOfVacations - totalUsedDaysBefore;
      
      if (daysToTake > remainingDays) {
        throw new Error(`NO SE PUEDE AGREGAR EL PERÍODO. DÍAS DISPONIBLES: ${remainingDays}, DÍAS SOLICITADOS: ${daysToTake}`);
      }

      const startDateObj = new Date(StartDate);
      if (isNaN(startDateObj.getTime())) {
        throw new Error('LA FECHA DE INICIO NO ES VÁLIDA');
      }
      
      // Calcular fecha de término correctamente
      const formattedStartDate = startDateObj.toISOString().split('T')[0];
      const formattedEndDate = calculateEndDate(formattedStartDate, daysToTake);
      
      console.log('Fechas calculadas en POST:', {
        startDate: formattedStartDate,
        endDate: formattedEndDate,
        days: daysToTake
      });
      
      // Insertar registro sin FileURL por ahora
      const [vacationResult] = await connection.execute(
        `INSERT INTO employeevacations 
         (EmployeeID, Days, StampedDays, StartDate, EndDate, Observations, FileURL) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          EmployeeID, 
          Days, 
          Days,
          formattedStartDate, 
          formattedEndDate, 
          Observations || '',
          null
        ]
      );
      
      const insertedId = (vacationResult as any).insertId;
      
      // Obtener días totales usados DESPUÉS de insertar
      const totalUsedDaysAfter = await getTotalUsedVacationDays(connection, EmployeeID);
      const completedVacations = totalUsedDaysAfter >= daysOfVacations;
      
      console.log(`Vacaciones completadas: ${completedVacations}`);
      console.log(`Días disponibles: ${daysOfVacations}, Días usados: ${totalUsedDaysAfter}`);
      
      // Confirmar la transacción
      await connection.commit();
      
      console.log(`Período de vacaciones creado con ID: ${insertedId}`);
      
      // Generar PDF SOLO si se han completado todas las vacaciones
      let fileUrl = null;
      if (completedVacations) {
        try {
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
          const cookies = req.headers.get('cookie') || '';
          
          fileUrl = await generateAndSaveVacationPDF(EmployeeID, insertedId, baseUrl, cookies);
          
          if (fileUrl) {
            console.log(`PDF generado exitosamente: ${fileUrl}`);
            const updateConnection = await getConnection();
            try {
              await updateConnection.execute(
                `UPDATE employeevacations SET FileURL = ? WHERE VacationID = ?`,
                [fileUrl, insertedId]
              );
              console.log(`URL actualizada en BD para VacationID: ${insertedId}`);
            } finally {
              await updateConnection.release();
            }
          } else {
            console.log('No se pudo generar el PDF');
          }
        } catch (pdfError) {
          console.error('Error al generar PDF:', pdfError);
        }
      } else {
        console.log(`No se genera PDF porque las vacaciones no están completas. Usados: ${totalUsedDaysAfter}/${daysOfVacations}`);
      }
      
      return NextResponse.json(
        { 
          message: 'PERÍODO DE VACACIONES CREADO EXITOSAMENTE',
          vacationId: insertedId,
          startDate: formattedStartDate,
          endDate: formattedEndDate,
          yearsOfSeniority: yearsOfSeniority,
          daysOfVacations: daysOfVacations,
          totalUsedDays: totalUsedDaysAfter,
          remainingDays: daysOfVacations - totalUsedDaysAfter,
          fileUrl: fileUrl,
          completedVacations: completedVacations,
          success: true 
        },
        { status: 201 }
      );
      
    } catch (error) {
      await connection.rollback();
      throw error;
    }
    
  } catch (error) {
    console.error('Error creating vacation period:', error);
    
    return NextResponse.json(
      { 
        message: error instanceof Error ? error.message : 'ERROR AL CREAR EL PERÍODO DE VACACIONES',
        error: error instanceof Error ? error.message : 'ERROR DESCONOCIDO'
      },
      { status: 500 }
    );
  } finally {
    if (connection) {
      await connection.release();
    }
  }
}

// PUT: Acciones GET/UPDATE/SENIORITY/EDIT
export async function PUT(req: NextRequest) {
  let connection;
  
  try {
    const sessionId = req.cookies.get("session")?.value;

    if (!sessionId) {
      return NextResponse.json({ error: "NO AUTORIZADO" }, { status: 401 });
    }

    const user = await validateAndRenewSession(sessionId);

    if (!user || user.UserTypeID !== 2) {
      return NextResponse.json({ error: "ACCESO DENEGADO" }, { status: 403 });
    }

    const url = new URL(req.url);
    const action = url.searchParams.get('action');
    
    // Obtener antigüedad de un empleado (BASE o PROJECT)
    if (action === 'seniority') {
      const employeeId = url.searchParams.get('employeeId');
      
      if (!employeeId) {
        return NextResponse.json(
          { error: 'ID DE EMPLEADO REQUERIDO' },
          { status: 400 }
        );
      }

      connection = await getConnection();

      const contractStartDate = await getContractStartDate(connection, parseInt(employeeId));

      if (!contractStartDate) {
        return NextResponse.json(
          { error: 'NO SE ENCONTRÓ LA FECHA DE INICIO DEL CONTRATO PARA ESTE EMPLEADO' },
          { status: 404 }
        );
      }

      const yearsOfSeniority = calcularAniosAntiguedad(contractStartDate);
      const daysOfVacations = calcularDiasVacaciones(yearsOfSeniority);
      const totalUsedDays = await getTotalUsedVacationDays(connection, parseInt(employeeId));

      return NextResponse.json(
        { 
          yearsOfSeniority, 
          daysOfVacations, 
          startDate: contractStartDate,
          totalUsedDays,
          remainingDays: daysOfVacations - totalUsedDays
        },
        { status: 200 }
      );
    }
    
    // Obtener períodos de vacaciones de un empleado
    if (action === 'get') {
      const employeeId = url.searchParams.get('employeeId');
      
      if (!employeeId) {
        return NextResponse.json(
          { error: 'ID DE EMPLEADO REQUERIDO' },
          { status: 400 }
        );
      }

      connection = await getConnection();
      
      const [vacations] = await connection.execute(
        `SELECT 
          ev.VacationID,
          ev.EmployeeID,
          ev.Days,
          ev.StampedDays,
          ev.StartDate,
          ev.EndDate,
          ev.Observations,
          ev.FileURL
         FROM employeevacations ev
         WHERE ev.EmployeeID = ?
         ORDER BY ev.StartDate DESC`,
        [employeeId]
      );
      
      return NextResponse.json(vacations, { status: 200 });
    }
    
    // Actualizar solo observaciones
    if (action === 'update') {
      const body = await req.json();
      const { vacationId, observations } = body;
      
      if (!vacationId) {
        return NextResponse.json(
          { error: 'ID DE REGISTRO REQUERIDO' },
          { status: 400 }
        );
      }
      
      connection = await getConnection();
      
      await connection.execute(
        'UPDATE employeevacations SET Observations = ? WHERE VacationID = ?',
        [observations || '', vacationId]
      );
      
      return NextResponse.json(
        { 
          message: 'OBSERVACIONES ACTUALIZADAS EXITOSAMENTE',
          success: true 
        },
        { status: 200 }
      );
    }
    
    // Actualización completa del registro de vacaciones
    if (action === 'updatefull') {
      const body = await req.json();
      const { vacationId, EmployeeID, Days, StartDate, Observations } = body;
      
      if (!vacationId || !EmployeeID || !Days || !StartDate) {
        return NextResponse.json(
          { error: 'CAMPOS REQUERIDOS FALTANTES' },
          { status: 400 }
        );
      }
      
      connection = await getConnection();
      
      const startDateObj = new Date(StartDate);
      if (isNaN(startDateObj.getTime())) {
        return NextResponse.json(
          { error: 'LA FECHA DE INICIO NO ES VÁLIDA' },
          { status: 400 }
        );
      }
      
      const [originalRecord] = await connection.execute(
        'SELECT Days, FileURL FROM employeevacations WHERE VacationID = ?',
        [vacationId]
      );
      
      if (!(originalRecord as any[]).length) {
        return NextResponse.json(
          { error: 'REGISTRO NO ENCONTRADO' },
          { status: 404 }
        );
      }
      
      const originalDays = (originalRecord as any[])[0].Days;
      const oldFileUrl = (originalRecord as any[])[0].FileURL;
      
      const daysToTake = parseFloat(Days);
      if (isNaN(daysToTake) || daysToTake <= 0) {
        return NextResponse.json(
          { error: 'LOS DÍAS DEBEN SER UN NÚMERO POSITIVO' },
          { status: 400 }
        );
      }
      
      const contractStartDate = await getContractStartDate(connection, EmployeeID);
      
      if (!contractStartDate) {
        return NextResponse.json(
          { error: 'NO SE ENCONTRÓ LA FECHA DE INICIO DEL CONTRATO' },
          { status: 400 }
        );
      }
      
      const yearsOfSeniority = calcularAniosAntiguedad(contractStartDate);
      const daysOfVacations = calcularDiasVacaciones(yearsOfSeniority);
      
      // ✅ Validar explícitamente que tenga días disponibles
      if (daysOfVacations <= 0) {
        return NextResponse.json(
          { error: 'EL EMPLEADO NO TIENE DÍAS DE VACACIONES DISPONIBLES (ANTIGÜEDAD MENOR A 1 AÑO)' },
          { status: 400 }
        );
      }
      
      const totalUsedDays = await getTotalUsedVacationDays(connection, EmployeeID);
      const totalWithoutCurrent = totalUsedDays - originalDays;
      const remainingDays = daysOfVacations - totalWithoutCurrent;
      
      if (daysToTake > remainingDays) {
        return NextResponse.json(
          { 
            error: `NO SE PUEDE ACTUALIZAR EL PERÍODO. DÍAS DISPONIBLES: ${remainingDays}, DÍAS SOLICITADOS: ${daysToTake}` 
          },
          { status: 400 }
        );
      }
      
      const formattedStartDate = startDateObj.toISOString().split('T')[0];
      const formattedEndDate = calculateEndDate(formattedStartDate, daysToTake);
      
      console.log('Fechas calculadas en UPDATE:', {
        startDate: formattedStartDate,
        endDate: formattedEndDate,
        days: daysToTake
      });
      
      await connection.execute(
        `UPDATE employeevacations 
         SET Days = ?, 
             StampedDays = ?, 
             StartDate = ?, 
             EndDate = ?, 
             Observations = ?,
             FileURL = NULL
         WHERE VacationID = ?`,
        [Days, Days, formattedStartDate, formattedEndDate, Observations || '', vacationId]
      );
      
      const totalUsedDaysAfter = await getTotalUsedVacationDays(connection, EmployeeID);
      const completedVacations = totalUsedDaysAfter >= daysOfVacations;
      
      console.log(`Vacaciones completadas después de actualizar: ${completedVacations}`);
      console.log(`Días disponibles: ${daysOfVacations}, Días usados: ${totalUsedDaysAfter}`);
      
      await connection.commit();
      
      let newFileUrl = null;
      if (completedVacations) {
        try {
          const baseUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
          const cookies = req.headers.get('cookie') || '';
          newFileUrl = await generateAndSaveVacationPDF(EmployeeID, parseInt(vacationId), baseUrl, cookies);
          
          if (newFileUrl) {
            const updateConnection = await getConnection();
            try {
              await updateConnection.execute(
                `UPDATE employeevacations SET FileURL = ? WHERE VacationID = ?`,
                [newFileUrl, vacationId]
              );
              console.log(`URL actualizada para VacationID: ${vacationId}`);
            } finally {
              await updateConnection.release();
            }
          }
          
          if (oldFileUrl && newFileUrl) {
            try {
              const { UTApi } = await import('uploadthing/server');
              const utapi = new UTApi();
              const fileKey = oldFileUrl.match(/\/f\/([a-zA-Z0-9-_]+)/)?.[1];
              if (fileKey) {
                await utapi.deleteFiles([fileKey]);
                console.log(`Archivo antiguo eliminado: ${fileKey}`);
              }
            } catch (deleteError) {
              console.error('Error al eliminar archivo antiguo:', deleteError);
            }
          }
        } catch (pdfError) {
          console.error('Error al generar nuevo PDF:', pdfError);
        }
      } else {
        console.log(`No se genera PDF porque las vacaciones no están completas. Usados: ${totalUsedDaysAfter}/${daysOfVacations}`);
        if (oldFileUrl) {
          try {
            const { UTApi } = await import('uploadthing/server');
            const utapi = new UTApi();
            const fileKey = oldFileUrl.match(/\/f\/([a-zA-Z0-9-_]+)/)?.[1];
            if (fileKey) {
              await utapi.deleteFiles([fileKey]);
              console.log(`Archivo antiguo eliminado (no completado): ${fileKey}`);
            }
          } catch (deleteError) {
            console.error('Error al eliminar archivo antiguo:', deleteError);
          }
        }
      }
      
      return NextResponse.json(
        { 
          message: 'PERÍODO DE VACACIONES ACTUALIZADO EXITOSAMENTE',
          success: true,
          remainingDays: remainingDays - daysToTake,
          vacationId: vacationId,
          fileUrl: newFileUrl,
          startDate: formattedStartDate,
          endDate: formattedEndDate,
          completedVacations: completedVacations
        },
        { status: 200 }
      );
    }
    
    return NextResponse.json(
      { error: 'ACCIÓN NO VÁLIDA' },
      { status: 400 }
    );
    
  } catch (error) {
    console.error('Error in PUT:', error);
    
    return NextResponse.json(
      { error: 'ERROR AL PROCESAR LA SOLICITUD' },
      { status: 500 }
    );
  } finally {
    if (connection) connection.release();
  }
}

// DELETE: Eliminar un período de vacaciones
export async function DELETE(req: NextRequest) {
  let connection;
  
  try {
    const sessionId = req.cookies.get("session")?.value;

    if (!sessionId) {
      return NextResponse.json({ error: "NO AUTORIZADO" }, { status: 401 });
    }

    const user = await validateAndRenewSession(sessionId);

    if (!user || user.UserTypeID !== 2) {
      return NextResponse.json({ error: "ACCESO DENEGADO" }, { status: 403 });
    }

    const url = new URL(req.url);
    const vacationId = url.searchParams.get('id');
    
    if (!vacationId) {
      return NextResponse.json(
        { error: 'ID DE REGISTRO REQUERIDO' },
        { status: 400 }
      );
    }
    
    connection = await getConnection();
    
    const [record] = await connection.execute(
      'SELECT FileURL FROM employeevacations WHERE VacationID = ?',
      [vacationId]
    );
    
    const fileUrl = (record as any[])[0]?.FileURL;
    
    await connection.execute(
      'DELETE FROM employeevacations WHERE VacationID = ?',
      [vacationId]
    );
    
    if (fileUrl) {
      try {
        const { UTApi } = await import('uploadthing/server');
        const utapi = new UTApi();
        const fileKey = fileUrl.match(/\/f\/([a-zA-Z0-9-_]+)/)?.[1];
        if (fileKey) {
          await utapi.deleteFiles([fileKey]);
          console.log(`Archivo eliminado de UploadThing: ${fileKey}`);
        }
      } catch (deleteError) {
        console.error('Error al eliminar archivo:', deleteError);
      }
    }
    
    return NextResponse.json(
      { 
        message: 'PERÍODO DE VACACIONES ELIMINADO EXITOSAMENTE',
        success: true 
      },
      { status: 200 }
    );
    
  } catch (error) {
    console.error('Error in DELETE:', error);
    
    return NextResponse.json(
      { error: 'ERROR AL ELIMINAR EL PERÍODO DE VACACIONES' },
      { status: 500 }
    );
  } finally {
    if (connection) connection.release();
  }
}