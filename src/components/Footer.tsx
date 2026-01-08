import { FileText } from "lucide-react";

const Footer = () => {
  return (
    <footer className="border-t border-border bg-muted/30 py-8">
      <div className="container">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            <span className="font-semibold text-foreground">DocuVUCEM</span>
          </div>
          
          <p className="text-sm text-muted-foreground text-center">
            Convierte tus documentos al formato VUCEM de manera rápida y segura
          </p>
          
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} DocuVUCEM
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
