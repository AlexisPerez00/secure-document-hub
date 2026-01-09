import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import fs from "fs";
import type { Request, Response } from "express";

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

app.use(cors());
app.use(express.json());

// ─────────────────────────────────────────────
// RUTA DE SALUD (GET)
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

// ─────────────────────────────────────────────
// RUTA PARA CREAR DOCUMENTO (POST /api/documents)
// (por ahora, simula creación y devuelve un id)
app.post("/api/documents", (req: Request, res: Response) => {
  const { originalName, mimeType, size, source } = req.body || {};
  if (!originalName || !mimeType || !size || !source) {
    return res.status(400).json({ error: "Campos incompletos" });
  }
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  // TODO: en FASE 3 guardaremos esto en MongoDB
  res.json({ id });
});

// ─────────────────────────────────────────────
// RUTA PARA SUBIDA DE ARCHIVOS (POST /api/upload)

// Antes de configurar storage:
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (_req, file, cb) => {
    const unique = Date.now() + "-" + file.originalname;
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB (ajustable)
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp",
    ];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Tipo de archivo no permitido"));
    }
    cb(null, true);
  },
});

app.post(
  "/api/upload",
  upload.single("file"),
  (req: Request, res: Response) => {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });

    res.json({
      message: "File uploaded successfully",
      filename: req.file.filename,
      originalName: req.file.originalname,
      size: req.file.size,
      storagePath: `uploads/${req.file.filename}`,
    });
  }
);

// ─────────────────────────────────────────────
// (Opcional) RUTA PARA ENCOLAR CONVERSIÓN (POST /api/convert)
// Por ahora devuelve éxito simulado
app.post("/api/convert", (req, res) => {
  const { documentId } = req.body || {};
  if (!documentId)
    return res.status(400).json({ error: "documentId requerido" });
  // TODO: en FASE 5 implementaremos el pipeline VUCEM
  res.json({ queued: true });
});

app.listen(PORT, () => {
  console.log(`✅ Backend running on http://localhost:${PORT}`);
});
