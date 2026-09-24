const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
export const apiUrl = (path: string) => `${API_BASE}${path}`;

// Lê o corpo como JSON sem quebrar quando a API cai e o proxy devolve HTML.
export const readJson = async <T,>(response: Response): Promise<T | null> => {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
};

// Chamada autenticada com JSON; devolve os dados ou lança o erro da API.
export async function apiRequest<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      method: options.method ?? "GET",
      credentials: "include",
      headers:
        options.body === undefined
          ? undefined
          : { "Content-Type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiRequestError("Sem conexão com o servidor.", 0);
  }
  if (response.status === 204) return undefined as T;
  const data = await readJson<T & {
    error?: string;
    fields?: Record<string, string[]>;
  }>(response);
  if (!response.ok)
    throw new ApiRequestError(
      data?.error ?? "Não foi possível concluir.",
      response.status,
      data?.fields,
    );
  return data as T;
}
export class ApiRequestError extends Error {
  status: number;
  fields?: Record<string, string[]>;
  constructor(
    message: string,
    status: number,
    fields?: Record<string, string[]>,
  ) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

// Armazenamento do navegador pode estar bloqueado (aba anônima, etc.).
export const storage = {
  get<T>(key: string, fallback: T, area: "local" | "session" = "local"): T {
    try {
      const raw = (area === "local" ? localStorage : sessionStorage).getItem(
        key,
      );
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown, area: "local" | "session" = "local") {
    try {
      (area === "local" ? localStorage : sessionStorage).setItem(
        key,
        JSON.stringify(value),
      );
    } catch {
      // Sem armazenamento, o recurso só não persiste.
    }
  },
};
