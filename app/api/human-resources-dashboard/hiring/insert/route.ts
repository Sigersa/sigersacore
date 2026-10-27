import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from "@/lib/db";
import { UTApi } from 'uploadthing/server';
import { validateAndRenewSession } from "@/lib/auth";

// Interface para el error de MySQL
interface MySqlError {
  code: string;
  errno: number;
  sqlMessage: string;
  sqlState: string;
}

// Interface para documentos
interface Documentos {
  cv: string[];
  actaNacimiento: string[];
  curp: string[];
  rfc: string[];
  imss: string[];
  ine: string[];
  comprobanteDomicilio: string[];
  comprobanteEstudios: string[];
  comprobanteCapacitacion: string[];
  licenciaManejo: string[];
  cartaAntecedentes: string[];
  cartaRecomendacion: string[];
  retencionInfonavit: string[];
  examenMedico: string[];
  foto: string[];
}

// Interface para el resultado de la consulta de empleados
interface EmployeeResult {
  EmployeeID: number;
}

// Función para normalizar texto a mayúsculas manteniendo acentos
const normalizarMayusculas = (texto: string): string => {
  if (!texto) return '';
  return texto.toUpperCase();
};

// Función para verificar duplicados antes de insertar
async function checkDuplicatesBeforeInsert(connection: any, nss: string, curp: string, rfc: string): Promise<{ exists: boolean; field: string; message: string }> {
  const [nssRows] = await connection.execute(
    `SELECT 'BASE' as tipo FROM basepersonnelpersonalinfo WHERE NSS = ?
     UNION
     SELECT 'PROJECT' as tipo FROM projectpersonnelpersonalinfo WHERE NSS = ?`,
    [nss, nss]
  );

  if (Array.isArray(nssRows) && nssRows.length > 0) {
    return { exists: true, field: 'NSS', message: 'YA EXISTE UN EMPLEADO REGISTRADO CON ESTE NSS' };
  }

  const [curpRows] = await connection.execute(
    `SELECT 'BASE' as tipo FROM basepersonnelpersonalinfo WHERE CURP = ?
     UNION
     SELECT 'PROJECT' as tipo FROM projectpersonnelpersonalinfo WHERE CURP = ?`,
    [curp, curp]
  );

  if (Array.isArray(curpRows) && curpRows.length > 0) {
    return { exists: true, field: 'CURP', message: 'YA EXISTE UN EMPLEADO REGISTRADO CON ESTA CURP' };
  }

  const [rfcRows] = await connection.execute(
    `SELECT 'BASE' as tipo FROM basepersonnelpersonalinfo WHERE RFC = ?
     UNION
     SELECT 'PROJECT' as tipo FROM projectpersonnelpersonalinfo WHERE RFC = ?`,
    [rfc, rfc]
  );

  if (Array.isArray(rfcRows) && rfcRows.length > 0) {
    return { exists: true, field: 'RFC', message: 'YA EXISTE UN EMPLEADO REGISTRADO CON ESTE RFC' };
  }

  return { exists: false, field: '', message: '' };
}

// Función para subir archivo a UploadThing
async function uploadFileToUploadThing(fileBuffer: ArrayBuffer, fileName: string, fileType: string): Promise<string> {
  try {
    const utapi = new UTApi();
    const blob = new Blob([fileBuffer], { type: fileType });
    const file = new File([blob], fileName, { type: fileType });
    const uploadResponse = await utapi.uploadFiles([file]);
    
    if (!uploadResponse || !uploadResponse[0]) throw new Error('No se recibió respuesta de UploadThing');
    const uploadedFile = uploadResponse[0];
    
    if (uploadedFile.error) throw new Error(uploadedFile.error.message || 'Error al subir el archivo');
    
    let fileUrl: string | undefined;
    if ('ufsUrl' in uploadedFile) fileUrl = (uploadedFile as any).ufsUrl;
    else if (uploadedFile.data?.url) fileUrl = uploadedFile.data.url;
    else if ('serverData' in uploadedFile) fileUrl = (uploadedFile as any).serverData?.url;
    
    if (!fileUrl) throw new Error('No se pudo obtener la URL del archivo subido. Estructura inesperada.');
    
    console.log('Archivo subido exitosamente a:', fileUrl);
    return fileUrl;
  } catch (error) {
    console.error('Error al subir archivo a UploadThing:', error);
    throw new Error(error instanceof Error ? error.message : 'Error al subir el documento');
  }
}

async function generateFT_RH_02_PDF(empleadoId: string, baseUrl: string): Promise<ArrayBuffer> {
  try {
    const pdfUrl = `${baseUrl}/api/download/pdf/FT-RH-02?empleadoId=${empleadoId}&preview=1`;
    const response = await fetch(pdfUrl);
    if (!response.ok) throw new Error(`Error al generar PDF FT-RH-02: ${response.statusText}`);
    return await response.arrayBuffer();
  } catch (error) {
    console.error('Error al generar PDF FT-RH-02:', error);
    throw new Error('Error al generar el documento PDF FT-RH-02');
  }
}

async function generateFT_RH_04_PDF(empleadoId: string, baseUrl: string): Promise<ArrayBuffer> {
  try {
    const pdfUrl = `${baseUrl}/api/download/pdf/FT-RH-04?empleadoId=${empleadoId}&preview=1`;
    const response = await fetch(pdfUrl);
    if (!response.ok) throw new Error(`Error al generar PDF FT-RH-04: ${response.statusText}`);
    return await response.arrayBuffer();
  } catch (error) {
    console.error('Error al generar PDF FT-RH-04:', error);
    throw new Error('Error al generar el documento PDF FT-RH-04');
  }
}

async function generateFT_RH_07_PDF(empleadoId: string, baseUrl: string): Promise<ArrayBuffer> {
  try {
    const pdfUrl = `${baseUrl}/api/download/pdf/FT-RH-07?empleadoId=${empleadoId}&preview=1`;
    const response = await fetch(pdfUrl);
    if (!response.ok) throw new Error(`Error al generar PDF FT-RH-07: ${response.statusText}`);
    return await response.arrayBuffer();
  } catch (error) {
    console.error('Error al generar PDF FT-RH-07:', error);
    throw new Error('Error al generar el documento PDF FT-RH-07');
  }
}

async function generateFT_RH_29_PDF(empleadoId: string, baseUrl: string): Promise<ArrayBuffer> {
  try {
    const pdfUrl = `${baseUrl}/api/download/pdf/FT-RH-29?empleadoId=${empleadoId}&preview=1`;
    const response = await fetch(pdfUrl);
    if (!response.ok) throw new Error(`Error al generar PDF FT-RH-29: ${response.statusText}`);
    return await response.arrayBuffer();
  } catch (error) {
    console.error('Error al generar PDF FT-RH-29:', error);
    throw new Error('Error al generar el documento PDF FT-RH-29');
  }
}

// Función para obtener las fechas del proyecto
async function getProjectDates(connection: any, projectId: number): Promise<{ startDate: string | null, endDate: string | null }> {
  try {
    const [projectRows] = await connection.execute(
      `SELECT StartDate, EndDate FROM projects WHERE ProjectID = ? AND Status = 0`,
      [projectId]
    );
    
    if (Array.isArray(projectRows) && projectRows.length > 0) {
      return { startDate: projectRows[0].StartDate, endDate: projectRows[0].EndDate };
    }
    return { startDate: null, endDate: null };
  } catch (error) {
    console.error('Error al obtener fechas del proyecto:', error);
    return { startDate: null, endDate: null };
  }
}

export async function POST(request: NextRequest) {
  let connection;
  
  try {
    const sessionId = request.cookies.get("session")?.value;
    if (!sessionId) return NextResponse.json({ success: false, message: 'NO AUTORIZADO' }, { status: 401 });

    const user = await validateAndRenewSession(sessionId);
    if (!user) return NextResponse.json({ success: false, message: 'SESIÓN INVÁLIDA O EXPIRADA' }, { status: 401 });
    if (user.UserTypeID !== 2) return NextResponse.json({ success: false, message: 'ACCESO DENEGADO' }, { status: 403 });

    const formData = await request.json();
    
    const requiredFields = ['nombre', 'apellidoPaterno', 'nss', 'curp', 'rfc', 'fechaNacimiento', 'puesto', 'salario', 'calle', 'numeroExterior', 'colonia', 'municipio', 'estado', 'codigoPostal'];
    for (const field of requiredFields) {
      if (!formData[field]?.trim()) {
        return NextResponse.json({ success: false, message: `EL CAMPO ${field.toUpperCase()} ES REQUERIDO` }, { status: 400 });
      }
    }

    if (formData.email && !/\S+@\S+\.\S+/.test(formData.email)) {
      return NextResponse.json({ success: false, message: 'EL EMAIL NO TIENE UN FORMATO VÁLIDO' }, { status: 400 });
    }

    if (formData.tipoPersonal === 'proyecto' && !formData.proyectoId?.trim()) {
      return NextResponse.json({ success: false, message: 'EL PROYECTO ES REQUERIDO PARA PERSONAL DE PROYECTO' }, { status: 400 });
    }

    connection = await getConnection();

    if (formData.tipoPersonal === 'base' && formData.jefeDirectoId) {
      const jefeDirectoId = parseInt(formData.jefeDirectoId);
      const [jefeRows] = await connection.execute(
        `SELECT EmployeeID FROM employees WHERE EmployeeID = ? AND Status = 1`,
        [jefeDirectoId]
      );
      if (!Array.isArray(jefeRows) || jefeRows.length === 0) {
        await connection.release();
        return NextResponse.json({ success: false, message: 'EL JEFE DIRECTO SELECCIONADO NO EXISTE O NO ESTÁ ACTIVO' }, { status: 400 });
      }
    }

    if (!formData.documentos) {
      return NextResponse.json({ success: false, message: 'LOS DOCUMENTOS SON REQUERIDOS' }, { status: 400 });
    }

    const documentos: Documentos = formData.documentos;
    const documentosRequeridos: (keyof Documentos)[] = ['cv', 'actaNacimiento', 'curp', 'rfc', 'imss', 'ine', 'comprobanteDomicilio', 'foto'];

    for (const docType of documentosRequeridos) {
      if (!documentos[docType] || documentos[docType].length === 0) {
        return NextResponse.json({ success: false, message: `EL DOCUMENTO ${docType.toUpperCase()} ES REQUERIDO` }, { status: 400 });
      }
    }

    if (formData.beneficiarios && formData.beneficiarios.length > 0) {
      if (formData.beneficiarios.length > 1) {
        return NextResponse.json({ success: false, message: 'SOLO SE PERMITE UN BENEFICIARIO POR EMPLEADO' }, { status: 400 });
      }
      const beneficiario = formData.beneficiarios[0];
      if (beneficiario.nombre || beneficiario.apellidoPaterno) {
        if (!beneficiario.nombre?.trim() || !beneficiario.apellidoPaterno?.trim()) {
          return NextResponse.json({ success: false, message: 'SI INGRESA UN BENEFICIARIO, DEBE COMPLETAR NOMBRE Y APELLIDO PATERNO' }, { status: 400 });
        }
        const porcentaje = parseFloat(beneficiario.porcentaje) || 0;
        if (Math.abs(porcentaje - 100) > 0.01) {
          return NextResponse.json({ success: false, message: 'EL PORCENTAJE DEL BENEFICIARIO DEBE SER 100%' }, { status: 400 });
        }
      }
    }
    
    const duplicateCheck = await checkDuplicatesBeforeInsert(connection, formData.nss, formData.curp, formData.rfc);
    if (duplicateCheck.exists) {
      await connection.release();
      return NextResponse.json({ success: false, message: duplicateCheck.message, field: duplicateCheck.field }, { status: 400 });
    }
    
    await connection.beginTransaction();

    try {
      let employeeId;
      let employeeType;
      let employeeIdNumber;
      let contractFileURL: string | null = null;
      let warningFileURL: string | null = null;
      let letterFileURL: string | null = null;
      let agreementFileURL: string | null = null;
      let jefeDirectoId = formData.tipoPersonal === 'base' && formData.jefeDirectoId ? parseInt(formData.jefeDirectoId) : null;

      if (formData.tipoPersonal === 'base') {
        employeeType = 'BASE';
        const [basePersonnelResult] = await connection.execute(
          `INSERT INTO basepersonnel (FirstName, LastName, MiddleName, Position, WorkSchedule, Salary, Area) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            normalizarMayusculas(formData.nombre.trim()),
            normalizarMayusculas(formData.apellidoPaterno.trim()),
            normalizarMayusculas(formData.apellidoMaterno ? formData.apellidoMaterno.trim() : ''),
            normalizarMayusculas(formData.puesto.trim()),
            normalizarMayusculas(formData.horarioLaboral || ''),
            parseFloat(formData.salario.replace(/[^0-9.-]+/g, "")) || 0,
            normalizarMayusculas(formData.departamento || '')
          ]
        );

        const basePersonnelId = (basePersonnelResult as any).insertId;
        employeeIdNumber = basePersonnelId;

        const [employeeResult] = await connection.execute(`INSERT INTO employees (EmployeeType, Status) VALUES (?, 1)`, ['BASE']);
        employeeId = (employeeResult as any).insertId;

        await connection.execute(`UPDATE basepersonnel SET EmployeeID = ? WHERE BasePersonnelID = ?`, [employeeId, basePersonnelId]);

        await connection.execute(
          `INSERT INTO basepersonnelpersonalinfo (BasePersonnelID, Street, ExteriorNumber, InteriorNumber, Suburb, Municipality, State, ZipCode, Nationality, Gender, Birthdate, MaritalStatus, RFC, CURP, NSS, NCI, UMF, Phone, Email) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            basePersonnelId,
            normalizarMayusculas(formData.calle.trim()),
            formData.numeroExterior ? parseInt(formData.numeroExterior) : null,
            formData.numeroInterior ? parseInt(formData.numeroInterior) : null,
            normalizarMayusculas(formData.colonia.trim()),
            normalizarMayusculas(formData.municipio.trim()),
            normalizarMayusculas(formData.estado),
            formData.codigoPostal ? parseInt(formData.codigoPostal) : null,
            normalizarMayusculas(formData.nacionalidad || ''),
            normalizarMayusculas(formData.genero || ''),
            formData.fechaNacimiento,
            normalizarMayusculas(formData.estadoCivil || ''),
            normalizarMayusculas(formData.rfc.trim()),
            normalizarMayusculas(formData.curp.trim()),
            formData.nss,
            normalizarMayusculas(formData.nci || ''),
            formData.umf ? parseInt(formData.umf) : null,
            formData.telefono || null,
            formData.email.toLowerCase().trim()
          ]
        );

        await connection.execute(
          `INSERT INTO basecontracts (BasePersonnelID, StartDate, SalaryIMSS, ContractFileURL, WarningFileURL, LetterFileURL, AgreementFileURL, jefeDirectoId) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            basePersonnelId,
            formData.fechaInicioContrato || null,
            formData.salaryIMSS ? parseFloat(formData.salaryIMSS) : null,
            null, null, null, null,
            jefeDirectoId
          ]
        );

        if (formData.beneficiarios && formData.beneficiarios.length > 0) {
          const beneficiario = formData.beneficiarios[0];
          if (beneficiario.nombre && beneficiario.nombre.trim() && beneficiario.apellidoPaterno && beneficiario.apellidoPaterno.trim()) {
            await connection.execute(
              `INSERT INTO basepersonnelbeneficiaries (BasePersonnelID, BeneficiaryFirstName, BeneficiaryLastName, BeneficiaryMiddleName, Relationship, Percentage) VALUES (?, ?, ?, ?, ?, ?)`,
              [
                basePersonnelId,
                normalizarMayusculas(beneficiario.nombre.trim()),
                normalizarMayusculas(beneficiario.apellidoPaterno.trim()),
                normalizarMayusculas(beneficiario.apellidoMaterno ? beneficiario.apellidoMaterno.trim() : ''),
                normalizarMayusculas(beneficiario.parentesco || ''),
                100
              ]
            );
          }
        }

        const cvUrl = documentos.cv?.[0] || null;
        const actaNacimientoUrl = documentos.actaNacimiento?.[0] || null;
        const curpUrl = documentos.curp?.[0] || null;
        const rfcUrl = documentos.rfc?.[0] || null;
        const imssUrl = documentos.imss?.[0] || null;
        const ineUrl = documentos.ine?.[0] || null;
        const comprobanteDomicilioUrl = documentos.comprobanteDomicilio?.[0] || null;
        const comprobanteEstudiosUrl = documentos.comprobanteEstudios?.[0] || null;
        const comprobanteCapacitacionUrl = documentos.comprobanteCapacitacion?.[0] || null;
        const licenciaManejoUrl = documentos.licenciaManejo?.[0] || null;
        const actaNotarialUrl = documentos.cartaAntecedentes?.[0] || null;
        const cartaRecomendacionUrl = documentos.cartaRecomendacion?.[0] || null;
        const retencionInfonavitUrl = documentos.retencionInfonavit?.[0] || null;
        const examenMedicoUrl = documentos.examenMedico?.[0] || null;
        const fotoUrl = documentos.foto?.[0] || null;

        await connection.execute(
          `INSERT INTO basepersonneldocumentation (BasePersonnelID, CVFileURL, ANFileURL, CURPFileURL, RFCFileURL, IMSSFileURL, INEFileURL, CDFileURL, CEFileURL, CPFileURL, LMFileURL, ANPFileURL, CRFileURL, RIFileURL, EMFileURL, FotoFileURL) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [basePersonnelId, cvUrl, actaNacimientoUrl, curpUrl, rfcUrl, imssUrl, ineUrl, comprobanteDomicilioUrl, comprobanteEstudiosUrl, comprobanteCapacitacionUrl, licenciaManejoUrl, actaNotarialUrl, cartaRecomendacionUrl, retencionInfonavitUrl, examenMedicoUrl, fotoUrl]
        );

      } else {
        employeeType = 'PROJECT';
        const proyectoId = parseInt(formData.proyectoId);
        if (isNaN(proyectoId)) throw new Error('ID DE PROYECTO INVÁLIDO');
        
        const projectDates = await getProjectDates(connection, proyectoId);
        if (!projectDates.startDate || !projectDates.endDate) throw new Error('EL PROYECTO SELECCIONADO NO TIENE FECHAS VÁLIDAS O NO ESTÁ ACTIVO');
        
        const [projectPersonnelResult] = await connection.execute(
          `INSERT INTO projectpersonnel (FirstName, LastName, MiddleName) VALUES (?, ?, ?)`,
          [normalizarMayusculas(formData.nombre.trim()), normalizarMayusculas(formData.apellidoPaterno.trim()), normalizarMayusculas(formData.apellidoMaterno ? formData.apellidoMaterno.trim() : '')]
        );

        const projectPersonnelId = (projectPersonnelResult as any).insertId;
        employeeIdNumber = projectPersonnelId;

        const [employeeResult] = await connection.execute(`INSERT INTO employees (EmployeeType, Status) VALUES (?, 1)`, ['PROJECT']);
        employeeId = (employeeResult as any).insertId;

        await connection.execute(`UPDATE projectpersonnel SET EmployeeID = ? WHERE ProjectPersonnelID = ?`, [employeeId, projectPersonnelId]);

        await connection.execute(
          `INSERT INTO projectpersonnelpersonalinfo (ProjectPersonnelID, Street, ExteriorNumber, InteriorNumber, Suburb, Municipality, State, ZipCode, Nationality, Gender, Birthdate, MaritalStatus, RFC, CURP, NSS, NCI, UMF, Phone, Email) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            projectPersonnelId, normalizarMayusculas(formData.calle.trim()), formData.numeroExterior ? parseInt(formData.numeroExterior) : null, formData.numeroInterior ? parseInt(formData.numeroInterior) : null, normalizarMayusculas(formData.colonia.trim()), normalizarMayusculas(formData.municipio.trim()), normalizarMayusculas(formData.estado), formData.codigoPostal ? parseInt(formData.codigoPostal) : null, normalizarMayusculas(formData.nacionalidad || ''), normalizarMayusculas(formData.genero || ''), formData.fechaNacimiento, normalizarMayusculas(formData.estadoCivil || ''), normalizarMayusculas(formData.rfc.trim()), normalizarMayusculas(formData.curp.trim()), formData.nss, normalizarMayusculas(formData.nci || ''), formData.umf ? parseInt(formData.umf) : null, formData.telefono || null, formData.email.toLowerCase().trim()
          ]
        );

        await connection.execute(
          `INSERT INTO projectcontracts (ProjectPersonnelID, SalaryIMSS, Position, Salary, WorkSchedule, ProjectID, ContractFileURL, WarningFileURL, LetterFileURL, AgreementFileURL, Status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
          [
            projectPersonnelId, formData.salaryIMSS ? parseFloat(formData.salaryIMSS) : null, normalizarMayusculas(formData.puesto.trim()), parseFloat(formData.salario.replace(/[^0-9.-]+/g, "")) || 0, normalizarMayusculas(formData.horarioLaboral || ''), proyectoId, null, null, null, null
          ]
        );

        if (formData.beneficiarios && formData.beneficiarios.length > 0) {
          const beneficiario = formData.beneficiarios[0];
          if (beneficiario.nombre && beneficiario.nombre.trim() && beneficiario.apellidoPaterno && beneficiario.apellidoPaterno.trim()) {
            await connection.execute(
              `INSERT INTO projectpersonnelbeneficiaries (ProjectPersonnelID, BeneficiaryFirstName, BeneficiaryLastName, BeneficiaryMiddleName, Relationship, Percentage) VALUES (?, ?, ?, ?, ?, ?)`,
              [projectPersonnelId, normalizarMayusculas(beneficiario.nombre.trim()), normalizarMayusculas(beneficiario.apellidoPaterno.trim()), normalizarMayusculas(beneficiario.apellidoMaterno ? beneficiario.apellidoMaterno.trim() : ''), normalizarMayusculas(beneficiario.parentesco || ''), 100]
            );
          }
        }

        const cvUrl = documentos.cv?.[0] || null;
        const actaNacimientoUrl = documentos.actaNacimiento?.[0] || null;
        const curpUrl = documentos.curp?.[0] || null;
        const rfcUrl = documentos.rfc?.[0] || null;
        const imssUrl = documentos.imss?.[0] || null;
        const ineUrl = documentos.ine?.[0] || null;
        const comprobanteDomicilioUrl = documentos.comprobanteDomicilio?.[0] || null;
        const comprobanteEstudiosUrl = documentos.comprobanteEstudios?.[0] || null;
        const comprobanteCapacitacionUrl = documentos.comprobanteCapacitacion?.[0] || null;
        const licenciaManejoUrl = documentos.licenciaManejo?.[0] || null;
        const cartaAntecedentesUrl = documentos.cartaAntecedentes?.[0] || null;
        const cartaRecomendacionUrl = documentos.cartaRecomendacion?.[0] || null;
        const retencionInfonavitUrl = documentos.retencionInfonavit?.[0] || null;
        const examenMedicoUrl = documentos.examenMedico?.[0] || null;
        const fotoUrl = documentos.foto?.[0] || null;

        await connection.execute(
          `INSERT INTO projectpersonneldocumentation (ProjectPersonnelID, CVFileURL, ANFileURL, CURPFileURL, RFCFileURL, IMSSFileURL, INEFileURL, CDFileURL, CEFileURL, CPFileURL, LMFileURL, ANPFileURL, CRFileURL, RIFileURL, EMFileURL, FotoFileURL) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [projectPersonnelId, cvUrl, actaNacimientoUrl, curpUrl, rfcUrl, imssUrl, ineUrl, comprobanteDomicilioUrl, comprobanteEstudiosUrl, comprobanteCapacitacionUrl, licenciaManejoUrl, cartaAntecedentesUrl, cartaRecomendacionUrl, retencionInfonavitUrl, examenMedicoUrl, fotoUrl]
        );
      }

      await connection.commit();

      try {
        // ✅ AQUÍ ESTÁ LA MAGIA: Usamos el origen real de la petición
        const baseUrl = request.nextUrl.origin;

        const ftRh02PdfBuffer = await generateFT_RH_02_PDF(employeeId.toString(), baseUrl);
        const ftRh02FileName = `FT-RH-02_${formData.tipoPersonal}_${employeeId}_${Date.now()}.pdf`;
        contractFileURL = await uploadFileToUploadThing(ftRh02PdfBuffer, ftRh02FileName, 'application/pdf');
        
        const ftRh04PdfBuffer = await generateFT_RH_04_PDF(employeeId.toString(), baseUrl);
        const ftRh04FileName = `FT-RH-04_${formData.tipoPersonal}_${employeeId}_${Date.now()}.pdf`;
        warningFileURL = await uploadFileToUploadThing(ftRh04PdfBuffer, ftRh04FileName, 'application/pdf');
        
        const ftRh07PdfBuffer = await generateFT_RH_07_PDF(employeeId.toString(), baseUrl);
        const ftRh07FileName = `FT-RH-07_${formData.tipoPersonal}_${employeeId}_${Date.now()}.pdf`;
        letterFileURL = await uploadFileToUploadThing(ftRh07PdfBuffer, ftRh07FileName, 'application/pdf');
        
        const ftRh29PdfBuffer = await generateFT_RH_29_PDF(employeeId.toString(), baseUrl);
        const ftRh29FileName = `FT-RH-29_${formData.tipoPersonal}_${employeeId}_${Date.now()}.pdf`;
        agreementFileURL = await uploadFileToUploadThing(ftRh29PdfBuffer, ftRh29FileName, 'application/pdf');
        
        await connection.beginTransaction();
        
        if (employeeType === 'BASE') {
          await connection.execute(
            `UPDATE basecontracts SET ContractFileURL = ?, WarningFileURL = ?, LetterFileURL = ?, AgreementFileURL = ? WHERE BasePersonnelID = ?`,
            [contractFileURL, warningFileURL, letterFileURL, agreementFileURL, employeeIdNumber]
          );
        } else {
          await connection.execute(
            `UPDATE projectcontracts SET ContractFileURL = ?, WarningFileURL = ?, LetterFileURL = ?, AgreementFileURL = ?, Status = 1 WHERE ProjectPersonnelID = ?`,
            [contractFileURL, warningFileURL, letterFileURL, agreementFileURL, employeeIdNumber]
          );
        }
        
        await connection.commit();
        
        return NextResponse.json({
          success: true,
          message: formData.tipoPersonal === 'base' ? 'PERSONAL BASE REGISTRADO EXITOSAMENTE' : 'PERSONAL DE PROYECTO REGISTRADO EXITOSAMENTE',
          empleadoId: employeeId,
          employeeId: employeeId,
          employeeIdNumber: employeeIdNumber,
          tipo: formData.tipoPersonal,
          contractFileURL: contractFileURL,
          warningFileURL: warningFileURL,
          letterFileURL: letterFileURL,
          agreementFileURL: agreementFileURL,
          jefeDirectoId: jefeDirectoId
        });

      } catch (pdfError) {
        console.error('Error al generar/subir PDFs:', pdfError);
        return NextResponse.json({
          success: true,
          message: formData.tipoPersonal === 'base' ? 'PERSONAL BASE REGISTRADO EXITOSAMENTE (ERROR EN PDFs)' : 'PERSONAL DE PROYECTO REGISTRADO EXITOSAMENTE (ERROR EN PDFs)',
          empleadoId: employeeId,
          employeeId: employeeId,
          employeeIdNumber: employeeIdNumber,
          tipo: formData.tipoPersonal,
          jefeDirectoId: jefeDirectoId,
          warning: 'Error al generar los documentos PDF',
          errorDetails: process.env.NODE_ENV === 'development' ? (pdfError instanceof Error ? pdfError.message : String(pdfError)) : undefined
        });
      }

    } catch (error: unknown) {
      if (connection) await connection.rollback();
      console.error('Error en la transacción:', error);
      if (error && typeof error === 'object' && 'code' in error) {
        const mysqlError = error as MySqlError;
        if (mysqlError.code === 'ER_DUP_ENTRY') {
          let mensajeDuplicado = 'EL EMPLEADO YA EXISTE';
          if (mysqlError.sqlMessage) {
            if (mysqlError.sqlMessage.includes('CURP')) mensajeDuplicado = 'YA EXISTE UN EMPLEADO REGISTRADO CON ESTA CURP';
            else if (mysqlError.sqlMessage.includes('RFC')) mensajeDuplicado = 'YA EXISTE UN EMPLEADO REGISTRADO CON ESTE RFC';
            else if (mysqlError.sqlMessage.includes('NSS')) mensajeDuplicado = 'YA EXISTE UN EMPLEADO REGISTRADO CON ESTE NSS';
          }
          return NextResponse.json({ success: false, message: mensajeDuplicado }, { status: 400 });
        }
      }
      throw error;
    }

  } catch (error: unknown) {
    console.error('Error al registrar empleado:', error);
    let errorMessage = 'ERROR AL REGISTRAR EL EMPLEADO. POR FAVOR, INTENTE NUEVAMENTE.';
    
    if (error instanceof Error) {
      if (error.message.includes('ER_BAD_FIELD_ERROR')) errorMessage = 'ERROR EN LA ESTRUCTURA DE LA BASE DE DATOS. CONTACTE AL ADMINISTRADOR.';
      else if (error.message.includes('ER_NO_SUCH_TABLE')) errorMessage = 'ERROR: TABLAS NO ENCONTRADAS EN LA BASE DE DATOS.';
      else if (error.message.includes('ECONNREFUSED')) errorMessage = 'ERROR DE CONEXIÓN A LA BASE DE DATOS. VERIFIQUE EL SERVIDOR.';
      else if (error.message.includes('foreign key constraint')) errorMessage = 'ERROR: EL PROYECTO O JEFE DIRECTO SELECCIONADO NO EXISTE EN LA BASE DE DATOS.';
      else if (error.message.includes('NO TIENE FECHAS VÁLIDAS')) errorMessage = error.message;
    }
    
    return NextResponse.json({ 
      success: false, 
      message: errorMessage, 
      error: process.env.NODE_ENV === 'development' && error instanceof Error ? error.message : undefined 
    }, { status: 500 });
  } finally {
    if (connection) {
      try { await connection.release(); } catch (error) { console.error('Error al cerrar la conexión:', error); }
    }
  }
}

export async function GET() {
  return NextResponse.json({ message: 'MÉTODO NO PERMITIDO' }, { status: 405 });
}