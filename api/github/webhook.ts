import { waitUntil } from "@vercel/functions";
import { githubAppConfig, githubAppConfigured } from "../../src/github-app/config.js";
import { processGitHubEvent } from "../../src/github-app/process-event.js";
import { verifyWebhookSignature } from "../../src/github-app/signature.js";

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "GET") {
      return Response.json({
        service: "CISignal GitHub App",
        configured: githubAppConfigured(),
        storageConfigured: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
      });
    }
    if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, POST" } });
    if (!githubAppConfigured()) return Response.json({ error: "CISignal GitHub App is not configured" }, { status: 503 });

    const body = await request.text();
    const config = githubAppConfig();
    if (!verifyWebhookSignature(config.webhookSecret, body, request.headers.get("x-hub-signature-256"))) {
      return Response.json({ error: "Invalid GitHub webhook signature" }, { status: 401 });
    }
    const event = request.headers.get("x-github-event") ?? "";
    const delivery = request.headers.get("x-github-delivery") ?? "unknown";
    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      return Response.json({ error: "Invalid JSON webhook payload" }, { status: 400 });
    }

    waitUntil(processGitHubEvent(event, payload, config).then(
      (result) => console.info("CISignal webhook processed", { delivery, event, ...result }),
      (error: unknown) => console.error("CISignal webhook failed", { delivery, event, error: error instanceof Error ? error.message : String(error) }),
    ));
    return Response.json({ accepted: true, delivery, event }, { status: 202 });
  },
};
