import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import type { Request, Response } from "express";
import "dotenv/config";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { DocumentModel } from "./models/Document";
import { VucemProcessor } from "./services/vucemProcessor";
import { EmailService } from "./services/emailService";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

dotenv.config();

// --- CONEXIÓN A MONGODB ---
mongoose
  .connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/secure_hub")
  .then(() => {
    console.log("✅ Conectado a MongoDB");

    // --- ARRANCAR EL BUZÓN DE EMAIL ---
    const emailService = new EmailService();
    emailService.start();
  })
  .catch((err) => console.error("❌ Error de conexión a MongoDB:", err));

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

// RUTA DE SALUD
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

// CONFIGURACIÓN DE ALMACENAMIENTO (MULTER)
const uploadDir = path.resolve(__dirname, "..", "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

// 📝 LÍMITE AUMENTADO: Archivos originales pueden ser grandes antes de compresión
// VUCEM requiere max 3MB en el OUTPUT, no en el INPUT
const UPLOAD_BUFFER_SIZE = 20 * 1024 * 1024; // 20 MB para permitir compresión

const upload = multer({
  storage,
  limits: { fileSize: UPLOAD_BUFFER_SIZE },
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "image/jpeg",
      "image/png",
      "image/jpg",
      "image/tiff",
      "image/bmp",
    ];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Tipo de archivo no permitido para VUCEM"));
    }
    cb(null, true);
  },
});

// RUTA: OBTENER HISTORIAL DE DOCUMENTOS
app.get("/api/documents", async (req, res) => {
  try {
    const docs = await DocumentModel.find().sort({ processedAt: -1 });
    res.json(docs);
  } catch (error) {
    console.error("Error fetching documents:", error);
    res.status(500).json({ error: "Error al obtener historial" });
  }
});

// RUTA: SUBIDA DE ARCHIVOS (POST /api/upload)
app.post(
  "/api/upload",
  upload.single("file"),
  async (req: Request, res: Response) => {
    const uploadedFilePath = req.file?.path;
    try {
      if (!req.file || !uploadedFilePath) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      console.log(`🚀 Archivo recibido (manual): ${req.file.originalname}`);
      console.log(
        `📊 Tamaño original: ${(req.file.size / 1024 / 1024).toFixed(2)} MB`,
      );

      // ✅ VALIDACIÓN PREVIA (Rechazar archivos muy grandes)
      const validation =
        await VucemProcessor.validateBeforeProcessing(uploadedFilePath);

      if (!validation.valid) {
        // Limpiar archivo antes de rechazar
        if (fs.existsSync(uploadedFilePath)) {
          fs.unlinkSync(uploadedFilePath);
        }
        return res.status(400).json({
          error: validation.warnings.join(", "),
          suggestion:
            "Reduce el tamaño del archivo original antes de procesarlo. Puedes usar herramientas online o comprimir las imágenes dentro del PDF.",
        });
      }

      if (validation.warnings.length > 0) {
        console.warn("⚠️ Advertencias:", validation.warnings);
      }

      // ✅ LLAMAR AL PROCESADOR HÍBRIDO
      console.log("🔄 Iniciando procesamiento VUCEM...");
      const vucemPath = await VucemProcessor.process(
        uploadedFilePath,
        req.file.mimetype,
        "manual",
      );

      // Limpiar archivo temporal original
      try {
        if (fs.existsSync(uploadedFilePath)) {
          fs.unlinkSync(uploadedFilePath);
          console.log(`🧹 Archivo temporal eliminado: ${uploadedFilePath}`);
        }
      } catch (cleanupError) {
        console.error("Error limpiando temporal:", cleanupError);
      }

      // Obtener tamaño final
      const finalSize = fs.statSync(vucemPath).size;
      console.log(
        `✅ Procesamiento completado. Tamaño final: ${(finalSize / 1024 / 1024).toFixed(2)} MB`,
      );

      res.json({
        message: "Archivo procesado correctamente según estándares VUCEM",
        path: vucemPath,
        originalSize: req.file.size,
        finalSize: finalSize,
        compressionRatio:
          ((1 - finalSize / req.file.size) * 100).toFixed(1) + "%",
      });
    } catch (error: unknown) {
      console.error("❌ Error en upload:", error);

      // Limpiar archivo temporal en caso de error
      if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
        try {
          fs.unlinkSync(uploadedFilePath);
        } catch (e) {
          console.error("Error limpiando temporal tras fallo:", e);
        }
      }

      const errorMessage =
        error instanceof Error ? error.message : String(error);

      res.status(500).json({
        error: errorMessage,
        details: "El archivo no pudo ser procesado según los requisitos VUCEM",
      });
    }
  },
);

// RUTA: ELIMINAR DOCUMENTO
app.delete("/api/documents/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Buscar el documento en BD
    const doc = await DocumentModel.findById(id);
    if (!doc) {
      return res.status(404).json({ error: "Documento no encontrado" });
    }

    // Eliminar archivo físico de vucem_ready
    const filePath = path.join(
      __dirname,
      "../uploads/vucem_ready",
      doc.storedName,
    );

    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log(`🗑️ Archivo físico eliminado: ${doc.storedName}`);
      } catch (err: unknown) {
        const error = err instanceof Error ? err.message : String(err);
        console.error("Error borrando archivo físico:", error);
      }
    }

    // Eliminar registro de MongoDB
    await DocumentModel.findByIdAndDelete(id);

    res.json({ message: "Documento eliminado correctamente" });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Error al eliminar:", message);
    res.status(500).json({ error: "Error interno al eliminar" });
  }
});

// RUTA: VERIFICAR ESTADO DE GHOSTSCRIPT (útil para debugging)
app.get("/api/system/ghostscript", async (_req: Request, res: Response) => {
  try {
    // En Windows usa gswin64c, en Unix/Mac usa gs
    const isWindows = process.platform === "win32";
    const gsCommand = isWindows ? "gswin64c --version" : "gs --version";

    const { stdout } = await execAsync(gsCommand);
    res.json({
      available: true,
      version: stdout.trim(),
      command: isWindows ? "gswin64c" : "gs",
      message: "Ghostscript está instalado y disponible",
    });
  } catch (error) {
    res.json({
      available: false,
      message: "Ghostscript NO está instalado o no está en el PATH.",
      install:
        "Windows: Asegúrate de agregar C:\\Program Files\\gs\\gs10.06.0\\bin al PATH y reinicia VSCode | Ubuntu/Debian: sudo apt-get install ghostscript | macOS: brew install ghostscript",
    });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Backend running on http://localhost:${PORT}`);
  console.log(`📁 Upload directory: ${uploadDir}`);
  console.log(
    `📄 Documentos procesados en: ${path.join(uploadDir, "vucem_ready")}`,
  );
});
