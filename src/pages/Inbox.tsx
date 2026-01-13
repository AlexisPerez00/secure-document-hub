import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
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
  Loader2,
  RefreshCw,
  FileSpreadsheet,
  FileImage,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Document {
  _id: string;
  originalName: string;
  storedName: string;
  mimetype: string;
  source: string;
  size: number;
  status: "pending" | "completed" | "error";
  createdAt: string;
  downloadUrl: string;
}

const API_URL = "http://localhost:3001";

const Inbox = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState("");
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  // ✅ ESTADOS PARA PAGINACIÓN
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  useEffect(() => {
    if (!authLoading && !user) {
      // navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/documents`);
      if (!response.ok) throw new Error("Error al cargar datos");

      const data = await response.json();
      setDocuments(data || []);
    } catch (error) {
      console.error(error);
      toast({
        title: "Error de conexión",
        description: "No se pudo conectar con el servidor.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const deleteDocument = async (id: string) => {
    if (!confirm("¿Estás seguro de eliminar este archivo permanentemente?"))
      return;

    try {
      const response = await fetch(`${API_URL}/api/documents/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Fallo al eliminar");

      toast({
        title: "Eliminado",
        description: "El documento ha sido eliminado.",
      });
      fetchDocuments();
    } catch (error) {
      toast({
        title: "Error",
        variant: "destructive",
      });
    }
  };

  const downloadDocument = (downloadUrl: string) => {
    if (!downloadUrl) return;
    window.open(`${API_URL}${downloadUrl}`, "_blank");
  };

  // --- LÓGICA DE FILTRADO, ORDENAMIENTO Y PAGINACIÓN ---

  // 1. Filtrar por búsqueda
  const filteredDocuments = documents.filter((doc) =>
    doc.originalName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // 2. ✅ Ordenar: Los más recientes primero (comparando fechas)
  const sortedDocuments = filteredDocuments.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // 3. ✅ Calcular índices para paginación
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentItems = sortedDocuments.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(sortedDocuments.length / itemsPerPage);

  // 4. ✅ Funciones de cambio de página
  const goToNextPage = () =>
    setCurrentPage((prev) => Math.min(prev + 1, totalPages));
  const goToPrevPage = () => setCurrentPage((prev) => Math.max(prev - 1, 1));

  // --- FIN LÓGICA ---

  const getStatusBadge = (status: string) => {
    const variants: Record<
      string,
      {
        label: string;
        variant: "default" | "secondary" | "destructive" | "outline";
      }
    > = {
      pending: { label: "Pendiente", variant: "outline" },
      processing: { label: "Procesando", variant: "secondary" },
      completed: { label: "Listo VUCEM", variant: "default" },
      error: { label: "Error", variant: "destructive" },
    };
    const { label, variant } = variants[status] || {
      label: status,
      variant: "outline",
    };
    return <Badge variant={variant}>{label}</Badge>;
  };

  const getSourceIcon = (source: string) => {
    return source === "email" ? (
      <Mail className="h-4 w-4 text-purple-500" />
    ) : (
      <Upload className="h-4 w-4 text-blue-500" />
    );
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileIcon = (mimetype: string) => {
    if (mimetype.includes("pdf"))
      return <FileText className="h-5 w-5 text-red-500" />;
    if (mimetype.includes("sheet") || mimetype.includes("excel"))
      return <FileSpreadsheet className="h-5 w-5 text-green-600" />;
    if (mimetype.includes("image"))
      return <FileImage className="h-5 w-5 text-blue-500" />;
    return <FileText className="h-5 w-5 text-gray-500" />;
  };

  const getFileTypeLabel = (mimetype: string) => {
    if (mimetype.includes("pdf")) return "PDF";
    if (mimetype.includes("word") || mimetype.includes("officedocument"))
      return "Word";
    if (mimetype.includes("sheet") || mimetype.includes("excel"))
      return "Excel";
    if (mimetype.includes("image")) return "Imagen";
    return "Otro";
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

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
              Historial completo y gestión avanzada de archivos
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nombre..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1); // Resetear a pag 1 si buscan algo
                }}
                className="pl-10"
              />
            </div>
            <Button
              variant="outline"
              onClick={fetchDocuments}
              disabled={loading}
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`}
              />
              Actualizar Tabla
            </Button>
          </div>

          <div className="rounded-lg border border-border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12"></TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead>Peso Final</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead>Fecha</TableHead>
                  <TableHead className="text-right">Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : currentItems.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12">
                      <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">
                        No hay documentos encontrados.
                      </p>
                    </TableCell>
                  </TableRow>
                ) : (
                  currentItems.map((doc) => (
                    <TableRow key={doc._id}>
                      <TableCell>{getFileIcon(doc.mimetype)}</TableCell>
                      <TableCell className="font-medium">
                        <span
                          title={doc.originalName}
                          className="truncate max-w-[200px] block"
                        >
                          {doc.originalName}
                        </span>
                      </TableCell>
                      <TableCell>{getFileTypeLabel(doc.mimetype)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getSourceIcon(doc.source)}
                          <span className="text-sm capitalize">
                            {doc.source}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {formatFileSize(doc.size)}
                      </TableCell>
                      <TableCell>{getStatusBadge(doc.status)}</TableCell>
                      <TableCell className="text-muted-foreground text-xs">
                        {new Date(doc.createdAt).toLocaleDateString("es-MX", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Descargar PDF VUCEM"
                            disabled={doc.status !== "completed"}
                            onClick={() => downloadDocument(doc.downloadUrl)}
                          >
                            <Download
                              className={`h-4 w-4 ${
                                doc.status === "completed"
                                  ? "text-blue-600"
                                  : ""
                              }`}
                            />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => deleteDocument(doc._id)}
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

            {/* ✅ CONTROLES DE PAGINACIÓN */}
            {!loading && sortedDocuments.length > 0 && (
              <div className="flex items-center justify-between px-4 py-4 border-t border-border">
                <div className="text-sm text-muted-foreground">
                  Mostrando {indexOfFirstItem + 1} a{" "}
                  {Math.min(indexOfLastItem, sortedDocuments.length)} de{" "}
                  {sortedDocuments.length} resultados
                </div>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={goToPrevPage}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Anterior
                  </Button>
                  <div className="text-sm font-medium">
                    Página {currentPage} de {totalPages}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={goToNextPage}
                    disabled={currentPage === totalPages}
                  >
                    Siguiente
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* ... Tus Stats existentes se mantienen igual ... */}
            <div className="p-4 rounded-lg bg-muted/50 border border-border">
              <p className="text-2xl font-bold text-foreground">
                {documents.length}
              </p>
              <p className="text-sm text-muted-foreground">Total Histórico</p>
            </div>
            <div className="p-4 rounded-lg bg-green-50 border border-green-100">
              <p className="text-2xl font-bold text-green-700">
                {documents.filter((d) => d.status === "completed").length}
              </p>
              <p className="text-sm text-green-600">Listos para VUCEM</p>
            </div>
            <div className="p-4 rounded-lg bg-purple-50 border border-purple-100">
              <p className="text-2xl font-bold text-purple-700">
                {documents.filter((d) => d.source === "email").length}
              </p>
              <p className="text-sm text-purple-600">Vía Email</p>
            </div>
            <div className="p-4 rounded-lg bg-blue-50 border border-blue-100">
              <p className="text-2xl font-bold text-blue-700">
                {documents.filter((d) => d.source === "manual").length}
              </p>
              <p className="text-sm text-blue-600">Subida Manual</p>
            </div>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Inbox;
