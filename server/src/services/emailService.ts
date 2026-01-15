import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import fs from "fs";
import path from "path";
import { VucemProcessor } from "./vucemProcessor";

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
      this.client.on("error", (err) => {
        console.error("⚠️ Error de red en el buzón (IMAP):", err.message);
      });
      await this.client.connect();
      console.log("📧 Conectado al servidor de correo. Esperando mensajes...");

      let lock = await this.client.getMailboxLock("INBOX");
      try {
        this.client.on("exists", async (data) => {
          await this.processLastEmail();
        });
      } finally {
        lock.release();
      }
    } catch (err) {
      console.error("❌ Error en conexión IMAP:", err);
      setTimeout(() => this.start(), 10000);
    }
  }

  private async processLastEmail() {
    // Buscamos el último mensaje
    let message = await this.client.fetchOne("*", { source: true });

    if (!message || !message.source) {
      return;
    }

    const parsed = await simpleParser(message.source);

    if (parsed.attachments && parsed.attachments.length > 0) {
      const fromAddress = parsed.from?.value[0]?.address || "unknown";
      console.log(
        `📩 Nuevo correo de: ${fromAddress} con ${parsed.attachments.length} adjuntos.`
      );

      for (const attachment of parsed.attachments) {
        const originalName = attachment.filename || `file-${Date.now()}`;
        const filename = `${Date.now()}-${originalName}`;
        const filePath = path.join(this.uploadDir, filename);

        try {
          // 1. Guardar físico temporal
          fs.writeFileSync(filePath, attachment.content);
          console.log(`⚙️ Enviando a procesar: ${originalName}...`);

          // 2. LLAMADA AL PROCESADOR
          // (Sin arrays de reporte, porque quitamos las notificaciones)
          await VucemProcessor.process(
            filePath,
            attachment.contentType || "application/octet-stream",
            "email",
            originalName
          );

          // 3. Limpieza inmediata
          await VucemProcessor.cleanupOriginal(filePath);
        } catch (error: any) {
          console.error(`❌ Error en archivo ${originalName}:`, error.message);
          // Limpieza de emergencia
          try {
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
          } catch (e) {}
        }
      }

      //  BORRAR EL CORREO
      try {
        // Usamos message.seq para decirle al servidor "borra este que acabo de leer"
        await this.client.messageDelete(String(message.seq));
        console.log("🗑️ Correo procesado y eliminado del servidor.");
      } catch (err) {
        console.error("⚠️ No se pudo eliminar el correo:", err);
      }
    }
  }
}
