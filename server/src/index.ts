import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import type { Request, Response } from "express";
import "dotenv/config";
import dotenv from "dotenv";
import mongoose from "mongoose";
import Document from "./models/Document";
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

// 2. ACTUALIZACIÓN: Ruta para subida con persistencia REAL
// MODIFICAMOS LA RUTA para manejar el error de tamaño
app.post("/api/documents", async (req: Request, res: Response) => {
  try {
    const { originalName, mimeType, size, source } = req.body;

    // Creamos un registro preliminar en MongoDB
    const newDoc = new Document({
      filename: "pending", // Se actualizará al subir el archivo
      originalName,
      mimetype: mimeType,
      size,
      source: source || "Manual",
      status: "Recibido",
    });

    await newDoc.save();

    // Devolvemos el ID para que el frontend sepa a qué registro pertenece el archivo
    res.json({ id: newDoc._id });
  } catch (error) {
    console.error("Error al crear registro:", error);
    res.status(500).json({ error: "Error al crear registro inicial" });
  }
});

// ─────────────────────────────────────────────
// 2. RUTA PARA SUBIDA DE ARCHIVOS (POST /api/upload)
// Asegúrate de que esta ruta coincida con lo que el frontend envía
// ─────────────────────────────────────────────
// RUTA ACTUALIZADA EN index.ts
// ─────────────────────────────────────────────
app.post(
  "/api/upload",
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });

      // 1. Guardamos el registro en MongoDB
      const newDoc = new Document({
        filename: req.file.filename,
        originalName: req.file.originalname,
        path: req.file.path,
        mimetype: req.file.mimetype,
        size: req.file.size,
        status: "Recibido",
      });
      await newDoc.save();

      // 2. PROCESAMIENTO UNIVERSAL (Quitamos el 'if' de imagen)
      console.log(
        `🚀 Recibido: ${req.file.originalname} | Tipo: ${req.file.mimetype}`
      );

      try {
        // Llamamos al procesador para CUALQUIER tipo de archivo
        const vucemPath = await VucemProcessor.process(
          req.file.path,
          req.file.mimetype
        );

        newDoc.status = "VUCEM_Listo";
        // Si es imagen, marcamos los 300 DPI
        if (req.file.mimetype.startsWith("image/")) newDoc.dpi = 300;

        await newDoc.save();
        console.log(`✅ Procesado con éxito: ${vucemPath}`);
        // LIMPIEZA: Borramos el original después de procesar con éxito
        await VucemProcessor.cleanupOriginal(req.file.path);
      } catch (procError) {
        // Si algo falla (ej. la API de Cloudmersive), lo registramos
        console.error(
          "❌ Fallo el proceso VUCEM para este archivo:",
          procError
        );
        newDoc.status = "Error";
        await newDoc.save();
      }

      res.json({ message: "Archivo recibido", data: newDoc });
    } catch (error) {
      console.error("Error en servidor:", error);
      res.status(500).json({ error: "Error interno" });
    }
  }
);

app.listen(PORT, () => {
  console.log(`✅ Backend running on http://localhost:${PORT}`);
});
