import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Mail, Plus, Trash2, Loader2, Copy, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { z } from 'zod';

const emailSchema = z.string().email('Email inválido');

interface EmailConfig {
  id: string;
  email_address: string;
  is_active: boolean;
  created_at: string;
}

export default function EmailSettings() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();
  
  const [emailConfigs, setEmailConfigs] = useState<EmailConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [newEmail, setNewEmail] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [copied, setCopied] = useState(false);

  // Unique inbox email for this user
  const inboxEmail = user ? `inbox-${user.id.slice(0, 8)}@docuvucem.app` : '';

  useEffect(() => {
    if (!authLoading && !user) {
      navigate('/auth');
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (user) {
      fetchEmailConfigs();
    }
  }, [user]);

  const fetchEmailConfigs = async () => {
    if (!user) return;
    
    setLoading(true);
    const { data, error } = await supabase
      .from('email_configurations')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      toast({
        title: 'Error',
        description: 'No se pudieron cargar las configuraciones de email',
        variant: 'destructive'
      });
    } else {
      setEmailConfigs(data || []);
    }
    setLoading(false);
  };

  const addEmailConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      emailSchema.parse(newEmail);
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast({
          title: 'Error de validación',
          description: err.errors[0].message,
          variant: 'destructive'
        });
        return;
      }
    }

    if (!user) return;

    setIsAdding(true);
    const { error } = await supabase
      .from('email_configurations')
      .insert({
        user_id: user.id,
        email_address: newEmail.toLowerCase(),
        is_active: true
      });

    setIsAdding(false);

    if (error) {
      if (error.code === '23505') {
        toast({
          title: 'Error',
          description: 'Este email ya está configurado',
          variant: 'destructive'
        });
      } else {
        toast({
          title: 'Error',
          description: 'No se pudo agregar el email',
          variant: 'destructive'
        });
      }
    } else {
      toast({
        title: 'Email agregado',
        description: 'La configuración de email ha sido guardada'
      });
      setNewEmail('');
      fetchEmailConfigs();
    }
  };

  const toggleEmailActive = async (id: string, currentState: boolean) => {
    const { error } = await supabase
      .from('email_configurations')
      .update({ is_active: !currentState })
      .eq('id', id);

    if (error) {
      toast({
        title: 'Error',
        description: 'No se pudo actualizar el estado',
        variant: 'destructive'
      });
    } else {
      fetchEmailConfigs();
    }
  };

  const deleteEmailConfig = async (id: string) => {
    const { error } = await supabase
      .from('email_configurations')
      .delete()
      .eq('id', id);

    if (error) {
      toast({
        title: 'Error',
        description: 'No se pudo eliminar la configuración',
        variant: 'destructive'
      });
    } else {
      toast({
        title: 'Eliminado',
        description: 'La configuración de email ha sido eliminada'
      });
      fetchEmailConfigs();
    }
  };

  const copyInboxEmail = () => {
    navigator.clipboard.writeText(inboxEmail);
    setCopied(true);
    toast({
      title: 'Copiado',
      description: 'Email de bandeja copiado al portapapeles'
    });
    setTimeout(() => setCopied(false), 2000);
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
      
      <main className="flex-1 container mx-auto px-4 py-8 max-w-4xl">
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Configuración de Email</h1>
            <p className="text-muted-foreground mt-2">
              Configura los emails desde los cuales se recibirán documentos automáticamente
            </p>
          </div>

          {/* Inbox Email Card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5" />
                Tu Bandeja de Entrada
              </CardTitle>
              <CardDescription>
                Reenvía o copia (CC/BCC) tus emails con adjuntos a esta dirección para procesarlos automáticamente
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
                <code className="flex-1 text-sm font-mono text-foreground">{inboxEmail}</code>
                <Button variant="outline" size="sm" onClick={copyInboxEmail}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground mt-3">
                Los archivos adjuntos serán convertidos automáticamente a formato VUCEM (PDF 300 DPI, máx 10 MB)
              </p>
            </CardContent>
          </Card>

          {/* Authorized Senders */}
          <Card>
            <CardHeader>
              <CardTitle>Remitentes Autorizados</CardTitle>
              <CardDescription>
                Solo se procesarán documentos enviados desde estos emails autorizados
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={addEmailConfig} className="flex gap-3">
                <div className="flex-1">
                  <Label htmlFor="new-email" className="sr-only">Nuevo email</Label>
                  <Input
                    id="new-email"
                    type="email"
                    placeholder="ejemplo@empresa.com"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" disabled={isAdding}>
                  {isAdding ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <Plus className="h-4 w-4 mr-2" />
                      Agregar
                    </>
                  )}
                </Button>
              </form>

              {loading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : emailConfigs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Mail className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No hay emails configurados</p>
                  <p className="text-sm">Agrega un email para comenzar a recibir documentos</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {emailConfigs.map((config) => (
                    <div
                      key={config.id}
                      className="flex items-center justify-between p-4 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <Mail className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="font-medium text-foreground">{config.email_address}</p>
                          <p className="text-sm text-muted-foreground">
                            Agregado el {new Date(config.created_at).toLocaleDateString('es-MX')}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <Badge variant={config.is_active ? 'default' : 'secondary'}>
                          {config.is_active ? 'Activo' : 'Inactivo'}
                        </Badge>
                        <Switch
                          checked={config.is_active}
                          onCheckedChange={() => toggleEmailActive(config.id, config.is_active)}
                        />
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteEmailConfig(config.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
}
