import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import path from "path";
import fs from "fs";
import { getConnection } from "@/lib/db";
import { validateAndRenewSession } from "@/lib/auth";
import { RowDataPacket } from "mysql2";

interface ProjectRow extends RowDataPacket {
  ProjectID: number;
  NameProject: string;
  ProjectAddress: string;
  ClientName: string;
  OC: string | null;
  ProjectBudget: number | null;
  AdminProjectName: string | null;
  NameSiteManager: string | null;
  NameProjectManager: string | null;
}

interface EPCRow extends RowDataPacket {
  EPCID: number;
  ProjectID: number;
  Advance: number | null;
  Amount: number | null;
  WeekNumber: number | null;
  EstimateNumber: number | null;
  Date: string | Date | null;
}

// Convierte cualquier valor de fecha a formato DD/MM/YYYY para el Excel
function formatDateForExcel(value: string | Date | null | undefined): string {
  if (!value) return "";
  let datePart: string;
  if (typeof value === "string") {
    datePart = value.split("T")[0];
  } else {
    const yyyy = value.getUTCFullYear();
    const mm = String(value.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(value.getUTCDate()).padStart(2, "0");
    datePart = `${yyyy}-${mm}-${dd}`;
  }
  const parts = datePart.split("-");
  if (parts.length !== 3) return datePart;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

// Sanitiza el nombre de la hoja según reglas de Excel:
// - Máximo 31 caracteres
// - No puede contener: \ / ? * [ ] :
// - No puede estar vacío
function sanitizeSheetName(name: string): string {
  let safe = name.replace(/[\\\/\?\*\[\]:]/g, "");
  if (safe.length > 31) safe = safe.substring(0, 31);
  if (safe.trim() === "") safe = "EPC";
  return safe;
}

export async function GET(request: NextRequest) {
  let connection;

  try {
    // Validar sesión
    const sessionId = request.cookies.get("session")?.value;
    if (!sessionId) {
      return NextResponse.json(
        { success: false, message: "NO AUTORIZADO" },
        { status: 401 }
      );
    }

    const user = await validateAndRenewSession(sessionId);
    if (!user) {
      return NextResponse.json(
        { success: false, message: "SESIÓN INVÁLIDA O EXPIRADA" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId");
    const epcId = searchParams.get("epcId");

    if (!projectId) {
      return NextResponse.json(
        { success: false, message: "Se requiere el ID del proyecto" },
        { status: 400 }
      );
    }

    const projectIdNum = Number(projectId);
    if (!Number.isInteger(projectIdNum) || projectIdNum <= 0) {
      return NextResponse.json(
        { success: false, message: "ID de proyecto inválido" },
        { status: 400 }
      );
    }

    let epcIdNum: number | null = null;
    if (epcId !== null && epcId !== undefined && epcId !== "") {
      epcIdNum = Number(epcId);
      if (!Number.isInteger(epcIdNum) || epcIdNum <= 0) {
        return NextResponse.json(
          { success: false, message: "ID de EPC inválido" },
          { status: 400 }
        );
      }
    }

    connection = await getConnection();

    // ============ 1) Datos del proyecto ============
    const [projectRows] = await connection.execute<ProjectRow[]>(
      `SELECT 
        p.ProjectID, 
        p.NameProject, 
        p.ProjectAddress, 
        p.OC,
        p.ProjectBudget,
        c.ClientName,
        CONCAT_WS(' ', bp.FirstName, bp.LastName, bp.MiddleName) AS AdminProjectName,
        sm.NameSiteManager,
        epm.NameProjectManager
      FROM projects p 
      INNER JOIN clients c ON c.ClientID = p.ClientID
      LEFT JOIN basepersonnel bp ON bp.BasePersonnelID = p.AdminProjectID
      LEFT JOIN sitemanager sm ON sm.SiteManagerID = p.SiteManagerID
      LEFT JOIN externalprojectmanager epm ON epm.ExternalProjectManagerID = p.ExternalProjectManagerID
      WHERE p.ProjectID = ?`,
      [projectIdNum]
    );

    if (!projectRows.length) {
      return NextResponse.json(
        { success: false, message: "Proyecto no encontrado" },
        { status: 404 }
      );
    }

    // ============ 2) Registro EPC específico ============
    let epcRow: EPCRow | null = null;

    if (epcIdNum !== null) {
      const [epcRows] = await connection.execute<EPCRow[]>(
        `SELECT EPCID, ProjectID, Advance, Amount, WeekNumber, EstimateNumber, \`Date\`
         FROM epc
         WHERE EPCID = ? AND ProjectID = ?
         LIMIT 1`,
        [epcIdNum, projectIdNum]
      );
      epcRow = epcRows.length > 0 ? epcRows[0] : null;
    } else {
      // Si no se especifica un EPC, tomamos el más reciente del proyecto
      const [epcRows] = await connection.execute<EPCRow[]>(
        `SELECT EPCID, ProjectID, Advance, Amount, WeekNumber, EstimateNumber, \`Date\`
         FROM epc
         WHERE ProjectID = ?
         ORDER BY EPCID DESC
         LIMIT 1`,
        [projectIdNum]
      );
      epcRow = epcRows.length > 0 ? epcRows[0] : null;
    }

    if (!epcRow) {
      return NextResponse.json(
        { success: false, message: "Registro EPC no encontrado para este proyecto" },
        { status: 404 }
      );
    }

    // ============ 3) Extraer datos ============
    const projectName = projectRows[0].NameProject || "PROYECTO SIN NOMBRE";
    const ClientName = projectRows[0].ClientName || "CLIENTE SIN NOMBRE";
    const projectAddress = projectRows[0].ProjectAddress || "DIRECCIÓN NO DISPONIBLE";
    const adminProjectName = projectRows[0].AdminProjectName || "ADMINISTRADOR NO DISPONIBLE";
    const oc = projectRows[0].OC || "OC NO DISPONIBLE";
    const nameSiteManager = projectRows[0].NameSiteManager || "NO DISPONIBLE";
    const nameProjectManager = projectRows[0].NameProjectManager || "NO DISPONIBLE";
    const projectBudget = projectRows[0].ProjectBudget || 0;

    const advance = epcRow.Advance || 0;
    const amount = epcRow.Amount || 0;
    const weekNumber = epcRow.WeekNumber || 0;
    const estimateNumber = epcRow.EstimateNumber || 0;
    const epcDate = formatDateForExcel(epcRow.Date);
    const Percentage = amount * 100;

    // ============ 4) Cargar plantilla ============
    const templatePath = path.join(
      process.cwd(),
      "public",
      "project-manager-dashboard",
      "EPC.xlsx"
    );

    if (!fs.existsSync(templatePath)) {
      console.error(`Plantilla no encontrada en: ${templatePath}`);
      return NextResponse.json(
        { success: false, message: "Plantilla EPC no encontrada" },
        { status: 500 }
      );
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);
    const ws = workbook.getWorksheet(1)!;

    // ============ 5) Renombrar la hoja a EPC${estimateNumber} ============
    ws.name = sanitizeSheetName(`EPC${estimateNumber}`);

    // ============ 6) Escribir celdas ============
    ws.getCell("B8").value = estimateNumber;
    ws.getCell("B10").value = projectAddress;
    ws.getCell("B11").value = `LIC. ${adminProjectName}`;
    ws.getCell("B12").value = oc;
    ws.getCell("G10").value = projectName;
    ws.getCell("G11").value = `ING. ${nameSiteManager}`;
    ws.getCell("I7").value = epcDate;
    ws.getCell("I8").value = ClientName;
    ws.getCell("I10").value = oc;
    ws.getCell("I21").value = `${advance}%`;
    ws.getCell("F25").value = amount;
    ws.getCell("A46").value = `LIC. ${adminProjectName}`;
    ws.getCell("D46").value = `ING. ${nameProjectManager}`;
    ws.getCell("G46").value = `ING. ${nameSiteManager}`;
    ws.getCell("B25").value = `SE COBRA UN TOTAL DE ${Percentage}% DE LA SEMANA ${weekNumber} DE LA OC ${oc} DE LOS TRABAJOS ESPECIALIZADOS REALIZADOS.`;
    ws.getCell("H25").value = projectBudget;

    const buffer = await workbook.xlsx.writeBuffer();
    const fileName = `FT-GP-002`;

    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error: any) {
    console.error("Error al generar archivo:", error);
    return NextResponse.json(
      {
        success: false,
        message: error.sqlMessage || error.message || "Error al generar el documento",
      },
      { status: 500 }
    );
  } finally {
    if (connection) {
      try {
        await connection.release();
      } catch (error) {
        console.error("Error al cerrar la conexión:", error);
      }
    }
  }
}