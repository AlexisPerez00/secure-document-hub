import nodemailer from "nodemailer";

// Configuración del transporte
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com", // ✅ Fallback a Gmail
  port: 465,
  secure: true,
  auth: {
    user: process.env.IMAP_USER,
    pass: process.env.IMAP_PASS,
  },
});

export class NotificationService {
  static async sendSummary(
    to: string,
    successFiles: { path: string; name: string }[],
    errors: { name: string; error: string }[]
  ) {
    try {
      const hasSuccess = successFiles.length > 0;
      const hasErrors = errors.length > 0;

      let subject = "";
      if (hasSuccess && !hasErrors)
        subject = "✅ Documentos procesados con éxito";
      else if (hasSuccess && hasErrors)
        subject = "⚠️ Procesamiento parcial (algunos archivos fallaron)";
      else subject = "❌ Error procesando tus documentos";

      let htmlBody = `<h3>Resumen de procesamiento</h3>`;

      if (hasSuccess) {
        htmlBody += `<p><b>✅ Archivos listos (${successFiles.length}):</b></p><ul>`;
        successFiles.forEach((f) => {
          htmlBody += `<li>${f.name}</li>`;
        });
        htmlBody += `</ul>`;
      }

      if (hasErrors) {
        htmlBody += `<p style="color:red;"><b>❌ Errores (${errors.length}):</b></p><ul>`;
        errors.forEach((e) => {
          htmlBody += `<li><b>${e.name}:</b> ${e.error}</li>`;
        });
        htmlBody += `</ul><p>Por favor verifica que los archivos con error no estén dañados o protegidos con contraseña.</p>`;
      }

      htmlBody += `<br><small>Secure Document Hub Bot</small>`;

      const attachments = successFiles.map((f) => ({
        filename: f.name,
        path: f.path,
      }));

      await transporter.sendMail({
        from: `"Secure Hub Bot" <${process.env.IMAP_USER}>`,
        to: to,
        subject: subject,
        html: htmlBody,
        attachments: attachments,
      });

      console.log(`📧 Reporte consolidado enviado a ${to}`);
    } catch (error) {
      console.error("❌ Error fatal enviando reporte consolidado:", error);
    }
  }
}
