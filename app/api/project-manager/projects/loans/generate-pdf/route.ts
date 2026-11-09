// src/app/api/project-manager/projects/loans/generate-pdf/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { validateAndRenewSession } from '@/lib/auth';
import { UTApi } from 'uploadthing/server';
import os from 'os';
import path from 'path';
import fs from 'fs';
import ExcelJS from 'exceljs';
import ConvertAPI from 'convertapi';

const convertapi = new ConvertAPI(process.env.CONVERTAPI_SECRET!);
const utapi = new UTApi();

/* ================================
   FUNCIÓN SALARIO A LETRA (0–50000)
================================== */
function salarioIMSSALetras(num: number): string {
  if (num < 0 || num > 50000) {
    throw new Error("El salario debe estar entre 0 y 50,000");
  }

  const partes = num.toString().split('.');
  const parteEntera = parseInt(partes[0]);
  const parteDecimal = partes.length > 1 ? parseInt(partes[1].padEnd(2, '0').slice(0, 2)) : 0;

  const unidades = ["CERO", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"];
  const especiales: Record<number, string> = {
    10: "DIEZ", 11: "ONCE", 12: "DOCE", 13: "TRECE", 14: "CATORCE", 15: "QUINCE", 20: "VEINTE",
  };
  const decenas = ["", "", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
  const centenas = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];

  function convertir(n: number): string {
    if (n < 10) return unidades[n];
    if (especiales[n]) return especiales[n];
    if (n < 20) return "DIECI" + unidades[n - 10];
    if (n < 30) return n === 20 ? "VEINTE" : "VEINTI" + unidades[n - 20];
    if (n < 100) {
      const d = Math.floor(n / 10);
      const u = n % 10;
      return u === 0 ? decenas[d] : `${decenas[d]} Y ${unidades[u]}`;
    }
    if (n === 100) return "CIEN";
    if (n < 1000) {
      const c = Math.floor(n / 100);
      const r = n % 100;
      return `${centenas[c]}${r ? " " + convertir(r) : ""}`;
    }
    const miles = Math.floor(n / 1000);
    const resto = n % 1000;
    const textoMiles = miles === 1 ? "MIL" : `${convertir(miles)} MIL`;
    return resto ? `${textoMiles} ${convertir(resto)}` : textoMiles;
  }

  let textoEntero = parteEntera === 0 ? "CERO" : convertir(parteEntera);

  if (parteDecimal === 0) {
    return `${textoEntero} PESOS CON 00/100 M.N.`;
  }

  let textoDecimal = "";
  if (parteDecimal < 10) {
    textoDecimal = unidades[parteDecimal];
  } else if (especiales[parteDecimal]) {
    textoDecimal = especiales[parteDecimal];
  } else if (parteDecimal < 20) {
    textoDecimal = "DIECI" + unidades[parteDecimal - 10];
  } else if (parteDecimal < 100) {
    const d = Math.floor(parteDecimal / 10);
    const u = parteDecimal % 10;
    if (u === 0) {
      textoDecimal = decenas[d];
    } else if (d === 2) {
      textoDecimal = "VEINTI" + unidades[u];
    } else {
      textoDecimal = `${decenas[d]} Y ${unidades[u]}`;
    }
  }
  return `${textoEntero} PESOS CON ${textoDecimal} CENTAVOS`;
}

// ============================================================
// FIX TIMEZONE: formatea fechas SIN usar new Date()
// ============================================================
function formatDateSafe(dateValue: string | Date | null | undefined): string {
  if (!dateValue) return '';

  if (dateValue instanceof Date) {
    const y = dateValue.getUTCFullYear();
    const m = String(dateValue.getUTCMonth() + 1).padStart(2, '0');
    const d = String(dateValue.getUTCDate()).padStart(2, '0');
    return `${d}/${m}/${y}`;
  }

  const str = String(dateValue);
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, y, m, d] = match;
    return `${d}/${m}/${y}`;
  }

  try {
    const dt = new Date(str);
    if (!isNaN(dt.getTime())) {
      const y = dt.getUTCFullYear();
      const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
      const d = String(dt.getUTCDate()).padStart(2, '0');
      return `${d}/${m}/${y}`;
    }
  } catch {}
  return str;
}

// ============================================================
// FIX REGEX: los keys de UploadThing tienen formato base64url
// (letras mayúsculas, minúsculas, dígitos, guiones y guiones bajos)
// ============================================================
function extractFileKeyFromUrl(url: string): string | null {
  if (!url) return null;
  try {
    const matches = url.match(/\/f\/([a-zA-Z0-9_-]+)/);
    return matches ? matches[1] : null;
  } catch {
    return null;
  }
}

// Elimina archivos de UploadThing, con logging robusto
async function deleteFromUploadThing(keys: string[]): Promise<void> {
  const validKeys = keys.filter(k => typeof k === 'string' && k.trim().length > 0);
  if (validKeys.length === 0) {
    console.warn('[generate-pdf] No hay keys válidas para eliminar de UploadThing');
    return;
  }
  console.log('[generate-pdf] Eliminando de UploadThing:', validKeys);
  try {
    const result = await utapi.deleteFiles(validKeys);
    console.log('[generate-pdf] Resultado deleteFiles:', JSON.stringify(result));
  } catch (e) {
    console.error('[generate-pdf] Error al eliminar archivos de UploadThing:', e);
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const loanId = searchParams.get('loanId');
  const isPreview = searchParams.get('preview') === '1';
  const saveToUploadThing = searchParams.get('saveUploadThing') === '1';

  if (!loanId) {
    return NextResponse.json({ error: 'Se requiere el ID del préstamo' }, { status: 400 });
  }

  const sessionId = request.cookies.get('session')?.value;
  if (!sessionId) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }
  const user = await validateAndRenewSession(sessionId);
  if (!user) {
    return NextResponse.json({ error: 'Sesión inválida' }, { status: 401 });
  }

  const tempExcelPath = path.join(os.tmpdir(), `FT-RH-21-PROJ-${Date.now()}-${loanId}.xlsx`);
  const tempPdfPath = path.join(os.tmpdir(), `FT-RH-21-PROJ-${Date.now()}-${loanId}.pdf`);

  let connection;

  try {
    connection = await getConnection();

    const [rows] = await connection.execute<any[]>(
      `SELECT 
        l.LoansID,
        l.ProjectID,
        l.ProjectPersonnelID,
        l.Date,
        l.Total,
        l.NumberOfPayments,
        l.FirstDiscount,
        l.Observations,
        l.Archivos,
        pp.FirstName,
        pp.LastName,
        pp.MiddleName,
        pp.EmployeeID,
        pc.Position,
        p.NameProject,
        p.AdminProjectID,
        CONCAT(bp.FirstName, ' ', bp.LastName, ' ', IFNULL(bp.MiddleName, '')) as JefeDirecto
      FROM loans l
      INNER JOIN projectpersonnel pp ON pp.ProjectPersonnelID = l.ProjectPersonnelID
      LEFT JOIN projectcontracts pc ON pp.ProjectPersonnelID = pc.ProjectPersonnelID AND pc.Status = 1
      LEFT JOIN projects p ON pc.ProjectID = p.ProjectID
      LEFT JOIN employees e ON p.AdminProjectID = e.EmployeeID
      LEFT JOIN basepersonnel bp ON e.EmployeeID = bp.EmployeeID
      WHERE l.LoansID = ?`,
      [loanId]
    );

    if (rows.length === 0) {
      return NextResponse.json({ error: 'Préstamo no encontrado' }, { status: 404 });
    }

    const r = rows[0];
    const fullName = `${r.FirstName || ''} ${r.LastName || ''} ${r.MiddleName || ''}`.trim();
    const area = r.NameProject || 'PROYECTO NO ESPECIFICADO';
    const position = r.Position || 'NO ESPECIFICADO';
    const jefeDirectoNombre = r.JefeDirecto || 'NO ESPECIFICADO';
    const amount = Number(r.Total) || 0;
    const applicationDate = r.Date;
    const numberOfPayments = Number(r.NumberOfPayments) || 0;
    const discountAmount = numberOfPayments > 0 ? amount / numberOfPayments : 0;
    const firstDiscountDate = r.FirstDiscount;
    const observations = r.Observations || '';

    const applicationDateStr = formatDateSafe(applicationDate);
    const firstDiscountDateStr = formatDateSafe(firstDiscountDate);

    const templatePath = path.join(
      process.cwd(),
      'public',
      'human-resources-dashboard',
      'personnel-management',
      'FT-RH-21.xlsx'
    );

    if (!fs.existsSync(templatePath)) {
      return NextResponse.json({ error: 'Plantilla no encontrada' }, { status: 404 });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);
    const ws = workbook.getWorksheet(1)!;

    ws.getCell('G8').value = fullName || 'NO ESPECIFICADO';
    ws.getCell('B16').value = area || 'NO ESPECIFICADO';

    if (amount > 0) {
      try {
        const montoFormateado = new Intl.NumberFormat('es-MX', {
          style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2
        }).format(amount);
        const montoLetras = salarioIMSSALetras(amount);
        const partesLetras = montoLetras.split(' PESOS ');
        const letrasSimples = partesLetras[0];
        ws.getCell('B13').value = `${montoFormateado} (${letrasSimples})`;
      } catch {
        ws.getCell('B13').value = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(amount);
      }
    } else {
      ws.getCell('B13').value = 'NO ESPECIFICADO';
    }

    ws.getCell('J5').value = applicationDateStr;
    ws.getCell('F27').value = numberOfPayments || '';
    ws.getCell('I27').value = discountAmount || '';
    ws.getCell('B28').value = firstDiscountDateStr;
    ws.getCell('B38').value = observations || 'SIN OBSERVACIONES';
    ws.getCell('I16').value = position || 'NO ESPECIFICADO';
    ws.getCell('B45').value = jefeDirectoNombre || 'NO ESPECIFICADO';
    ws.getCell('E49').value = fullName || 'NO ESPECIFICADO';

    await workbook.xlsx.writeFile(tempExcelPath);

    const result = await convertapi.convert('pdf', { File: tempExcelPath });
    const pdfResponse = await fetch(result.file.url);
    const pdfBuffer = await pdfResponse.arrayBuffer();

    fs.writeFileSync(tempPdfPath, Buffer.from(pdfBuffer));

    if (saveToUploadThing) {
      try {
        // ============================================================
        // 1) Leer archivos actuales de la BD
        // ============================================================
        let archivos: any[] = [];
        if (r.Archivos) {
          try {
            const parsed = JSON.parse(r.Archivos);
            if (Array.isArray(parsed)) archivos = parsed;
          } catch (e) {
            console.warn('[generate-pdf] Error parseando Archivos:', e);
          }
        }

        // ============================================================
        // 2) Detectar PDFs anteriores generados por el sistema
        // ============================================================
        const pdfsAnteriores = archivos.filter(
          (a: any) =>
            a?.tipo === 'application/pdf' &&
            typeof a?.nombre === 'string' &&
            a.nombre.startsWith('FT-RH-21-PROY')
        );

        console.log(`[generate-pdf] PDFs anteriores encontrados: ${pdfsAnteriores.length}`, pdfsAnteriores.map((p: any) => ({ nombre: p.nombre, key: p.key })));

        // ============================================================
        // 3) Obtener keys para eliminar
        //    - Si el registro tiene 'key', usarlo
        //    - Si NO tiene 'key' (registros viejos), extraerlo de la URL
        // ============================================================
        const keysToDelete: string[] = [];
        for (const pdf of pdfsAnteriores) {
          let key = pdf?.key;
          if (!key && pdf?.url) {
            key = extractFileKeyFromUrl(pdf.url);
            console.log(`[generate-pdf] Key extraído de URL para "${pdf.nombre}": ${key}`);
          }
          if (key) keysToDelete.push(key);
          else console.warn(`[generate-pdf] No se pudo obtener key para:`, pdf);
        }

        // ============================================================
        // 4) Eliminar de UploadThing (ANTES de subir el nuevo)
        // ============================================================
        if (keysToDelete.length > 0) {
          await deleteFromUploadThing(keysToDelete);
        }

        // ============================================================
        // 5) Quitar los PDFs anteriores del arreglo
        // ============================================================
        archivos = archivos.filter(
          (a: any) =>
            !(
              a?.tipo === 'application/pdf' &&
              typeof a?.nombre === 'string' &&
              a.nombre.startsWith('FT-RH-21-PROY')
            )
        );

        // ============================================================
        // 6) Subir el nuevo PDF a UploadThing
        // ============================================================
        const fileName = `FT-RH-21-PROY-${fullName.replace(/\s+/g, '_')}-${Date.now()}.pdf`;
        const file = new File([Buffer.from(pdfBuffer)], fileName, { type: 'application/pdf' });

        // uploadFiles singular (retorna { data, error } | { data: null, error })
        const uploadResult: any = await utapi.uploadFiles(file);

        // Extraer url y key de la respuesta (soportar v5, v6, v7)
        const fileData = uploadResult?.data ?? uploadResult;
        const urlNuevo =
          fileData?.ufsUrl ||
          fileData?.url ||
          fileData?.serverData?.url ||
          null;
        const keyNuevo =
          fileData?.key ||
          fileData?.serverData?.key ||
          (urlNuevo ? extractFileKeyFromUrl(urlNuevo) : null);

        console.log('[generate-pdf] Nuevo PDF subido:', { url: urlNuevo, key: keyNuevo });

        if (!urlNuevo) {
          throw new Error('No se obtuvo URL de UploadThing para el nuevo PDF');
        }

        archivos.push({
          nombre: fileName,
          url: urlNuevo,
          tipo: 'application/pdf',
          key: keyNuevo || ''
        });

        // ============================================================
        // 7) Actualizar la columna Archivos en la BD
        // ============================================================
        await connection.execute(
          `UPDATE loans SET Archivos = ? WHERE LoansID = ?`,
          [JSON.stringify(archivos), loanId]
        );

        console.log(`[generate-pdf] Archivos actualizados en BD para loans ${loanId}:`, archivos.length, 'archivo(s)');
      } catch (uploadError) {
        console.error('[generate-pdf] Error en el flujo de reemplazo del PDF:', uploadError);
      }
    }

    const fileName = `FT-RH-21-PROYECTO-${loanId}.pdf`;

    return new NextResponse(Buffer.from(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': isPreview
          ? `inline; filename="${fileName}"`
          : `attachment; filename="${fileName}"`,
      },
    });
  } catch (error: any) {
    console.error('Error al generar PDF:', error);
    return NextResponse.json({ error: error.message || 'Error al generar el documento' }, { status: 500 });
  } finally {
    if (connection) {
      try { await connection.release(); } catch {}
    }
    try {
      if (fs.existsSync(tempExcelPath)) fs.unlinkSync(tempExcelPath);
      if (fs.existsSync(tempPdfPath)) fs.unlinkSync(tempPdfPath);
    } catch {}
  }
}