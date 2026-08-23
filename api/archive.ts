import { get } from "@vercel/blob";
import { timingSafeEqual } from "node:crypto";

function authorized(request: Request): boolean {
  const expected = process.env.CISIGNAL_ARCHIVE_TOKEN;
  const actual = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!expected || !actual) return false;
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(actual);
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405, headers: { Allow: "GET" } });
    if (!authorized(request)) return Response.json({ error: "Unauthorized" }, { status: 401 });
    const pathname = new URL(request.url).searchParams.get("pathname");
    if (!pathname?.startsWith("cisignal/")) return Response.json({ error: "A CISignal archive pathname is required" }, { status: 400 });
    const token = process.env.BLOB_READ_WRITE_TOKEN;
    if (!token) return Response.json({ error: "Private archive storage is not configured" }, { status: 503 });
    const result = await get(pathname, { access: "private", token });
    if (result?.statusCode !== 200 || !result.stream) return Response.json({ error: "Archive object not found" }, { status: 404 });
    return new Response(result.stream, {
      headers: {
        "Cache-Control": "private, no-store",
        "Content-Type": result.blob.contentType ?? "application/octet-stream",
        "Content-Disposition": result.blob.contentDisposition,
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
};
