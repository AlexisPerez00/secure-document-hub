import { Info, Settings, Shield } from "lucide-react";

const features = [
  {
    icon: Info,
    title: "Simple",
    description:
      "Selecciona o arrastra tu archivo, haz clic en Digitalizar, espera a que termine el proceso y descarga tu archivo.",
  },
  {
    icon: Settings,
    title: "Eficaz",
    description:
      "Se aplica todas las especificaciones técnicas requeridas a tu documento de manera automática generando un PDF compatible con VUCEM.",
  },
  {
    icon: Shield,
    title: "Seguro",
    description:
      "Aseguramos las transferencias de archivos por medio de encriptación avanzada SSL y eliminamos archivos de los servidores automáticamente.",
  },
];

const FeatureCards = () => {
  return (
    <section className="py-16 bg-background">
      <div className="container">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="flex flex-col items-start gap-4 p-6 rounded-xl bg-card border border-border hover:border-primary/30 hover:shadow-lg transition-all duration-300"
            >
              <div className="p-3 rounded-lg bg-primary/10">
                <feature.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold text-foreground">
                {feature.title}
              </h3>
              <p className="text-muted-foreground leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default FeatureCards;
