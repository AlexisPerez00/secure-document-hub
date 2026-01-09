import sharp from "sharp";
import path from "path";
import fs from "fs";
import { PDFDocument } from "pdf-lib"; // Importamos la nueva librería

export const processImageForVucem = async (
  filePath: string
): Promise<string> => {
  const absoluteInputPath = path.resolve(filePath);
  const outputDir = path.resolve(__dirname, "../../uploads/vucem_ready");

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const fileName = path.basename(
    absoluteInputPath,
    path.extname(absoluteInputPath)
  );
  const outputPath = path.join(outputDir, `${fileName}-vucem.pdf`);

  try {
    console.log("🔍 Procesando imagen con Sharp...");

    // 1. Optimizamos la imagen con Sharp y obtenemos un Buffer (JPG)
    // Forzamos 300 DPI mediante el redimensionamiento si es necesario
    const imageBuffer = await sharp(absoluteInputPath)
      .jpeg({ quality: 85 }) // Calidad alta pero optimizada
      .toBuffer();

    const metadata = await sharp(imageBuffer).metadata();

    console.log("📄 Creando contenedor PDF...");

    // 2. Usamos pdf-lib para crear el PDF e insertar la imagen
    const pdfDoc = await PDFDocument.create();
    const image = await pdfDoc.embedJpg(imageBuffer);

    // VUCEM requiere que la imagen se vea bien.
    // Calculamos el tamaño en puntos (PDF usa 72 puntos por pulgada)
    // Para que sea 300 DPI: (pixeles / 300) * 72
    const { width, height } = image.scale(72 / 300);

    const page = pdfDoc.addPage([width, height]);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: width,
      height: height,
    });

    // 3. Guardar el archivo final
    const pdfBytes = await pdfDoc.save();
    fs.writeFileSync(outputPath, pdfBytes);

    console.log("✅ PDF VUCEM generado con éxito:", outputPath);
    return outputPath;
  } catch (error) {
    console.error("❌ Error en el proceso de conversión:", error);
    throw error;
  }
};
