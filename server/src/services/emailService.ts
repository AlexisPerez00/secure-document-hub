import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import fs from "fs";
import path from "path";
import { VucemProcessor } from "./vucemProcessor";
import { DocumentModel } from "../models/Document";

export class EmailService {
  private client: ImapFlow;
  private uploadDir = path.resolve(__dirname, "../../uploads");

  constructor() {
    this.client = new ImapFlow({
      host: process.env.IMAP_HOST || "",
      port: parseInt(process.env.IMAP_PORT || "993"),
      secure: true,
      auth: {
        user: process.env.IMAP_USER || "",
        pass: process.env.IMAP_PASS || "",
      },
      logger: false,
    });
  }

  async start() {
    try {
      // 1. ESCUCHAR ERRORES GLOBALES DEL CLIENTE (Vital para que no se caiga la app)
      this.client.on("error", (err) => {
        console.error("⚠️ Error de red en el buzón (IMAP):", err.message);
        // No hacemos throw, solo informamos. ImapFlow intentará reconectar o fallará silenciosamente.
      });
      await this.client.connect();
      console.log("📧 Conectado al servidor de correo. Esperando mensajes...");

      // Seleccionamos la bandeja de entrada
      let lock = await this.client.getMailboxLock("INBOX");
      try {
        // Escuchamos nuevos correos (evento 'exists')
        this.client.on("exists", async (data) => {
          await this.processLastEmail();
        });
      } finally {
        lock.release();
      }
    } catch (err) {
      console.error("❌ Error en conexión IMAP:", err);
      // Reintento de conexión en 10 segundos
      setTimeout(() => this.start(), 10000);
    }
  }

  private async processLastEmail() {
    // Buscamos el mensaje más reciente que no hayamos leído
    let message = await this.client.fetchOne("*", { source: true });

    // VALIDACIÓN CRÍTICA: Si no hay mensaje o no tiene contenido (source), salimos.
    if (!message || !message.source) {
      console.log("Empty message or no source found.");
      return;
    }

    // Analizamos el contenido del correo
    const parsed = await simpleParser(message.source);

    if (parsed.attachments && parsed.attachments.length > 0) {
      const fromAddress = parsed.from?.value[0]?.address || "unknown";
      console.log(
        `📩 Nuevo correo de: ${fromAddress} con ${parsed.attachments.length} adjuntos.`
      );

      for (const attachment of parsed.attachments) {
        // Fallback por si el adjunto no tiene nombre
        const originalName = attachment.filename || `file-${Date.now()}`;
        const filename = `${Date.now()}-${originalName}`;
        const filePath = path.join(this.uploadDir, filename);

        // 1. Guardar archivo físico
        fs.writeFileSync(filePath, attachment.content);

        // 2. Crear registro en MongoDB
        const newDoc = new DocumentModel({
          originalName: originalName,
          storedName: filename, // Usamos el nombre del archivo guardado en disco
          mimetype: attachment.contentType || "application/pdf",
          size: attachment.size,
          source: "email", // En minúscula para coincidir con el Schema
          status: "pending", // Estado inicial
          downloadUrl: "", // Aún no tiene URL final
        });
        await newDoc.save();

        // 3. Procesar para VUCEM automáticamente
        try {
          console.log(`⚙️ Procesando adjunto: ${originalName}`);
          const outputPath = await VucemProcessor.process(
            filePath,
            attachment.contentType || "application/octet-stream",
            "email"
          );
          // ACTUALIZAMOS EL REGISTRO CON ÉXITO
          newDoc.status = "completed";
          newDoc.storedName = path.basename(outputPath); // Actualizamos al nombre final (vucem_ready)
          newDoc.size = fs.statSync(outputPath).size; // Actualizamos el peso final real
          newDoc.downloadUrl = `/uploads/vucem_ready/${path.basename(
            outputPath
          )}`;
          await newDoc.save();

          // LIMPIEZA: Solo si quieres borrar el original de la carpeta uploads (opcional)
          // await VucemProcessor.cleanupOriginal(filePath);

          console.log(`✅ Adjunto procesado y registrado en DB.`);
        } catch (error: any) {
          console.error(`❌ Error procesando adjunto de email:`, error);

          // ACTUALIZAMOS EL REGISTRO CON ERROR
          newDoc.status = "error";
          newDoc.errorMessage = error.message;
          await newDoc.save();
        }
      }
    }
  }
}
