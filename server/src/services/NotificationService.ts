import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
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

      // Construir asunto
      let subject = "";
      if (hasSuccess && !hasErrors)
        subject = "✅ Documentos procesados con éxito";
      else if (hasSuccess && hasErrors)
        subject = "⚠️ Procesamiento parcial (algunos archivos fallaron)";
      else subject = "❌ Error procesando tus documentos";

      // Construir cuerpo HTML
      let htmlBody = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">📋 Resumen de procesamiento</h2>
      `;

      if (hasSuccess) {
        htmlBody += `
          <div style="background-color: #d4edda; border: 1px solid #c3e6cb; padding: 15px; border-radius: 5px; margin: 10px 0;">
            <h3 style="color: #155724; margin-top: 0;">✅ Archivos procesados (${successFiles.length})</h3>
            <ul style="color: #155724;">
        `;
        successFiles.forEach((f) => {
          htmlBody += `<li><strong>${f.name}</strong></li>`;
        });
        htmlBody += `
            </ul>
            <p style="color: #155724; margin-bottom: 0;">Los archivos adjuntos están listos en formato VUCEM.</p>
          </div>
        `;
      }

      if (hasErrors) {
        htmlBody += `
          <div style="background-color: #f8d7da; border: 1px solid #f5c6cb; padding: 15px; border-radius: 5px; margin: 10px 0;">
            <h3 style="color: #721c24; margin-top: 0;">❌ Archivos con errores (${errors.length})</h3>
            <ul style="color: #721c24;">
        `;
        errors.forEach((e) => {
          htmlBody += `<li><strong>${e.name}:</strong> ${e.error}</li>`;
        });
        htmlBody += `
            </ul>
            <p style="color: #721c24; margin-bottom: 0;">Por favor verifica que los archivos no estén dañados o protegidos con contraseña.</p>
          </div>
        `;
      }

      htmlBody += `
          <hr style="border: none; border-top: 1px solid #ddd; margin: 20px 0;">
          <p style="color: #666; font-size: 12px; text-align: center;">
            Secure Document Hub Bot<br>
            Sistema automático de procesamiento VUCEM
          </p>
        </div>
      `;

      // Preparar adjuntos
      const attachments = successFiles.map((f) => ({
        filename: f.name,
        path: f.path,
      }));

      // Enviar correo
      await transporter.sendMail({
        from: `"Secure Hub Bot 🤖" <${process.env.IMAP_USER}>`,
        to: to,
        subject: subject,
        html: htmlBody,
        attachments: attachments,
      });

      console.log(`📧 Reporte consolidado enviado a ${to}`);
    } catch (error) {
      console.error("❌ Error fatal enviando reporte consolidado:", error);
      throw error; // Re-lanzar para que emailService.ts lo maneje
    }
  }
}
