import sharp from "sharp";
import path from "path";
import fs, { createReadStream } from "fs";
import { PDFDocument } from "pdf-lib";
import CloudmersiveConvertApiClient from "cloudmersive-convert-api-client";
import { promises as fsPromises } from "fs";

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

  static async process(filePath: string, mimetype: string): Promise<string> {
    this.ensureDirectory();

    // 1. CONFIGURACIÓN CRÍTICA: Inicializar el cliente justo antes de usarlo
    const defaultClient = CloudmersiveConvertApiClient.ApiClient.instance;
    const apikey = defaultClient.authentications["Apikey"];
    apikey.apiKey = process.env.CLOUDMERSIVE_API_KEY;

    const absolutePath = path.resolve(filePath);
    const fileName = path.basename(absolutePath, path.extname(absolutePath));
    const extension = path.extname(absolutePath).toLowerCase();
    const outputPath = path.join(this.outputDir, `${fileName}-vucem.pdf`);

    // 1. REGLA DE ORO: Máximo 10MB de entrada
    const stats = fs.statSync(absolutePath);
    const fileSizeMB = stats.size / (1024 * 1024);
    const CLOUD_LIMIT = 3.5; // Límite del plan gratuito
    if (stats.size > 10 * 1024 * 1024) {
      throw new Error(
        "El archivo original excede el límite de 10MB permitido."
      );
    }

    try {
      // --- ESCENARIO A: IMÁGENES ---
      if (mimetype.startsWith("image/")) {
        console.log("📸 Procesando imagen -> Grayscale + 300 DPI");

        const imageBuffer = await sharp(absolutePath)
          .grayscale() // <--- MEJORA 1: Reduce peso drásticamente
          .jpeg({ quality: 75 }) // <--- MEJORA 2: Bajamos un poco a 75 (imperceptible en texto)
          .toBuffer();

        const pdfDoc = await PDFDocument.create();
        const image = await pdfDoc.embedJpg(imageBuffer);
        const { width, height } = image.scale(72 / 300);
        const page = pdfDoc.addPage([width, height]);
        page.drawImage(image, { x: 0, y: 0, width, height });

        fs.writeFileSync(outputPath, await pdfDoc.save());
      }

      // --- ESCENARIO B: PDF NATIVO ---
      else if (mimetype === "application/pdf") {
        if (stats.size > CLOUD_LIMIT) {
          console.log(
            "🗜️ PDF pesado detectado. Iniciando compresión en la nube..."
          );
          await this.compressPdfViaCloud(absolutePath, outputPath);
        } else {
          console.log("📄 PDF ligero. Limpiando estructura localmente...");
          const pdfBytes = fs.readFileSync(absolutePath);
          const pdfDoc = await PDFDocument.load(pdfBytes);
          fs.writeFileSync(
            outputPath,
            await pdfDoc.save({ useObjectStreams: true })
          );
        }
      }

      // --- OFFICE (WORD / EXCEL) ---
      // --- OFFICE (WORD / EXCEL) ---
      else {
        const apiInstance =
          new CloudmersiveConvertApiClient.ConvertDocumentApi();
        const inputFile = fs.readFileSync(absolutePath);

        console.log(
          `☁️ Procesando archivo Office: ${fileName}${path.extname(
            absolutePath
          )}`
        );

        const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
          const callback = (error: any, data: any) => {
            if (error) {
              const detail = error.response?.body?.toString() || error.message;
              console.error("❌ Error detallado de la API:", detail);
              reject(error);
            } else {
              resolve(data);
            }
          };

          // USAR MÉTODOS ESPECÍFICOS SEGÚN LA EXTENSIÓN
          const extension = path.extname(absolutePath).toLowerCase();

          if ([".docx", ".doc"].includes(extension))
            apiInstance.convertDocumentDocxToPdf(inputFile, callback);
          else if ([".xlsx", ".xls", ".xlt"].includes(extension))
            apiInstance.convertDocumentXlsxToPdf(inputFile, callback);
          else apiInstance.convertDocumentAutodetectToPdf(inputFile, callback);
        });

        fs.writeFileSync(outputPath, pdfBuffer);
        console.log("✅ Conversión Office exitosa.");
      }

      // VALIDACIÓN FINAL DE PESO
      const finalStats = fs.statSync(outputPath);
      if (finalStats.size > 3 * 1024 * 1024) {
        console.warn(
          "⚠️ El archivo final aún supera los 3MB. Se recomienda revisión manual."
        );
      }

      return outputPath;
    } catch (error) {
      console.error(`❌ Error en VucemProcessor:`, error);
      throw error;
    }
  }

  // Nueva función para comprimir PDFs que pesan entre 3MB y 10MB
  private static async compressPdfViaCloud(
    inputPath: string,
    outputPath: string
  ) {
    // Usamos el API de edición de PDF
    const apiInstance = new CloudmersiveConvertApiClient.EditPdfApi();
    const inputFile = fs.readFileSync(inputPath);
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(
          new Error(
            "⏳ Tiempo de espera agotado (90s). La API de compresión no respondió."
          )
        );
      }, 90000);
      // Intentamos detectar cuál es el nombre que tu SDK le puso a la función de optimizar
      // Probamos los 3 nombres más comunes en las versiones de Cloudmersive
      const callback = (error: any, data: any) => {
        clearTimeout(timeout);
        if (error) {
          console.error(
            "❌ Error en la nube:",
            error.response?.text || error.message
          );
          reject(error);
        } else {
          fs.writeFileSync(outputPath, data);
          console.log("✅ PDF comprimido exitosamente.");
          resolve();
        }
      };
      try {
        // Intentamos el método que más suele funcionar en la versión actual
        console.log("📤 Enviando a la nube para cirugía de reducción...");
        apiInstance.editPdfReduceFileSize(inputFile, callback);
      } catch (err) {
        clearTimeout(timeout);
        reject(err);
      }
    });
  }
  // Borra el archivo original después de procesarlo
  static async cleanupOriginal(filePath: string) {
    try {
      await fsPromises.unlink(filePath);
      console.log(`🗑️ Archivo temporal eliminado: ${path.basename(filePath)}`);
    } catch (error) {
      console.error(`⚠️ No se pudo eliminar el temporal: ${filePath}`, error);
    }
  }
}
