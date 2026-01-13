import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import fs from "fs";
import path from "path";
import { VucemProcessor } from "./vucemProcessor";
import { DocumentModel } from "../models/Document";
import { NotificationService } from "./NotificationService";

export class EmailService {
  private client: ImapFlow;
  private uploadDir = path.resolve(__dirname, "../../uploads");
  private isProcessing = false; // 🔒 Semáforo para evitar ejecuciones paralelas

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
        // Al conectar, procesamos lo que ya esté pendiente
        await this.processUnseenEmails();

        // Escuchamos nuevos correos
        this.client.on("exists", async (data) => {
          await this.processUnseenEmails();
        });
      } finally {
        lock.release();
      }
    } catch (err) {
      console.error("❌ Error en conexión IMAP:", err);
      setTimeout(() => this.start(), 10000);
    }
  }

  private MY_EMAIL = process.env.MY_EMAIL_ADDRESS;

  // ✅ RENOMBRADO Y REFACTORIZADO
  private async processUnseenEmails() {
    // Si ya estamos procesando, no entramos (evita condiciones de carrera)
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      console.log(`🔎 Buscando correos nuevos de: ${this.MY_EMAIL}...`);

      // 1. EL FILTRO MÁGICO:
      // - seen: false (No leídos)
      // - from: TU CORREO (Ignora eBay, Spam, etc.)
      // - since: HOY (Ignora correos viejos de hace meses)
      for await (const message of this.client.fetch(
        {
          seen: false,
          from: this.MY_EMAIL, // <--- ESTO ES LA CLAVE
          since: new Date(), // <--- Y ESTO EVITA HISTORIAL VIEJO
        },
        { source: true, uid: true }
      )) {
        if (!message.source) continue;

        try {
          const parsed = await simpleParser(message.source);
          const fromAddress = parsed.from?.value[0]?.address || "unknown";

          // Validación extra por seguridad
          if (!parsed.attachments || parsed.attachments.length === 0) {
            console.log("Correo tuyo sin adjuntos. Marcando como visto.");
            await this.client.messageFlagsAdd(String(message.uid), ["\\Seen"], {
              uid: true,
            });
            continue;
          }

          console.log(`---------------------------------------------------`);
          console.log(
            `📩 PROCESANDO: ${fromAddress} (${parsed.attachments.length} adjuntos)`
          );

          const processedFiles: { path: string; name: string }[] = [];
          const errorFiles: { name: string; error: string }[] = [];

          // --- BUCLE DE ADJUNTOS (Igual que antes) ---
          for (const attachment of parsed.attachments) {
            const originalName = attachment.filename || `file-${Date.now()}`;

            try {
              const filename = `${Date.now()}-${originalName}`;
              const filePath = path.join(this.uploadDir, filename);
              fs.writeFileSync(filePath, attachment.content);

              // 1. Guardar Pendiente
              const newDoc = new DocumentModel({
                originalName: originalName,
                storedName: filename,
                mimetype: attachment.contentType || "application/pdf",
                size: attachment.size,
                source: "email",
                status: "pending",
              });
              await newDoc.save();

              console.log(`⚙️ Convirtiendo: ${originalName}...`);

              // 2. Procesar
              const outputPath = await VucemProcessor.process(
                filePath,
                attachment.contentType || "application/octet-stream",
                "email"
              );

              // 3. Actualizar Éxito
              newDoc.status = "completed";
              newDoc.storedName = path.basename(outputPath);
              newDoc.size = fs.statSync(outputPath).size;
              newDoc.downloadUrl = `/uploads/vucem_ready/${path.basename(
                outputPath
              )}`;
              await newDoc.save();

              processedFiles.push({
                path: outputPath,
                name: `${path.parse(originalName).name}-vucem.pdf`,
              });

              // Limpieza
              try {
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
              } catch (e) {}
            } catch (error: any) {
              console.error(
                `❌ Error en archivo ${originalName}:`,
                error.message
              );
              errorFiles.push({ name: originalName, error: error.message });
              // Aquí podrías actualizar el newDoc a 'error' si lo deseas
            }
          }

          // Enviar respuesta
          if (processedFiles.length > 0 || errorFiles.length > 0) {
            await NotificationService.sendSummary(
              fromAddress,
              processedFiles,
              errorFiles
            );
          }

          // ✅ FINALMENTE: MARCAR COMO VISTO
          // Esto saca al correo de la lista "seen: false", así que el bucle no lo volverá a tocar.
          await this.client.messageFlagsAdd(String(message.uid), ["\\Seen"], {
            uid: true,
          });
          console.log(`✅ Tarea terminada. Correo marcado como visto.`);
        } catch (innerError) {
          console.error("Error interno procesando mensaje:", innerError);
          // Si falló, igual marcamos visto para no trabar el sistema
          await this.client.messageFlagsAdd(String(message.uid), ["\\Seen"], {
            uid: true,
          });
        }
      }
    } catch (error) {
      console.error("Error en ciclo de correos:", error);
    } finally {
      this.isProcessing = false;
    }
  }
}
