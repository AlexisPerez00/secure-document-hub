import { useState } from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import {
  Search,
  Download,
  Trash2,
  FileText,
  Mail,
  Upload,
  Eye,
} from "lucide-react";

interface Document {
  id: string;
  name: string;
  originalType: string;
  source: "email" | "manual";
  size: string;
  status: "pending" | "processing" | "completed" | "error";
  createdAt: string;
}

// Mock data for demonstration
const mockDocuments: Document[] = [
  {
    id: "1",
    name: "Factura_2024_001.pdf",
    originalType: "PDF",
    source: "email",
    size: "2.4 MB",
    status: "completed",
    createdAt: "2024-01-08 10:30",
  },
  {
    id: "2",
    name: "Contrato_Servicio.docx",
    originalType: "Word",
    source: "manual",
    size: "1.8 MB",
    status: "completed",
    createdAt: "2024-01-08 09:15",
  },
  {
    id: "3",
    name: "Inventario_Q4.xlsx",
    originalType: "Excel",
    source: "email",
    size: "4.2 MB",
    status: "processing",
    createdAt: "2024-01-08 08:45",
  },
  {
    id: "4",
    name: "Comprobante_Pago.png",
    originalType: "Imagen",
    source: "email",
    size: "3.1 MB",
    status: "pending",
    createdAt: "2024-01-07 16:20",
  },
];

const Inbox = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [documents] = useState<Document[]>(mockDocuments);

  const filteredDocuments = documents.filter((doc) =>
    doc.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadge = (status: Document["status"]) => {
    const variants: Record<Document["status"], { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      pending: { label: "Pendiente", variant: "outline" },
      processing: { label: "Procesando", variant: "secondary" },
      completed: { label: "Completado", variant: "default" },
      error: { label: "Error", variant: "destructive" },
    };
    
    const { label, variant } = variants[status];
    return <Badge variant={variant}>{label}</Badge>;
  };

  const getSourceIcon = (source: Document["source"]) => {
    return source === "email" ? (
      <Mail className="h-4 w-4 text-muted-foreground" />
    ) : (
      <Upload className="h-4 w-4 text-muted-foreground" />
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
      <main className="flex-1 py-8">
        <div className="container">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-foreground mb-2">
              Bandeja de Documentos
            </h1>
            <p className="text-muted-foreground">
              Gestiona todos los documentos recibidos por correo o subidos manualmente
            </p>
          </div>

          {/* Search and Actions */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar documentos..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>

          {/* Documents Table */}
          <div className="rounded-lg border border-border bg-card">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Tipo Original</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead>Tamaño</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDocuments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12">
                      <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">
                        No hay documentos para mostrar
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredDocuments.map((doc) => (
                    <TableRow key={doc.id}>
                      <TableCell>
                        <FileText className="h-5 w-5 text-primary" />
                      </TableCell>
                      <TableCell className="font-medium">{doc.name}</TableCell>
                      <TableCell>{doc.originalType}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getSourceIcon(doc.source)}
                          <span className="text-sm">
                            {doc.source === "email" ? "Correo" : "Manual"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{doc.size}</TableCell>
                      <TableCell>{getStatusBadge(doc.status)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {doc.createdAt}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button variant="ghost" size="icon" title="Ver">
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Descargar"
                            disabled={doc.status !== "completed"}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Eliminar"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {/* Stats */}
          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-lg bg-muted/50 border border-border">
              <p className="text-2xl font-bold text-foreground">
                {documents.length}
              </p>
              <p className="text-sm text-muted-foreground">Total Documentos</p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50 border border-border">
              <p className="text-2xl font-bold text-foreground">
                {documents.filter((d) => d.status === "completed").length}
              </p>
              <p className="text-sm text-muted-foreground">Completados</p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50 border border-border">
              <p className="text-2xl font-bold text-foreground">
                {documents.filter((d) => d.source === "email").length}
              </p>
              <p className="text-sm text-muted-foreground">Por Correo</p>
            </div>
            <div className="p-4 rounded-lg bg-muted/50 border border-border">
              <p className="text-2xl font-bold text-foreground">
                {documents.filter((d) => d.status === "pending").length}
              </p>
              <p className="text-sm text-muted-foreground">Pendientes</p>
            </div>
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
};

export default Inbox;
