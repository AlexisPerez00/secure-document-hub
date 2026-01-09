import mongoose from "mongoose";

const DocumentSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  originalName: { type: String, required: true },
  path: { type: String, required: true },
  mimetype: { type: String, required: true },
  size: { type: Number, required: true }, // Importante para el límite de 10MB
  status: {
    type: String,
    enum: ["Recibido", "Procesando", "VUCEM_Listo", "Error"],
    default: "Recibido",
  },
  dpi: { type: Number, default: 72 }, // Valor inicial, luego lo subiremos a 300
  source: { type: String, enum: ["Manual", "Email"], default: "Manual" },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Document", DocumentSchema);
