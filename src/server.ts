import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { splitMountedPath } from "./lib/public-path";

const STATIC_PATH_PREFIXES = ["/assets/", "/images/"];
const STATIC_PATHS = new Set(["/favicon.ico", "/logo.svg"]);
const ENCODING_EXTENSIONS: Record<string, string> = {
  br: ".br",
  gzip: ".gz",
  zstd: ".zst",
};

const CONTENT_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
};

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isStaticPath(pathname: string) {
  return STATIC_PATHS.has(pathname) || STATIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function getAcceptedEncodingExtensions(request: Request) {
  const accepted = request.headers.get("accept-encoding") ?? "";
  return [
    ...accepted
      .split(",")
      .map((encoding) => ENCODING_EXTENSIONS[encoding.trim()])
      .filter((extension): extension is string => Boolean(extension)),
    "",
  ];
}

function isInsideDirectory(pathModule: typeof import("node:path"), parentDir: string, childPath: string) {
  const relativePath = pathModule.relative(parentDir, childPath);
  return Boolean(relativePath) && !relativePath.startsWith("..") && !pathModule.isAbsolute(relativePath);
}

async function getPrefixedPublicAssetResponse(request: Request) {
  if (request.method !== "GET" && request.method !== "HEAD") return undefined;

  const url = new URL(request.url);
  const { publicPathPrefix, internalPathname } = splitMountedPath(url.pathname);
  if (!publicPathPrefix || !isStaticPath(internalPathname)) return undefined;

  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const { fileURLToPath } = await import("node:url");

  const nitroMain = (globalThis as typeof globalThis & { __nitro_main__?: string }).__nitro_main__;
  const serverDir = path.dirname(fileURLToPath(nitroMain ?? import.meta.url));
  const publicDir = path.resolve(serverDir, "../public");

  let assetId = decodeURIComponent(internalPathname);
  let filePath = path.resolve(publicDir, `.${assetId}`);
  for (const extension of getAcceptedEncodingExtensions(request)) {
    const encodedAssetId = `${internalPathname}${extension}`;
    const encodedFilePath = path.resolve(publicDir, `.${decodeURIComponent(encodedAssetId)}`);
    if (!isInsideDirectory(path, publicDir, encodedFilePath)) continue;
    try {
      const encodedStat = await fs.stat(encodedFilePath);
      if (encodedStat.isFile()) {
        assetId = encodedAssetId;
        filePath = encodedFilePath;
      }
      break;
    } catch {
      // Try the next accepted encoding.
    }
  }

  if (!isInsideDirectory(path, publicDir, filePath)) return undefined;

  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    return undefined;
  }
  if (!stat.isFile()) return undefined;

  const headers = new Headers();
  const ext = path.extname(assetId.replace(/\.(br|gz|zst)$/, ""));
  const contentType = CONTENT_TYPES[ext.toLowerCase()];
  if (contentType) headers.set("content-type", contentType);
  headers.set("content-length", stat.size.toString());
  if (assetId.startsWith("/assets/")) {
    headers.set("cache-control", "public, max-age=31536000, immutable");
  }
  if (assetId.endsWith(".br")) headers.set("content-encoding", "br");
  if (assetId.endsWith(".gz")) headers.set("content-encoding", "gzip");
  if (assetId.endsWith(".zst")) headers.set("content-encoding", "zstd");

  headers.set("last-modified", stat.mtime.toUTCString());
  const etag = `"${stat.size.toString(16)}-${Number(stat.mtimeMs).toString(16)}"`;
  headers.set("etag", etag);

  if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
  const ifModifiedSince = request.headers.get("if-modified-since");
  if (ifModifiedSince && new Date(ifModifiedSince) >= stat.mtime) {
    return new Response(null, { status: 304, headers });
  }

  headers.append("vary", "accept-encoding");
  return new Response(request.method === "HEAD" ? null : await fs.readFile(filePath), { headers });
}

async function prefixHtmlPublicAssetPaths(response: Response, request: Request) {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return response;

  const { publicPathPrefix } = splitMountedPath(new URL(request.url).pathname);
  if (!publicPathPrefix) return response;

  const html = await response.text();
  const prefixedHtml = html
    .replace(/(["'=])\/(assets|images)\//g, `$1${publicPathPrefix}/$2/`)
    .replace(/(["'=])\/(favicon\.ico|logo\.svg)(?=["'?#\s/>])/g, `$1${publicPathPrefix}/$2`);

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(prefixedHtml, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      const publicAssetResponse = await getPrefixedPublicAssetResponse(request);
      if (publicAssetResponse) return publicAssetResponse;

      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      const normalizedResponse = await normalizeCatastrophicSsrResponse(response);
      return await prefixHtmlPublicAssetPaths(normalizedResponse, request);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
