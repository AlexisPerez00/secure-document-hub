import mongoose from "mongoose";

const DocumentSchema = new mongoose.Schema({
  originalName: { type: String, required: true },
  storedName: { type: String, required: true }, // El nombre en vucem_ready
  mimetype: { type: String, required: true }, // Para la columna "Tipo Original"
  size: { type: Number, required: true }, // Peso final en bytes
  source: {
    type: String,
    enum: ["email", "manual"],
    default: "manual",
  },
  status: {
    type: String,
    enum: ["pending", "completed", "error"],
    default: "pending",
  },
  downloadUrl: { type: String }, // Ruta para descargarlo
  errorMessage: { type: String },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export const DocumentModel = mongoose.model("Document", DocumentSchema);
