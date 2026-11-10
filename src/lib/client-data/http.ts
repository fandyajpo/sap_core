export type JsonRequestMethod = "GET" | "POST" | "PATCH";

export interface JsonRequestOptions {
  method?: JsonRequestMethod;
  body?: unknown;
  signal?: AbortSignal;
  fetcher?: typeof fetch;
}

export class HttpApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "HttpApiError";
    this.status = status;
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function requestJson<ResponseBody>(
  path: string,
  options: JsonRequestOptions = {},
): Promise<ResponseBody> {
  const headers = new Headers({ Accept: "application/json" });
  const hasBody = options.body !== undefined;
  if (hasBody) headers.set("Content-Type", "application/json");

  const fetcher = options.fetcher ?? globalThis.fetch;
  const response = await fetcher(path, {
    method: options.method ?? (hasBody ? "POST" : "GET"),
    credentials: "same-origin",
    cache: "no-store",
    headers,
    signal: options.signal,
    ...(hasBody ? { body: JSON.stringify(options.body) } : {}),
  });

  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch {
    if (response.ok) {
      throw new HttpApiError("The server returned an invalid JSON response.", response.status);
    }
  }

  if (!response.ok) {
    const message = isRecord(responseBody) && typeof responseBody.error === "string"
      ? responseBody.error
      : `Request failed with status ${response.status}.`;
    const code = isRecord(responseBody) && typeof responseBody.code === "string"
      ? responseBody.code
      : undefined;
    throw new HttpApiError(message, response.status, code);
  }

  return responseBody as ResponseBody;
}
