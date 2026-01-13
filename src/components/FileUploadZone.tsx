import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload,
  FileUp,
  X,
  File,
  FileImage,
  FileSpreadsheet,
  FileText as FileTextIcon,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

interface UploadedFile {
  id: string;
  file: File;
  status: "pending" | "uploading" | "processing" | "completed" | "error";
  documentId?: string;
}

const FileUploadZone = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const acceptedTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
  ];

  const getFileIcon = (type: string) => {
    if (type.includes("image")) return FileImage;
    if (type.includes("sheet") || type.includes("excel"))
      return FileSpreadsheet;
    if (type.includes("pdf")) return FileTextIcon;
    return File;
  };

  const getFileType = (mimeType: string): string => {
    if (mimeType === "application/pdf") return "pdf";
    if (mimeType.includes("word")) return "word";
    if (mimeType.includes("excel") || mimeType.includes("spreadsheet"))
      return "excel";
    if (mimeType.startsWith("image/")) return "image";
    return "other";
  };

  const uploadFileToServer = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);

    // Usamos la URL completa del backend para evitar fallos de proxy
    const res = await fetch("http://localhost:3001/api/upload", {
      method: "POST",
      body: formData,
    });

    if (!res.ok) {
      throw new Error(`Fallo al subir: ${file.name}`);
    }

    return await res.json();
  };

  // Crear el documento en MongoDB (backend propio)
  const createDocumentRecord = async (payload: {
    originalName: string;
    mimeType: string;
    size: number;
    source: "manual";
  }) => {
    const res = await fetch("/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`Fallo al crear documento: ${err}`);
    }
    return (await res.json()) as { id: string };
  };

  // Solicitar conversión VUCEM (backend propio)
  // Puedes no implementar esto hoy y dejar el documento en "pending"
  const requestVucemConversion = async (documentId: string) => {
    const res = await fetch(`/api/convert`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      throw new Error(`Fallo al encolar conversión: ${err}`);
    }
    return await res.json();
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const validateFile = (file: File): boolean => {
    if (!acceptedTypes.includes(file.type)) {
      toast.error(`Tipo de archivo no soportado: ${file.name}`);
      return false;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error(`Archivo muy grande (máx 50MB): ${file.name}`);
      return false;
    }
    return true;
  };

  const addFiles = (files: FileList | null) => {
    if (!files) return;

    const newFiles: UploadedFile[] = [];
    Array.from(files).forEach((file) => {
      if (validateFile(file)) {
        newFiles.push({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          file,
          status: "pending",
        });
      }
    });

    if (newFiles.length > 0) {
      setUploadedFiles((prev) => [...prev, ...newFiles]);
      toast.success(`${newFiles.length} archivo(s) agregado(s)`);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(e.target.files);
    e.target.value = "";
  };

  const removeFile = (id: string) => {
    setUploadedFiles((prev) => prev.filter((f) => f.id !== id));
  };

  const handleDigitalize = async () => {
    if (!user) {
      toast.error("Debes iniciar sesión para digitalizar documentos");
      navigate("/auth");
      return;
    }

    if (uploadedFiles.length === 0) {
      toast.error("Por favor, selecciona al menos un archivo");
      return;
    }

    const pendingFiles = uploadedFiles.filter(
      (f) => f.status === "pending" || f.status === "error"
    );
    if (pendingFiles.length === 0) {
      toast.info("Todos los archivos ya fueron procesados.");
      return;
    }

    setIsProcessing(true);

    for (const uploadedFile of uploadedFiles) {
      if (
        uploadedFile.status === "completed" ||
        uploadedFile.status === "uploading"
      ) {
        continue;
      }
      try {
        // Marcamos como "subiendo"
        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.id === uploadedFile.id ? { ...f, status: "uploading" } : f
          )
        );

        // --- UN SOLO PASO: SUBIDA Y REGISTRO ---
        const uploadResp = await uploadFileToServer(uploadedFile.file);

        // Si llegó aquí, el backend ya lo guardó en Mongo y generó el PDF VUCEM
        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.id === uploadedFile.id ? { ...f, status: "completed" } : f
          )
        );
      } catch (error) {
        console.error("Error crítico:", error);
        setUploadedFiles((prev) =>
          prev.map((f) =>
            f.id === uploadedFile.id ? { ...f, status: "error" } : f
          )
        );
        toast.error(`Error al procesar: ${uploadedFile.file.name}`);
      }
    }

    setIsProcessing(false);
    toast.success("Proceso finalizado");
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-xl p-12 transition-all duration-300 ${
          isDragging
            ? "border-primary bg-primary/10 scale-[1.02]"
            : "border-border bg-muted/30 hover:border-primary/50 hover:bg-muted/50"
        }`}
      >
        <input
          type="file"
          multiple
          accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.webp"
          onChange={handleFileInput}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />

        <div className="flex flex-col items-center justify-center gap-4 pointer-events-none">
          <div
            className={`p-4 rounded-full transition-colors ${
              isDragging ? "bg-primary/20" : "bg-muted"
            }`}
          >
            <Upload
              className={`h-12 w-12 transition-colors ${
                isDragging ? "text-primary" : "text-muted-foreground"
              }`}
            />
          </div>

          <div className="text-center">
            <p className="text-lg font-medium text-foreground">
              Elija un archivo PDF, Word, Excel o imagen
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Arrastra y suelta o haz clic para seleccionar
            </p>
          </div>
        </div>
      </div>

      {/* File List */}
      {uploadedFiles.length > 0 && (
        <div className="mt-6 space-y-3">
          <h3 className="text-sm font-medium text-foreground">
            Archivos seleccionados ({uploadedFiles.length})
          </h3>

          <div className="space-y-2">
            {uploadedFiles.map((uploadedFile) => {
              const Icon = getFileIcon(uploadedFile.file.type);
              return (
                <div
                  key={uploadedFile.id}
                  className="flex items-center gap-3 p-3 rounded-lg bg-card border border-border"
                >
                  <Icon className="h-5 w-5 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {uploadedFile.file.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(uploadedFile.file.size)}
                    </p>
                  </div>

                  {(uploadedFile.status === "uploading" ||
                    uploadedFile.status === "processing") && (
                    <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  )}

                  {uploadedFile.status === "completed" && (
                    <span className="text-xs text-primary font-medium">
                      ✓ Listo
                    </span>
                  )}

                  {uploadedFile.status === "error" && (
                    <span className="text-xs text-destructive font-medium">
                      ✕ Error
                    </span>
                  )}

                  {uploadedFile.status === "pending" && (
                    <button
                      onClick={() => removeFile(uploadedFile.id)}
                      className="p-1 hover:bg-muted rounded-md transition-colors"
                    >
                      <X className="h-4 w-4 text-muted-foreground" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Digitalize Button */}
      <div className="mt-8 flex justify-center">
        <Button
          size="lg"
          onClick={handleDigitalize}
          disabled={uploadedFiles.length === 0 || isProcessing}
          className="px-12 py-6 text-lg font-semibold"
        >
          {isProcessing ? (
            <>
              <Loader2 className="mr-2 h-5 w-5 animate-spin" />
              Procesando...
            </>
          ) : (
            <>
              <FileUp className="mr-2 h-5 w-5" />
              Digitalizar
            </>
          )}
        </Button>
      </div>

      {!user && (
        <p className="text-center text-sm text-muted-foreground mt-4">
          <button
            onClick={() => navigate("/auth")}
            className="text-primary hover:underline"
          >
            Inicia sesión
          </button>{" "}
          para guardar tus documentos
        </p>
      )}
    </div>
  );
};

export default FileUploadZone;
