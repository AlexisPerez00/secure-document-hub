import ConvertAPI from "convertapi";
import path from "path";
import fs from "fs";
import { DocumentModel } from "../models/Document";

// Configura tu clave
const convertapi = new ConvertAPI(process.env.CONVERTAPI_SECRET || "");

export class VucemProcessor {
  static async process(
    filePath: string,
    mimetype: string,
    source: "manual" | "email",
    customOriginalName?: string
  ): Promise<string> {
    // Usamos el nombre real si nos lo dan, si no, sacamos el nombre del archivo
    const realName = customOriginalName || path.basename(filePath);

    // Creamos el registro en BD aquí (Centralizado)
    const doc = new DocumentModel({
      originalName: realName,
      storedName: path.basename(filePath), // Temporalmente el nombre del archivo subido
      mimetype: mimetype,
      size: fs.statSync(filePath).size,
      source: source, // ✅ Respetamos la fuente que nos manden (email o manual)
      status: "processing",
    });

    await doc.save();

    try {
      const fileName = path.basename(filePath, path.extname(filePath));
      const outputDir = path.join(__dirname, "../../uploads/vucem_ready");

      // Asegurar que existe la carpeta de salida
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Lógica de conversión (PDF vs Otros)
      let result;
      if (mimetype === "application/pdf") {
        // Comprimir PDF
        result = await convertapi.convert(
          "compress",
          {
            File: filePath,
            PreservePDFA: true,
          },
          "pdf"
        );
      } else {
        // Convertir a PDF (Word, Excel, Imagen)
        result = await convertapi.convert("pdf", {
          File: filePath,
        });
      }

      // Guardar el archivo resultante
      const savedFiles = await result.saveFiles(outputDir);
      const outputPath = savedFiles[0]; // ConvertAPI devuelve un array

      // Actualizar BD con Éxito
      doc.status = "completed";
      doc.storedName = path.basename(outputPath); // Ahora apunta al archivo final en vucem_ready
      doc.size = fs.statSync(outputPath).size;
      doc.downloadUrl = `/uploads/vucem_ready/${path.basename(outputPath)}`;
      await doc.save();

      return outputPath;
    } catch (error: any) {
      console.error("Error en VucemProcessor:", error);

      // Actualizar BD con Error
      doc.status = "error";
      doc.errorMessage = error.message;
      await doc.save();

      throw error; // Re-lanzamos para que EmailService se entere y mande el correo
    }
  }

  // Helper para limpiar
  static async cleanupOriginal(filePath: string) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`🧹 Temporal eliminado: ${filePath}`);
      }
    } catch (e) {
      console.error("Error limpiando temporal:", e);
    }
  }
}
