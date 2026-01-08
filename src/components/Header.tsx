import { Link, useLocation } from "react-router-dom";
import { FileText, Mail, Upload, HelpCircle } from "lucide-react";

const Header = () => {
  const location = useLocation();

  const navLinks = [
    { to: "/", label: "Digitalizador", icon: Upload },
    { to: "/inbox", label: "Bandeja", icon: Mail },
    { to: "/faq", label: "FAQs", icon: HelpCircle },
  ];

  return (
    <header className="sticky top-0 z-50 w-full border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <FileText className="h-8 w-8 text-primary" />
          <span className="text-xl font-bold text-foreground">DocuVUCEM</span>
        </Link>
        
        <nav className="flex items-center gap-6">
          {navLinks.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={`flex items-center gap-2 text-sm font-medium transition-colors hover:text-primary ${
                location.pathname === to
                  ? "text-primary"
                  : "text-muted-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
};

export default Header;
