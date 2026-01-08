import Header from "@/components/Header";
import FileUploadZone from "@/components/FileUploadZone";
import FeatureCards from "@/components/FeatureCards";
import Footer from "@/components/Footer";

const Index = () => {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      
      <main className="flex-1">
        {/* Hero Section */}
        <section className="py-12 md:py-20">
          <div className="container">
            <div className="text-center mb-10">
              <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
                Digitaliza tus documentos para VUCEM
              </h1>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                Convierte PDF, Word, Excel e imágenes al formato requerido por VUCEM con 300 DPI y máximo 10 MB
              </p>
            </div>
            
            <FileUploadZone />
          </div>
        </section>
        
        <FeatureCards />
      </main>
      
      <Footer />
    </div>
  );
};

export default Index;
