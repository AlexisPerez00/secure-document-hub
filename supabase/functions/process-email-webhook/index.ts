import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailWebhookPayload {
  from: string;
  to: string;
  subject: string;
  attachments: Array<{
    filename: string;
    content_type: string;
    size: number;
    data: string; // base64 encoded
  }>;
}

serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const payload: EmailWebhookPayload = await req.json();
    
    console.log(`Processing email from: ${payload.from}`);
    console.log(`To inbox: ${payload.to}`);
    console.log(`Attachments count: ${payload.attachments?.length || 0}`);

    // Extract user ID from inbox email (format: inbox-{userId8chars}@docuvucem.app)
    const inboxMatch = payload.to.match(/inbox-([a-f0-9]{8})@/i);
    if (!inboxMatch) {
      console.error("Invalid inbox email format:", payload.to);
      return new Response(
        JSON.stringify({ error: "Invalid inbox email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userIdPrefix = inboxMatch[1];
    
    // Find user by ID prefix
    const { data: profiles, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("user_id")
      .limit(100);

    if (profileError) {
      console.error("Error fetching profiles:", profileError);
      throw profileError;
    }

    const matchingUser = profiles?.find(p => p.user_id.startsWith(userIdPrefix));
    if (!matchingUser) {
      console.error("User not found for inbox:", userIdPrefix);
      return new Response(
        JSON.stringify({ error: "User not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = matchingUser.user_id;
    const senderEmail = payload.from.toLowerCase();

    // Check if sender is authorized
    const { data: emailConfig, error: configError } = await supabaseAdmin
      .from("email_configurations")
      .select("*")
      .eq("user_id", userId)
      .eq("email_address", senderEmail)
      .eq("is_active", true)
      .single();

    if (configError || !emailConfig) {
      console.log(`Sender ${senderEmail} not authorized for user ${userId}`);
      return new Response(
        JSON.stringify({ error: "Sender not authorized", sender: senderEmail }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Process each attachment
    const processedDocs: string[] = [];
    const allowedTypes = [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/webp"
    ];

    for (const attachment of payload.attachments || []) {
      if (!allowedTypes.includes(attachment.content_type)) {
        console.log(`Skipping unsupported file type: ${attachment.content_type}`);
        continue;
      }

      if (attachment.size > 50 * 1024 * 1024) { // 50MB limit
        console.log(`Skipping file too large: ${attachment.size} bytes`);
        continue;
      }

      // Determine file type category
      let fileType = "other";
      if (attachment.content_type === "application/pdf") {
        fileType = "pdf";
      } else if (attachment.content_type.includes("word")) {
        fileType = "word";
      } else if (attachment.content_type.includes("excel") || attachment.content_type.includes("spreadsheet")) {
        fileType = "excel";
      } else if (attachment.content_type.startsWith("image/")) {
        fileType = "image";
      }

      // Create document record
      const { data: doc, error: docError } = await supabaseAdmin
        .from("documents")
        .insert({
          user_id: userId,
          original_filename: attachment.filename,
          file_type: fileType,
          file_size: attachment.size,
          status: "pending",
          source: "email",
          source_email: senderEmail
        })
        .select()
        .single();

      if (docError) {
        console.error("Error creating document record:", docError);
        continue;
      }

      // Upload file to storage
      const storagePath = `${userId}/original/${doc.id}/${attachment.filename}`;
      const fileBuffer = Uint8Array.from(atob(attachment.data), c => c.charCodeAt(0));
      
      const { error: uploadError } = await supabaseAdmin.storage
        .from("documents")
        .upload(storagePath, fileBuffer, {
          contentType: attachment.content_type
        });

      if (uploadError) {
        console.error("Error uploading file:", uploadError);
        await supabaseAdmin.from("documents").delete().eq("id", doc.id);
        continue;
      }

      // Update document with storage path
      await supabaseAdmin
        .from("documents")
        .update({ storage_path: storagePath })
        .eq("id", doc.id);

      processedDocs.push(doc.id);
      console.log(`Document ${doc.id} created from email attachment: ${attachment.filename}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${processedDocs.length} attachments`,
        documentIds: processedDocs
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("Error processing email webhook:", error);
    
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
