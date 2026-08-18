import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const toFcmData = (value: Record<string, unknown> = {}) =>
  Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined && item !== null)
      .map(([key, item]) => [key, typeof item === "string" ? item : JSON.stringify(item)])
  );

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
    const {
      userId,
      showroomId,
      role,
      broadcast,
      title,
      body,
      category = "informational",
      priority = "normal",
      notificationType = "general",
      persistInApp = true,
      source = "manual",
      style = "standard",
      imageUrl,
      templateKey,
      variables = {},
      scheduledNotificationId,
      dedupeKey,
      data: customData,
    } = await req.json();

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

    const authHeader = req.headers.get("Authorization");
    let createdBy: string | null = null;
    if (authHeader) {
      const { data: authData } = await supabase.auth.getUser(authHeader.replace(/^Bearer\s+/i, ""));
      createdBy = authData.user?.id ?? null;
    }

    const targetType = broadcast ? "broadcast" : showroomId ? "showroom" : role ? "role" : "individual";
    const targetId = showroomId || role || userId || null;
    const targetUrl = customData?.targetUrl || "/notifications";
    const safeImageUrl = typeof imageUrl === "string" && imageUrl.startsWith("https://") ? imageUrl : null;

    // Observability is intentionally best-effort while the additive migration is rolled out.
    // Push delivery must not be blocked if an older environment has not applied it yet.
    let dispatchId: string | null = null;
    if (dedupeKey) {
      const { data: existingDispatch, error: dedupeLookupError } = await supabase
        .from("notification_dispatches")
        .select("id,status,recipient_count,device_count,success_count")
        .eq("idempotency_key", dedupeKey)
        .maybeSingle();
      // The lookup is best-effort while the migration rolls out. Once the
      // column exists, repeat login/app mounts return the original campaign.
      if (!dedupeLookupError && existingDispatch) {
        return new Response(
          JSON.stringify({
            success: true,
            deduplicated: true,
            dispatch_id: existingDispatch.id,
            status: existingDispatch.status,
            recipients_count: existingDispatch.recipient_count,
            results_count: existingDispatch.device_count,
            success_count: existingDispatch.success_count,
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }
    const { data: dispatch, error: dispatchError } = await supabase
      .from("notification_dispatches")
      .insert({
        title,
        body,
        category,
        priority,
        notification_type: notificationType,
        source,
        style,
        target_type: targetType,
        target_id: targetId,
        target_url: targetUrl,
        image_url: safeImageUrl,
        template_key: templateKey || null,
        variables,
        created_by: createdBy,
        scheduled_notification_id: scheduledNotificationId || null,
        idempotency_key: dedupeKey || null,
        status: "resolving",
      })
      .select("id")
      .maybeSingle();
    if (!dispatchError) dispatchId = dispatch?.id ?? null;
    else if (dedupeKey && dispatchError.code === "23505") {
      const { data: racedDispatch } = await supabase
        .from("notification_dispatches")
        .select("id")
        .eq("idempotency_key", dedupeKey)
        .maybeSingle();
      return new Response(
        JSON.stringify({ success: true, deduplicated: true, dispatch_id: racedDispatch?.id || null }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else console.warn("Notification dispatch log unavailable:", dispatchError.message);

    let targetUserIds: string[] = [];

    if (broadcast) {
      // Bell history must include users without a currently registered device.
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("user_id");
      if (profileError) throw new Error(`Error fetching broadcast users: ${profileError.message}`);
      targetUserIds = (profiles || []).map((profile) => profile.user_id);
    } else if (showroomId) {
      // 2. Send to all employees belonging to a specific showroom
      const { data: showroomUsers, error: userError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("showroom_id", showroomId);

      if (userError) throw new Error(`Error fetching showroom users: ${userError.message}`);
      
      targetUserIds = (showroomUsers || []).map((user) => user.user_id);
    } else if (role) {
      // 2b. Send to all users with a specific role
      const { data: roleUsers, error: userError } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", role);

      if (userError) throw new Error(`Error fetching role users: ${userError.message}`);
      
      targetUserIds = (roleUsers || []).map((user) => user.user_id);
    } else if (userId) {
      targetUserIds = [userId];
    } else {
      return new Response(
        JSON.stringify({ error: "Missing notification target. Specify userId, showroomId, role, or set broadcast to true." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    targetUserIds = [...new Set(targetUserIds.filter(Boolean))];

    if (targetUserIds.length === 0) {
      if (dispatchId) {
        await supabase.from("notification_dispatches").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", dispatchId);
      }
      return new Response(
        JSON.stringify({ success: true, dispatch_id: dispatchId, recipients_count: 0, results_count: 0, message: "No recipients found for the specified target." }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Persist once per recipient so every push is also available from the bell
    // and Notification Center. sendNotification() opts out because it already
    // writes the richer entity record before invoking this function.
    if (persistInApp) {
      const notificationRows = targetUserIds.map((targetUserId) => ({
        user_id: targetUserId,
        title,
        message: body,
        body,
        category,
        priority,
        notification_type: notificationType,
        target_url: targetUrl,
        deep_link: targetUrl,
        metadata: customData || {},
        dispatch_id: dispatchId,
        source,
        style,
        image_url: safeImageUrl,
        template_key: templateKey || null,
        variables,
        is_read: false,
      }));
      const { error: notificationError } = await supabase
        .from("notifications")
        .insert(notificationRows);
      if (notificationError) {
        throw new Error(`Error saving notification history: ${notificationError.message}`);
      }
    }

    const { data: tokenRows, error: tokenError } = await supabase
      .from("user_fcm_tokens")
      .select("id, user_id, token, device_platform")
      .in("user_id", targetUserIds);
    if (tokenError) throw new Error(`Error fetching device tokens: ${tokenError.message}`);
    const uniqueTokenRows = Array.from(
      new Map((tokenRows || []).filter((row) => row.token).map((row) => [row.token, row])).values()
    );

    if (dispatchId) {
      await supabase.from("notification_dispatches").update({
        recipient_count: targetUserIds.length,
        device_count: uniqueTokenRows.length,
        status: uniqueTokenRows.length ? "sending" : "completed",
        completed_at: uniqueTokenRows.length ? null : new Date().toISOString(),
      }).eq("id", dispatchId);
    }

    // Saving the Bell notification is still a successful delivery when the
    // recipient has not registered an Android device token yet.
    if (uniqueTokenRows.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          dispatch_id: dispatchId,
          recipients_count: targetUserIds.length,
          results_count: 0,
          message: "Saved to Notification Center; no active device tokens found.",
        }),
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
    for (const tokenRow of uniqueTokenRows) {
      let deliveryLogId: string | null = null;
      if (dispatchId) {
        const { data: deliveryLog } = await supabase
          .from("notification_delivery_logs")
          .insert({
            dispatch_id: dispatchId,
            user_id: tokenRow.user_id,
            device_token_id: tokenRow.id,
            device_platform: tokenRow.device_platform,
            status: "queued",
          })
          .select("id")
          .maybeSingle();
        deliveryLogId = deliveryLog?.id ?? null;
      }

      const richData = toFcmData({
        ...(customData || {}),
        targetUrl,
        category,
        priority,
        style,
        dispatchId,
        deliveryLogId,
        imageUrl: safeImageUrl,
      });
      const payload = {
        message: {
          token: tokenRow.token,
          notification: {
            title,
            body,
            ...(safeImageUrl ? { image: safeImageUrl } : {}),
          },
          data: richData,
          android: {
            priority: priority === "urgent" || priority === "high" ? "HIGH" : "NORMAL",
            notification: {
              channel_id: category === "critical" ? "critical-alerts" : "default",
              color: "#C21833",
              ...(safeImageUrl ? { image: safeImageUrl } : {}),
            },
          },
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
        results.push({ token_id: tokenRow.id, success: response.ok, details: respData });
        if (deliveryLogId) {
          await supabase.from("notification_delivery_logs").update({
            status: response.ok ? "sent" : "failed",
            provider_message_id: response.ok ? respData.name || null : null,
            error_message: response.ok ? null : JSON.stringify(respData),
            sent_at: response.ok ? new Date().toISOString() : null,
          }).eq("id", deliveryLogId);
        }
      } catch (err: any) {
        results.push({ token_id: tokenRow.id, success: false, error: err.message });
        if (deliveryLogId) {
          await supabase.from("notification_delivery_logs").update({
            status: "failed",
            error_message: err.message,
          }).eq("id", deliveryLogId);
        }
      }
    }

    const successCount = results.filter((result) => result.success).length;
    if (dispatchId) {
      await supabase.from("notification_dispatches").update({
        success_count: successCount,
        failure_count: results.length - successCount,
        status: successCount === 0 ? "failed" : successCount === results.length ? "completed" : "partial",
        completed_at: new Date().toISOString(),
      }).eq("id", dispatchId);
    }

    return new Response(
      JSON.stringify({ success: true, dispatch_id: dispatchId, recipients_count: targetUserIds.length, results_count: results.length, success_count: successCount, results }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
