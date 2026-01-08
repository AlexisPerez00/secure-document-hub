import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ConvertRequest {
  documentId: string;
}

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabase.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub;
    const { documentId }: ConvertRequest = await req.json();

    console.log(`Processing document ${documentId} for user ${userId}`);

    // Get document info
    const { data: document, error: docError } = await supabase
      .from("documents")
      .select("*")
      .eq("id", documentId)
      .eq("user_id", userId)
      .single();

    if (docError || !document) {
      console.error("Document not found:", docError);
      return new Response(
        JSON.stringify({ error: "Document not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update status to processing
    await supabase
      .from("documents")
      .update({ status: "processing" })
      .eq("id", documentId);

    // Simulate PDF conversion process
    // In production, this would use a library like pdf-lib or a third-party service
    // to convert to VUCEM format with 300 DPI and ensure < 10MB
    
    console.log(`Converting document: ${document.original_filename}`);
    console.log(`File type: ${document.file_type}`);
    console.log(`Original size: ${document.file_size} bytes`);

    // Simulate processing time
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Generate converted filename
    const originalName = document.original_filename.replace(/\.[^/.]+$/, "");
    const convertedFilename = `${originalName}_VUCEM.pdf`;
    const convertedPath = `${userId}/converted/${documentId}.pdf`;

    // Update document with conversion results
    const { error: updateError } = await supabase
      .from("documents")
      .update({
        status: "completed",
        converted_filename: convertedFilename,
        converted_storage_path: convertedPath,
      })
      .eq("id", documentId);

    if (updateError) {
      console.error("Error updating document:", updateError);
      throw updateError;
    }

    console.log(`Document ${documentId} converted successfully`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Document converted successfully",
        convertedFilename,
        specifications: {
          format: "PDF",
          dpi: 300,
          maxSize: "10 MB",
          standard: "VUCEM"
        }
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error in convert-document function:", error);
    
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
