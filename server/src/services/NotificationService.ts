import nodemailer from "nodemailer";

// Configuración del transporte (usa tus mismas credenciales del .env)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST, // ej: imap.hostinger.com (pero usa el host SMTP)
  port: 465, // o 587
  secure: true, // true para 465, false para 587
  auth: {
    user: process.env.IMAP_USER,
    pass: process.env.IMAP_PASS,
  },
});

export class NotificationService {
  // ✅ CORREO DE ÉXITO CON EL ARCHIVO ADJUNTO
  static async sendSummary(
    to: string,
    successFiles: { path: string; name: string }[],
    errors: { name: string; error: string }[]
  ) {
    try {
      const hasSuccess = successFiles.length > 0;
      const hasErrors = errors.length > 0;

      // 1. Construimos el asunto
      let subject = "";
      if (hasSuccess && !hasErrors)
        subject = "✅ Documentos procesados con éxito";
      else if (hasSuccess && hasErrors)
        subject = "⚠️ Procesamiento parcial (algunos archivos fallaron)";
      else subject = "❌ Error procesando tus documentos";

      // 2. Construimos el cuerpo HTML
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

      // 3. Preparamos los adjuntos
      const attachments = successFiles.map((f) => ({
        filename: f.name, // El nombre final (ej: archivo-vucem.pdf)
        path: f.path,
      }));

      // 4. Enviamos el correo ÚNICO
      await transporter.sendMail({
        from: `"Secure Hub Bot" <${process.env.IMAP_USER}>`, // Usamos tu usuario configurado
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
