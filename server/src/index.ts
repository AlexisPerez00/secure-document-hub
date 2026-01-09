import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import type { Request, Response } from "express";
import "dotenv/config";
import mongoose from "mongoose";
import Document from "./models/Document";
import { processImageForVucem } from "./services/vucemProcessor";

// Sustituye esta URL por la de tu base de datos local o de Atlas después
const MONGO_URI =
  process.env.MONGO_URI || "mongodb://localhost:27017/secure_hub";

mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ Conectado a MongoDB"))
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
app.post(
  "/api/upload",
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      if (!req.file) return res.status(400).json({ error: "No file uploaded" });

      // Aquí buscamos el documento si el frontend envió un ID,
      // o creamos uno nuevo si no lo hizo.
      const newDoc = new Document({
        filename: req.file.filename,
        originalName: req.file.originalname,
        path: req.file.path,
        mimetype: req.file.mimetype,
        size: req.file.size,
        status: "Recibido",
      });

      await newDoc.save();

      // DISPARAR PROCESAMIENTO VUCEM SI ES IMAGEN
      // ... dentro de app.post("/api/upload")
      if (req.file.mimetype.startsWith("image/")) {
        try {
          // Es vital el AWAIT aquí
          const vucemPath = await processImageForVucem(req.file.path);
          newDoc.status = "VUCEM_Listo";
          await newDoc.save();
        } catch (procError) {
          console.error("Fallo el proceso VUCEM:", procError);
          // No detenemos la respuesta, pero marcamos el error en la BD
          newDoc.status = "Error";
          await newDoc.save();
        }
      }

      res.json({ message: "Éxito", data: newDoc });
    } catch (error) {
      res.status(500).json({ error: "Error en servidor" });
    }
  }
);

app.listen(PORT, () => {
  console.log(`✅ Backend running on http://localhost:${PORT}`);
});
