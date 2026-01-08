import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
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
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Document {
  id: string;
  original_filename: string;
  converted_filename: string | null;
  file_type: string;
  source: string;
  file_size: number;
  status: string;
  created_at: string;
  storage_path: string | null;
  converted_storage_path: string | null;
}

const Inbox = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  
  const [searchTerm, setSearchTerm] = useState("");
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchDocuments();
    }
  }, [user]);

  const fetchDocuments = async () => {
    if (!user) return;
    
    setLoading(true);
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      toast({
        title: 'Error',
        description: 'No se pudieron cargar los documentos',
        variant: 'destructive'
      });
    } else {
      setDocuments(data || []);
    }
    setLoading(false);
  };

  const deleteDocument = async (id: string, storagePath: string | null) => {
    // Delete from storage first if exists
    if (storagePath) {
      await supabase.storage.from('documents').remove([storagePath]);
    }
    
    const { error } = await supabase
      .from('documents')
      .delete()
      .eq('id', id);

    if (error) {
      toast({
        title: 'Error',
        description: 'No se pudo eliminar el documento',
        variant: 'destructive'
      });
    } else {
      toast({
        title: 'Eliminado',
        description: 'El documento ha sido eliminado'
      });
      fetchDocuments();
    }
  };

  const downloadDocument = async (storagePath: string | null, filename: string) => {
    if (!storagePath) return;
    
    const { data, error } = await supabase.storage
      .from('documents')
      .download(storagePath);

    if (error) {
      toast({
        title: 'Error',
        description: 'No se pudo descargar el documento',
        variant: 'destructive'
      });
      return;
    }

    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredDocuments = documents.filter((doc) =>
    doc.original_filename.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
      pending: { label: "Pendiente", variant: "outline" },
      processing: { label: "Procesando", variant: "secondary" },
      completed: { label: "Completado", variant: "default" },
      error: { label: "Error", variant: "destructive" },
    };
    
    const { label, variant } = variants[status] || { label: status, variant: "outline" as const };
    return <Badge variant={variant}>{label}</Badge>;
  };

  const getSourceIcon = (source: string) => {
    return source === "email" ? (
      <Mail className="h-4 w-4 text-muted-foreground" />
    ) : (
      <Upload className="h-4 w-4 text-muted-foreground" />
    );
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getFileTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      pdf: "PDF",
      word: "Word",
      excel: "Excel",
      image: "Imagen",
    };
    return labels[type] || type;
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
            <Button variant="outline" onClick={fetchDocuments} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </Button>
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
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : filteredDocuments.length === 0 ? (
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
                      <TableCell className="font-medium">
                        {doc.converted_filename || doc.original_filename}
                      </TableCell>
                      <TableCell>{getFileTypeLabel(doc.file_type)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {getSourceIcon(doc.source)}
                          <span className="text-sm">
                            {doc.source === "email" ? "Correo" : "Manual"}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>{formatFileSize(doc.file_size)}</TableCell>
                      <TableCell>{getStatusBadge(doc.status)}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(doc.created_at).toLocaleString('es-MX')}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            title="Ver"
                            disabled={!doc.storage_path}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Descargar"
                            disabled={doc.status !== "completed" || !doc.converted_storage_path}
                            onClick={() => downloadDocument(
                              doc.converted_storage_path || doc.storage_path, 
                              doc.converted_filename || doc.original_filename
                            )}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Eliminar"
                            className="text-destructive hover:text-destructive"
                            onClick={() => deleteDocument(doc.id, doc.storage_path)}
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
