import { useState, useCallback } from "react";
import { Upload, FileUp, X, File, FileImage, FileSpreadsheet, FileText as FileTextIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface UploadedFile {
  id: string;
  file: File;
  status: "pending" | "processing" | "completed" | "error";
}

const FileUploadZone = () => {
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
    if (type.includes("sheet") || type.includes("excel")) return FileSpreadsheet;
    if (type.includes("pdf")) return FileTextIcon;
    return File;
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
    if (uploadedFiles.length === 0) {
      toast.error("Por favor, selecciona al menos un archivo");
      return;
    }

    setIsProcessing(true);
    
    // Simulate processing - in real app, this would call the backend
    setUploadedFiles((prev) =>
      prev.map((f) => ({ ...f, status: "processing" as const }))
    );

    await new Promise((resolve) => setTimeout(resolve, 2000));

    setUploadedFiles((prev) =>
      prev.map((f) => ({ ...f, status: "completed" as const }))
    );

    toast.success("¡Documentos procesados exitosamente!");
    setIsProcessing(false);
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
          <div className={`p-4 rounded-full transition-colors ${
            isDragging ? "bg-primary/20" : "bg-muted"
          }`}>
            <Upload className={`h-12 w-12 transition-colors ${
              isDragging ? "text-primary" : "text-muted-foreground"
            }`} />
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
                  
                  {uploadedFile.status === "processing" && (
                    <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  )}
                  
                  {uploadedFile.status === "completed" && (
                    <span className="text-xs text-primary font-medium">✓ Listo</span>
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
          <FileUp className="mr-2 h-5 w-5" />
          {isProcessing ? "Procesando..." : "Digitalizar"}
        </Button>
      </div>
    </div>
  );
};

export default FileUploadZone;
