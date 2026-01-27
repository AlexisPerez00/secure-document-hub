import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import fs from "fs";
import path from "path";
import { VucemProcessor } from "./vucemProcessor";
import { NotificationService } from "./NotificationService";

export class EmailService {
  private client: ImapFlow;
  private uploadDir = path.resolve(__dirname, "../../uploads");
  private isProcessing = false;

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

      const lock = await this.client.getMailboxLock("INBOX");
      try {
        this.client.on("exists", async (data) => {
          // Evitar procesamiento concurrente
          if (!this.isProcessing) {
            await this.processLastEmail();
          }
        });
      } finally {
        lock.release();
      }
    } catch (err) {
      console.error("❌ Error en conexión IMAP:", err);
      console.log("🔄 Reintentando conexión en 10 segundos...");
      setTimeout(() => this.start(), 10000);
    }
  }

  private async processLastEmail() {
    this.isProcessing = true;

    try {
      const message = await this.client.fetchOne("*", { source: true });

      if (!message || !message.source) {
        this.isProcessing = false;
        return;
      }

      const parsed = await simpleParser(message.source);

      if (parsed.attachments && parsed.attachments.length > 0) {
        const fromAddress = parsed.from?.value[0]?.address || "unknown";
        console.log("\n" + "=".repeat(60));
        console.log(`📩 Nuevo correo de: ${fromAddress}`);
        console.log(`📎 Adjuntos: ${parsed.attachments.length}`);
        console.log("=".repeat(60));

        // Arrays para tracking de éxitos y errores
        const processedFiles: { path: string; name: string }[] = [];
        const errorFiles: { name: string; error: string }[] = [];

        for (const attachment of parsed.attachments) {
          const originalName = attachment.filename || `file-${Date.now()}`;
          const filename = `${Date.now()}-${originalName}`;
          const filePath = path.join(this.uploadDir, filename);

          console.log(`\n📄 Procesando: ${originalName}`);
          console.log(`📊 Tamaño: ${(attachment.size / 1024).toFixed(2)} KB`);

          try {
            // 1. Guardar físico temporal
            fs.writeFileSync(filePath, attachment.content);

            // 2. Validación previa (opcional)
            const validation =
              await VucemProcessor.validateBeforeProcessing(filePath);
            if (validation.warnings.length > 0) {
              console.warn("⚠️ Advertencias:", validation.warnings.join(", "));
            }

            // 3. PROCESAMIENTO HÍBRIDO (ConvertAPI + VUCEM)
            console.log("🔄 Iniciando procesamiento VUCEM híbrido...");
            const outputPath = await VucemProcessor.process(
              filePath,
              attachment.contentType || "application/octet-stream",
              "email",
              originalName,
            );

            // 4. Registrar éxito
            const finalSize = fs.statSync(outputPath).size;
            const vucemName = `${path.parse(originalName).name}_vucem.pdf`;

            processedFiles.push({
              path: outputPath,
              name: vucemName,
            });

            console.log(`✅ ${originalName} convertido exitosamente`);
            console.log(
              `📦 Tamaño final: ${(finalSize / 1024).toFixed(2)} KB (${(finalSize / 1024 / 1024).toFixed(2)} MB)`,
            );

            // 5. Limpieza inmediata del temporal
            await VucemProcessor.cleanupOriginal(filePath);
          } catch (error: any) {
            console.error(`❌ Error procesando ${originalName}:`);
            console.error(`   ${error.message}`);

            // Determinar tipo de error
            let errorMsg = error.message || "Error desconocido al procesar";

            // Errores específicos de VUCEM
            if (errorMsg.includes("contraseña")) {
              errorMsg =
                "El PDF está protegido con contraseña (no permitido por VUCEM)";
            } else if (errorMsg.includes("formularios")) {
              errorMsg =
                "El PDF contiene formularios interactivos (no permitido por VUCEM)";
            } else if (errorMsg.includes("JavaScript")) {
              errorMsg =
                "El PDF contiene código JavaScript (no permitido por VUCEM)";
            } else if (errorMsg.includes("3 MB")) {
              errorMsg =
                "El archivo excede el límite de 3 MB después de compresión";
            }

            errorFiles.push({
              name: originalName,
              error: errorMsg,
            });

            // Limpieza de emergencia
            try {
              if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
              }
            } catch (e) {
              console.error("Error limpiando archivo temporal:", e);
            }
          }
        }

        // ENVIAR NOTIFICACIÓN CON RESULTADOS
        if (processedFiles.length > 0 || errorFiles.length > 0) {
          console.log(`\n📧 Enviando notificación a ${fromAddress}...`);
          try {
            await NotificationService.sendSummary(
              fromAddress,
              processedFiles,
              errorFiles,
            );
            console.log(`✅ Notificación enviada exitosamente`);
          } catch (notifError: any) {
            console.error(
              `❌ Error enviando notificación:`,
              notifError.message,
            );
          }
        }

        // ESTADÍSTICAS FINALES
        console.log("\n" + "=".repeat(60));
        console.log(`📊 RESUMEN DEL PROCESAMIENTO:`);
        console.log(`   ✅ Exitosos: ${processedFiles.length}`);
        console.log(`   ❌ Errores: ${errorFiles.length}`);
        console.log(`   📝 Total: ${parsed.attachments.length}`);
        console.log("=".repeat(60) + "\n");

        // BORRAR EL CORREO DEL SERVIDOR
        try {
          await this.client.messageDelete(String(message.seq));
          console.log("🗑️ Correo procesado y eliminado del servidor.");
        } catch (err) {
          console.error("⚠️ No se pudo eliminar el correo:", err);
        }
      } else {
        console.log("📭 Correo sin adjuntos, ignorando...");
      }
    } catch (error: any) {
      console.error("❌ Error general en processLastEmail:", error.message);
    } finally {
      this.isProcessing = false;
    }
  }
}
