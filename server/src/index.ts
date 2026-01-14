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

dotenv.config();
// Sustituye esta URL por la de tu base de datos local o de Atlas después
// --- CONEXIÓN A MONGODB ---
mongoose
  .connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/secure_hub")
  .then(() => {
    console.log("✅ Conectado a MongoDB");

    // --- ARRANCAR EL BUZÓN DE EMAIL ---
    // Solo lo iniciamos después de confirmar que la DB funciona
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
// Ajustamos para que suba un nivel si la carpeta 'uploads' está fuera de 'src'
const uploadDir = path.resolve(__dirname, "..", "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const UPLOAD_BUFFER_SIZE = 30 * 1024 * 1024;

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
    ];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Tipo de archivo no permitido para VUCEM"));
    }
    cb(null, true);
  },
});

app.get("/api/documents", async (req, res) => {
  try {
    // Traemos todos los documentos ordenados por fecha (el más nuevo arriba)
    const docs = await DocumentModel.find().sort({ processedAt: -1 });
    res.json(docs);
  } catch (error) {
    console.error("Error fetching documents:", error);
    res.status(500).json({ error: "Error al obtener historial" });
  }
});
// ─────────────────────────────────────────────
// 2. RUTA PARA SUBIDA DE ARCHIVOS (POST /api/upload)
// ─────────────────────────────────────────────

app.post(
  "/api/upload",
  upload.single("file"),
  async (req: Request, res: Response) => {
    const uploadedFilePath = req.file?.path;
    try {
      if (!req.file || !uploadedFilePath) {
        return res.status(400).json({ error: "No file uploaded" });
      }

      console.log(`🚀 Recibido manual: ${req.file.originalname}`);

      // 2. LLAMAR AL PROCESADOR (Él se encarga de convertir y GUARDAR en la BD)
      const vucemPath = await VucemProcessor.process(
        uploadedFilePath,
        req.file.mimetype,
        "manual"
      );

      try {
        if (fs.existsSync(uploadedFilePath)) {
          fs.unlinkSync(uploadedFilePath);
          console.log(`🧹 Archivo temporal eliminado: ${uploadedFilePath}`);
        }
      } catch (cleanupError) {
        console.error("Error limpiando temporal:", cleanupError);
      }
      // 3. Responder Éxito
      res.json({
        message: "Archivo procesado correctamente",
        path: vucemPath,
      });
    } catch (error: any) {
      console.error("Error en upload:", error);
      if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
        try {
          fs.unlinkSync(uploadedFilePath);
        } catch (e) {}
      }
      res.status(500).json({ error: error.message });
    }
  }
);

// RUTA PARA ELIMINAR DOCUMENTO
app.delete("/api/documents/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // 1. Buscar el documento en BD para saber el nombre del archivo
    const doc = await DocumentModel.findById(id);
    if (!doc) {
      return res.status(404).json({ error: "Documento no encontrado" });
    }

    // 2. Eliminar el archivo físico de la carpeta vucem_ready
    const filePath = path.join(
      __dirname,
      "../uploads/vucem_ready",
      doc.storedName
    );
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        console.log(`🗑️ Archivo físico eliminado: ${doc.storedName}`);
      } catch (err) {
        console.error("Error borrando archivo físico:", err);
      }
    }

    // 3. Eliminar el registro de MongoDB
    await DocumentModel.findByIdAndDelete(id);

    res.json({ message: "Documento eliminado correctamente" });
  } catch (error) {
    console.error("Error al eliminar:", error);
    res.status(500).json({ error: "Error interno al eliminar" });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Backend running on http://localhost:${PORT}`);
});
