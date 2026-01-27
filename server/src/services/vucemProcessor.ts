import ConvertAPI from "convertapi";
import path from "path";
import fs from "fs";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
import { DocumentModel } from "../models/Document";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);
const convertapi = new ConvertAPI(process.env.CONVERTAPI_SECRET || "");

// Constantes VUCEM
const VUCEM_MAX_SIZE_MB = 3;
const VUCEM_MAX_SIZE_BYTES = VUCEM_MAX_SIZE_MB * 1024 * 1024;
const VUCEM_DPI = 300;

export class VucemProcessor {
  /**
   * Procesa un archivo usando ConvertAPI + procesamiento VUCEM local
   */
  static async process(
    filePath: string,
    mimetype: string,
    source: "manual" | "email",
    customOriginalName?: string,
  ): Promise<string> {
    const realName = customOriginalName || path.basename(filePath);

    // Crear registro en BD
    const doc = new DocumentModel({
      originalName: realName,
      storedName: path.basename(filePath),
      mimetype: mimetype,
      size: fs.statSync(filePath).size,
      source: source,
      status: "processing",
    });

    await doc.save();

    try {
      const fileName = path.basename(filePath, path.extname(filePath));
      const outputDir = path.join(__dirname, "../../uploads/vucem_ready");
      const tempDir = path.join(__dirname, "../../uploads/temp");

      // Crear directorios si no existen
      [outputDir, tempDir].forEach((dir) => {
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
      });

      // PASO 1: Conversión con ConvertAPI
      console.log("📄 Paso 1: Convirtiendo con ConvertAPI...");
      const convertedPdfPath = await this.convertWithConvertAPI(
        filePath,
        mimetype,
        tempDir,
        fileName,
      );

      // PASO 2: Procesamiento VUCEM (validaciones + optimización)
      console.log("✅ Paso 2: Aplicando requisitos VUCEM...");
      const vucemPdfPath = await this.applyVucemRequirements(
        convertedPdfPath,
        fileName,
        outputDir,
      );

      // PASO 3: Validar tamaño final
      const finalSize = fs.statSync(vucemPdfPath).size;
      if (finalSize > VUCEM_MAX_SIZE_BYTES) {
        throw new Error(
          `El archivo resultante (${(finalSize / 1024 / 1024).toFixed(2)} MB) excede el límite de ${VUCEM_MAX_SIZE_MB} MB`,
        );
      }

      // Actualizar BD con éxito
      doc.status = "completed";
      doc.storedName = path.basename(vucemPdfPath);
      doc.size = finalSize;
      doc.downloadUrl = `/uploads/vucem_ready/${path.basename(vucemPdfPath)}`;
      await doc.save();

      // Limpiar archivos temporales
      await this.cleanupOriginal(convertedPdfPath);

      console.log(`✅ Documento VUCEM listo: ${vucemPdfPath}`);
      return vucemPdfPath;
    } catch (error: unknown) {
      console.error("❌ Error en VucemProcessor:", error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      doc.status = "error";
      doc.errorMessage = errorMessage;
      await doc.save();

      throw error;
    }
  }

  /**
   * PASO 1: Convierte archivo a PDF usando ConvertAPI
   */
  private static async convertWithConvertAPI(
    filePath: string,
    mimetype: string,
    tempDir: string,
    fileName: string,
  ): Promise<string> {
    let result;

    if (mimetype === "application/pdf") {
      // Si ya es PDF, solo comprimirlo
      result = await convertapi.convert(
        "compress",
        {
          File: filePath,
          PreservePDFA: true,
        },
        "pdf",
      );
    } else {
      // Convertir otros formatos a PDF
      result = await convertapi.convert("pdf", {
        File: filePath,
      });
    }

    // Guardar resultado de ConvertAPI
    const savedFiles = await result.saveFiles(tempDir);
    const convertedPath = savedFiles[0];

    console.log(`✅ ConvertAPI completado: ${convertedPath}`);
    return convertedPath;
  }

  /**
   * PASO 2: Aplica TODOS los requisitos VUCEM al PDF
   */
  private static async applyVucemRequirements(
    pdfPath: string,
    fileName: string,
    outputDir: string,
  ): Promise<string> {
    const pdfBytes = fs.readFileSync(pdfPath);

    // Cargar PDF con pdf-lib
    let pdfDoc: PDFDocument;
    try {
      pdfDoc = await PDFDocument.load(pdfBytes, {
        ignoreEncryption: false,
      });
    } catch (error) {
      throw new Error(
        "El PDF contiene contraseñas o está corrupto. No permitido por VUCEM.",
      );
    }

    // ✅ 1. Verificar que NO tiene contraseña
    if (pdfDoc.isEncrypted) {
      throw new Error(
        "El PDF está protegido con contraseña. No permitido por VUCEM.",
      );
    }

    // ✅ 2. Detectar JavaScript (rechazar si existe)
    // Intentamos detectar JS en el PDF
    const pdfText = pdfBytes.toString();
    if (pdfText.includes("/JavaScript") || pdfText.includes("/JS")) {
      throw new Error(
        "El PDF contiene JavaScript embebido. No permitido por VUCEM.",
      );
    }

    // ✅ 3. Detectar formularios (rechazar si existen)
    const form = pdfDoc.getForm();
    const fields = form.getFields();
    if (fields.length > 0) {
      throw new Error(
        "El PDF contiene formularios interactivos. No permitido por VUCEM.",
      );
    }

    // ✅ 4. Eliminar páginas en blanco
    const pages = pdfDoc.getPages();
    const pagesToRemove: number[] = [];

    for (let i = pages.length - 1; i >= 0; i--) {
      const page = pages[i];
      const content = page.node.Contents();

      // Si no tiene contenido, marcar para eliminar
      if (!content || (Array.isArray(content) && content.length === 0)) {
        console.log(`🗑️ Página en blanco detectada: ${i + 1}`);
        pagesToRemove.push(i);
      }
    }

    // Eliminar páginas vacías
    pagesToRemove.forEach((index) => pdfDoc.removePage(index));

    if (pdfDoc.getPageCount() === 0) {
      throw new Error(
        "El documento no contiene páginas válidas después de eliminar hojas en blanco.",
      );
    }

    // Guardar PDF limpio
    const cleanedPdfBytes = await pdfDoc.save();
    const tempCleanedPath = path.join(outputDir, `${fileName}_cleaned.pdf`);
    fs.writeFileSync(tempCleanedPath, cleanedPdfBytes);

    // ✅ 5. Aplicar Ghostscript: Escala de grises + 300 DPI + Compresión
    const finalOutputPath = path.join(outputDir, `${fileName}_vucem.pdf`);

    // Determinar el comando de Ghostscript según el sistema operativo
    const isWindows = process.platform === "win32";
    const gsCommand = isWindows
      ? "gswin64c" // En Windows usa gswin64c (debe estar en PATH)
      : "gs";

    try {
      console.log(
        "🎨 Aplicando escala de grises 8-bit y 300 DPI con Ghostscript...",
      );

      const gsArgs = `
        -sDEVICE=pdfwrite
        -dCompatibilityLevel=1.4
        -dPDFSETTINGS=/ebook
        -dNOPAUSE -dQUIET -dBATCH
        -dColorConversionStrategy=/Gray
        -dProcessColorModel=/DeviceGray
        -dAutoFilterColorImages=false
        -dColorImageFilter=/FlateEncode
        -dDownsampleColorImages=true
        -dColorImageResolution=${VUCEM_DPI}
        -dGrayImageResolution=${VUCEM_DPI}
        -dMonoImageResolution=${VUCEM_DPI}
        -dColorImageDownsampleType=/Bicubic
        -dGrayImageDownsampleType=/Bicubic
        -dCompressFonts=true
        -dSubsetFonts=true
        -dEmbedAllFonts=true
        -dDetectDuplicateImages=true
        -dCompressPages=true
        -dFastWebView=true
        -sOutputFile="${finalOutputPath}"
        "${tempCleanedPath}"
      `
        .replace(/\s+/g, " ")
        .trim();

      await execAsync(`${gsCommand} ${gsArgs}`);

      // Verificar tamaño después de Ghostscript
      let finalSize = fs.statSync(finalOutputPath).size;

      // Si aún es muy grande, intentar compresión más agresiva
      if (finalSize > VUCEM_MAX_SIZE_BYTES) {
        console.warn(
          `⚠️ Archivo aún grande (${(finalSize / 1024 / 1024).toFixed(2)} MB), aplicando compresión agresiva...`,
        );

        const tempAggressivePath = path.join(
          outputDir,
          `${fileName}_aggressive_temp.pdf`,
        );

        const aggressiveArgs = `
          -sDEVICE=pdfwrite
          -dCompatibilityLevel=1.4
          -dPDFSETTINGS=/screen
          -dNOPAUSE -dQUIET -dBATCH
          -dColorConversionStrategy=/Gray
          -dProcessColorModel=/DeviceGray
          -dAutoFilterColorImages=true
          -dColorImageFilter=/DCTEncode
          -dDownsampleColorImages=true
          -dColorImageResolution=150
          -dGrayImageResolution=150
          -dMonoImageResolution=150
          -dColorImageDownsampleType=/Bicubic
          -dGrayImageDownsampleType=/Bicubic
          -dCompressFonts=true
          -dSubsetFonts=true
          -dEmbedAllFonts=true
          -dDetectDuplicateImages=true
          -dCompressPages=true
          -dFastWebView=true
          -sOutputFile="${tempAggressivePath}"
          "${finalOutputPath}"
        `
          .replace(/\s+/g, " ")
          .trim();

        await execAsync(`${gsCommand} ${aggressiveArgs}`);

        // Reemplazar el archivo con la versión más comprimida
        fs.unlinkSync(finalOutputPath);
        fs.renameSync(tempAggressivePath, finalOutputPath);

        finalSize = fs.statSync(finalOutputPath).size;
        console.log(
          `🗜️ Compresión agresiva aplicada. Nuevo tamaño: ${(finalSize / 1024 / 1024).toFixed(2)} MB`,
        );
      }

      // Limpiar temporal
      if (fs.existsSync(tempCleanedPath)) {
        fs.unlinkSync(tempCleanedPath);
      }

      if (!fs.existsSync(finalOutputPath)) {
        throw new Error("Ghostscript no pudo generar el archivo final.");
      }

      console.log("✅ Ghostscript completado");
      return finalOutputPath;
    } catch (error) {
      console.warn(
        "⚠️ Ghostscript no disponible o falló. Usando PDF limpio sin optimización de color.",
      );
      console.warn("⚠️ Error:", error);

      // Si Ghostscript falla, renombrar el PDF limpio
      fs.renameSync(tempCleanedPath, finalOutputPath);

      console.warn(
        "⚠️ ADVERTENCIA: El PDF NO está en escala de grises ni a 300 DPI exactos.",
      );
      console.warn(
        "   Para Windows: Instala Ghostscript y asegúrate que esté en el PATH",
      );
      console.warn("   O ajusta la ruta en vucemProcessor.ts línea ~140");

      return finalOutputPath;
    }
  }

  /**
   * Limpia archivos temporales
   */
  static async cleanupOriginal(filePath: string): Promise<void> {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`🧹 Temporal eliminado: ${filePath}`);
      }
    } catch (e) {
      console.error("Error limpiando temporal:", e);
    }
  }

  /**
   * Validación pre-procesamiento (opcional)
   */
  static async validateBeforeProcessing(filePath: string): Promise<{
    valid: boolean;
    warnings: string[];
  }> {
    const warnings: string[] = [];
    const stats = fs.statSync(filePath);

    // Advertir si el archivo es muy grande
    if (stats.size > VUCEM_MAX_SIZE_BYTES * 2) {
      warnings.push(
        `Archivo grande (${(stats.size / 1024 / 1024).toFixed(2)} MB). ` +
          `Puede ser difícil comprimirlo a menos de ${VUCEM_MAX_SIZE_MB} MB.`,
      );
    }

    return {
      valid: true,
      warnings,
    };
  }
}
