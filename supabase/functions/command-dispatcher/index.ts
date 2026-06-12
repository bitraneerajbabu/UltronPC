// Supabase Edge Function for Dispatching Remote Admin Commands
// TODO: Append commands to the pipeline queue and alert listener nodes.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  return new Response(JSON.stringify({ status: "success", message: "Command sent" }), {
    headers: { "Content-Type": "application/json" },
  })
})\n