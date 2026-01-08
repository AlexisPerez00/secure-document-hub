import Header from "@/components/Header";
import Footer from "@/components/Footer";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

const faqs = [
  {
    question: "¿Qué es el formato VUCEM?",
    answer:
      "VUCEM (Ventanilla Única de Comercio Exterior Mexicano) es el portal del gobierno mexicano para trámites de comercio exterior. Los documentos deben cumplir especificaciones técnicas específicas: formato PDF, resolución de 300 DPI y tamaño máximo de 10 MB.",
  },
  {
    question: "¿Qué tipos de archivos puedo convertir?",
    answer:
      "Puedes convertir documentos PDF, archivos de Word (.doc, .docx), hojas de cálculo de Excel (.xls, .xlsx), e imágenes en formatos JPEG, PNG, GIF y WebP. Todos serán convertidos a PDF en formato VUCEM.",
  },
  {
    question: "¿Cómo funciona la bandeja de correo?",
    answer:
      "Al configurar tu correo electrónico, cualquier archivo adjunto que recibas será automáticamente procesado y convertido al formato VUCEM. Los documentos aparecerán en tu bandeja de entrada listos para descargar.",
  },
  {
    question: "¿Cuál es el tamaño máximo de archivo?",
    answer:
      "El archivo de entrada puede tener hasta 50 MB. Durante el proceso de conversión, optimizamos el documento para cumplir con el límite de 10 MB requerido por VUCEM manteniendo la calidad de 300 DPI.",
  },
  {
    question: "¿Mis documentos están seguros?",
    answer:
      "Sí, utilizamos encriptación SSL para todas las transferencias de archivos. Los documentos se procesan de manera segura y se eliminan automáticamente de nuestros servidores después de 24 horas.",
  },
  {
    question: "¿Cuánto tiempo tarda la conversión?",
    answer:
      "La mayoría de los documentos se procesan en menos de 30 segundos. Archivos más grandes o con muchas páginas pueden tomar hasta 2 minutos.",
  },
];

const FAQ = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
      <main className="flex-1 py-12">
        <div className="container max-w-3xl">
          <div className="text-center mb-12">
            <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Preguntas Frecuentes
            </h1>
            <p className="text-lg text-muted-foreground">
              Encuentra respuestas a las preguntas más comunes sobre DocuVUCEM
            </p>
          </div>

          <Accordion type="single" collapsible className="w-full">
            {faqs.map((faq, index) => (
              <AccordionItem key={index} value={`item-${index}`}>
                <AccordionTrigger className="text-left text-foreground hover:text-primary">
                  {faq.question}
                </AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {faq.answer}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          <div className="mt-12 p-6 rounded-xl bg-primary/5 border border-primary/20 text-center">
            <h3 className="text-lg font-semibold text-foreground mb-2">
              ¿Tienes más preguntas?
            </h3>
            <p className="text-muted-foreground">
              Contáctanos a{" "}
              <a
                href="mailto:soporte@docuvucem.com"
                className="text-primary hover:underline"
              >
                soporte@docuvucem.com
              </a>
            </p>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
};

export default FAQ;
