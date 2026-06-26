import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper: Sign JWT using Web Crypto API (RS256)
async function signRS256(payload: any, privateKeyPem: string) {
  const header = { alg: "RS256", typ: "JWT" };
  const base64UrlEncode = (str: string) =>
    btoa(str)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, "");

  const textEncoder = new TextEncoder();
  const stringifiedHeader = base64UrlEncode(JSON.stringify(header));
  const stringifiedPayload = base64UrlEncode(JSON.stringify(payload));
  const dataToSign = textEncoder.encode(`${stringifiedHeader}.${stringifiedPayload}`);

  // Parse private key from PEM format
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = privateKeyPem
    .replace(pemHeader, "")
    .replace(pemFooter, "")
    .replace(/\s/g, "");
  
  const binaryDerString = atob(pemContents);
  const binaryDer = new Uint8Array(binaryDerString.length);
  for (let i = 0; i < binaryDerString.length; i++) {
    binaryDer[i] = binaryDerString.charCodeAt(i);
  }

  const key = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256",
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    dataToSign
  );

  const signatureBase64 = base64UrlEncode(
    String.fromCharCode(...new Uint8Array(signature))
  );

  return `${stringifiedHeader}.${stringifiedPayload}.${signatureBase64}`;
}

// Exchange Service Account credentials for Google OAuth2 access token
async function getAccessToken(serviceAccount: any) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now,
  };

  const assertion = await signRS256(payload, serviceAccount.private_key);

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const data = await response.json();
  if (data.error) {
    throw new Error(`Failed to get OAuth token: ${data.error_description || data.error}`);
  }
  return data.access_token;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { userId, showroomId, role, broadcast, title, body, data: customData } = await req.json();

    if (!title || !body) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: title, body" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase Client
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    let targetTokens: string[] = [];

    if (broadcast) {
      // 1. Broadcast to all active tokens
      const { data: allTokens, error: tokenError } = await supabase
        .from("user_fcm_tokens")
        .select("token");

      if (tokenError) throw new Error(`Error fetching broadcast tokens: ${tokenError.message}`);
      if (allTokens) {
        targetTokens = allTokens.map(t => t.token);
      }
    } else if (showroomId) {
      // 2. Send to all employees belonging to a specific showroom
      const { data: showroomUsers, error: userError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("showroom_id", showroomId);

      if (userError) throw new Error(`Error fetching showroom users: ${userError.message}`);
      
      if (showroomUsers && showroomUsers.length > 0) {
        const userIds = showroomUsers.map(u => u.user_id);
        const { data: tokens, error: tokenError } = await supabase
          .from("user_fcm_tokens")
          .select("token")
          .in("user_id", userIds);

        if (tokenError) throw new Error(`Error fetching showroom tokens: ${tokenError.message}`);
        if (tokens) {
          targetTokens = tokens.map(t => t.token);
        }
      }
    } else if (role) {
      // 2b. Send to all users with a specific role
      const { data: roleUsers, error: userError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", role);

      if (userError) throw new Error(`Error fetching role users: ${userError.message}`);
      
      if (roleUsers && roleUsers.length > 0) {
        const userIds = roleUsers.map(u => u.user_id);
        const { data: tokens, error: tokenError } = await supabase
          .from("user_fcm_tokens")
          .select("token")
          .in("user_id", userIds);

        if (tokenError) throw new Error(`Error fetching role tokens: ${tokenError.message}`);
        if (tokens) {
          targetTokens = tokens.map(t => t.token);
        }
      }
    } else if (userId) {
      // 3. Send to a single user
      const { data: tokens, error: tokenError } = await supabase
        .from("user_fcm_tokens")
        .select("token")
        .eq("user_id", userId);

      if (tokenError) throw new Error(`Error fetching user tokens: ${tokenError.message}`);
      if (tokens) {
        targetTokens = tokens.map(t => t.token);
      }
    } else {
      return new Response(
        JSON.stringify({ error: "Missing notification target. Specify userId, showroomId, role, or set broadcast to true." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (targetTokens.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No active device tokens found for the specified target." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get Service Account credentials from environment variables
    const serviceAccountJson = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
    if (!serviceAccountJson) {
      throw new Error("Missing FIREBASE_SERVICE_ACCOUNT environment variable.");
    }
    const serviceAccount = JSON.parse(serviceAccountJson);

    // Retrieve OAuth2 access token
    const accessToken = await getAccessToken(serviceAccount);
    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${serviceAccount.project_id}/messages:send`;

    const results = [];

    // Send push notification to all matched device tokens
    for (const token of targetTokens) {
      const payload = {
        message: {
          token,
          notification: {
            title,
            body,
          },
          data: customData ? { ...customData } : {},
        },
      };

      try {
        const response = await fetch(fcmUrl, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });

        const respData = await response.json();
        results.push({ token, success: response.ok, details: respData });
      } catch (err: any) {
        results.push({ token, success: false, error: err.message });
      }
    }

    return new Response(
      JSON.stringify({ success: true, results_count: results.length, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
