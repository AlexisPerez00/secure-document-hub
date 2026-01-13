import sharp from "sharp";
import path from "path";
import fs from "fs";
import { PDFDocument } from "pdf-lib";
import { DocumentModel } from "../models/Document";
const convertapi = require("convertapi")(process.env.CONVERTAPI_SECRET);

export class VucemProcessor {
  private static outputDir = path.resolve(
    __dirname,
    "../../uploads/vucem_ready"
  );

  private static ensureDirectory() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  static async process(
    filePath: string,
    mimetype: string,
    source: "email" | "manual" = "manual"
  ): Promise<string> {
    this.ensureDirectory();
    const absolutePath = path.resolve(filePath);
    const fileName = path.basename(absolutePath, path.extname(absolutePath));
    const extension = path.extname(absolutePath).toLowerCase();
    const outputPath = path.join(this.outputDir, `${fileName}-vucem.pdf`);

    try {
      // --- ESCENARIO A: IMÁGENES (Local con Sharp - Gratis e Instantáneo) ---
      if (mimetype.startsWith("image/")) {
        console.log("📸 Optimizando imagen localmente...");
        const buffer = await sharp(absolutePath)
          .grayscale()
          .jpeg({ quality: 60 })
          .toBuffer();
        const pdfDoc = await PDFDocument.create();
        const image = await pdfDoc.embedJpg(buffer);
        const page = pdfDoc.addPage([
          (image.width * 72) / 300,
          (image.height * 72) / 300,
        ]);
        page.drawImage(image, {
          x: 0,
          y: 0,
          width: page.getWidth(),
          height: page.getHeight(),
        });
        fs.writeFileSync(outputPath, await pdfDoc.save());
      }
      // --- ESCENARIO B: OFFICE Y PDFS (ConvertAPI - Soporta hasta 100MB) ---
      else {
        const stats = fs.statSync(absolutePath);
        const sizeMB = stats.size / (1024 * 1024);

        let result;

        if (sizeMB > 3) {
          console.log(
            `🗜️ Archivo pesado (${sizeMB.toFixed(
              2
            )}MB). Aplicando compresión AGRESIVA...`
          );

          if (extension === ".pdf") {
            // CORRECCIÓN: Para 'compress' usamos 'web' (que equivale al peso mínimo)
            result = await convertapi.convert(
              "compress",
              {
                File: absolutePath,
                Preset: "web",
              },
              "pdf"
            );
          } else {
            // Para convertir Office, 'minimum' sí suele ser aceptado,
            // pero usaremos 'screen' para asegurar compatibilidad total
            result = await convertapi.convert(
              "pdf",
              {
                File: absolutePath,
                PdfOptimization: "screen",
              },
              extension.replace(".", "")
            );
          }
        } else {
          console.log(
            `📄 Archivo ligero (${sizeMB.toFixed(
              2
            )}MB). Manteniendo calidad estándar...`
          );

          result = await convertapi.convert(
            "pdf",
            {
              File: absolutePath,
              PdfOptimization: "screen",
            },
            extension.replace(".", "")
          );
        }

        await result.saveFiles(this.outputDir);

        const tempPath = path.join(this.outputDir, `${fileName}.pdf`);
        if (fs.existsSync(tempPath)) {
          fs.renameSync(tempPath, outputPath);
        }
      }

      // --- RESULTADO FINAL EN CONSOLA ---
      const finalStats = fs.statSync(outputPath);
      const finalSizeMB = finalStats.size / (1024 * 1024);

      // 💾 GUARDADO EN MONGODB
      try {
        await DocumentModel.create({
          originalName: fileName, // El nombre sin la extensión extra
          storedName: path.basename(outputPath),
          mimetype: mimetype, // "application/pdf" o "image/jpeg"
          size: finalStats.size,
          source: source,
          status: "completed",
          downloadUrl: `/uploads/vucem_ready/${path.basename(outputPath)}`,
        });
        console.log("💾 Registro guardado en base de datos.");
      } catch (dbError) {
        console.error("Error guardando en DB:", dbError);
        // No lanzamos error aquí para no detener el flujo si el archivo ya se creó
      }

      console.log(
        `✅ ¡Éxito! Archivo optimizado: ${finalSizeMB.toFixed(2)} MB`
      );
      return outputPath;
    } catch (error: any) {
      console.error(`❌ Error en VucemProcessor:`, error.message);
      throw error;
    }
  }

  static async cleanupOriginal(filePath: string) {
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log(`🗑️ Temporal eliminado.`);
      } catch (e) {
        /* ignore */
      }
    }
  }
}
