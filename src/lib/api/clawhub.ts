// ClawHub 公开列表查询（wry-manatee-359）
const CLAWHUB_URL = "https://wry-manatee-359.convex.cloud";
const CLAWHUB_SITE_URL = "https://wry-manatee-359.convex.site";
// 局域网仓库 + 发布服务（wry-salmon-294）
const CONVEX_URL = "https://wry-salmon-294.convex.cloud";

export interface ClawHubSkill {
  _id: string;
  slug: string;
  displayName: string;
  description?: string;
  latestVersion?: string;
  installs?: number;
  ownerHandle?: string;
  tags?: string[];
  repoOwner?: string;
  repoName?: string;
  repoBranch?: string;
  readmeUrl?: string;
}

export interface ClawHubSearchResult {
  skills: ClawHubSkill[];
  cursor?: string;
  isDone: boolean;
}

async function clawHubQuery(functionName: string, args: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${CLAWHUB_URL}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: functionName, format: "convex_encoded_json", args: [args] }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    throw new Error(`ClawHub query failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { status: string; value?: unknown; errorMessage?: string };
  if (data.status !== "success") {
    throw new Error(data.errorMessage ?? "ClawHub query error");
  }
  return data.value;
}

function normalizeSkill(raw: Record<string, unknown>): ClawHubSkill {
  // API returns a wrapper: { skill: {...}, owner: {...}, ownerHandle, latestVersion }
  const skill = (raw.skill ?? raw) as Record<string, unknown>;
  const latestVersion = raw.latestVersion as Record<string, unknown> | undefined;
  const slug = String(skill.slug ?? "");
  const ownerHandle = String(raw.ownerHandle ?? skill.ownerHandle ?? "").trim() || undefined;
  const stats = skill.stats as Record<string, unknown> | undefined;
  const installs = typeof stats?.downloads === "number"
    ? stats.downloads
    : typeof stats?.installsCurrent === "number"
      ? stats.installsCurrent
      : typeof stats?.installsAllTime === "number"
        ? stats.installsAllTime
        : undefined;
  return {
    _id: String(skill._id ?? ""),
    slug,
    displayName: String(skill.displayName ?? slug),
    description: skill.summary ? String(skill.summary) : (skill.description ? String(skill.description) : undefined),
    latestVersion: latestVersion?.version ? String(latestVersion.version) : undefined,
    installs: typeof installs === "number" ? installs : undefined,
    ownerHandle,
    tags: Array.isArray(skill.tags) ? Object.keys(skill.tags as object) : undefined,
    repoOwner: ownerHandle,
    repoName: slug,
    repoBranch: "main",
    readmeUrl: `https://clawhub.ai/skills/${slug}`,
  };
}

async function localQuery(functionName: string, args: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(`${CONVEX_URL}/api/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: functionName, format: "convex_encoded_json", args: [args] }),
  });
  if (!res.ok) {
    throw new Error(`Local repo query failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { status: string; value?: unknown; errorMessage?: string };
  if (data.status !== "success") {
    throw new Error(data.errorMessage ?? "Local repo query error");
  }
  return data.value;
}

const LOCAL_SITE_URL = "https://wry-salmon-294.convex.site";

async function siteSearch(baseUrl: string, query: string, limit = 25): Promise<ClawHubSearchResult> {
  const url = new URL(`${baseUrl}/api/v1/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", String(limit));
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`Search failed: ${res.status} ${res.statusText}`);
  const data = await res.json() as { results?: Array<{ slug: string; displayName: string; summary?: string; version?: string | null; ownerHandle?: string }> };
  const skills: ClawHubSkill[] = (data.results ?? []).map((r) => ({
    _id: r.slug,
    slug: r.slug,
    displayName: r.displayName || r.slug,
    description: r.summary,
    latestVersion: r.version ?? undefined,
    ownerHandle: r.ownerHandle,
    repoOwner: r.ownerHandle,
    repoName: r.slug,
    repoBranch: "main",
    readmeUrl: `https://clawhub.ai/skills/${r.slug}`,
  }));
  return { skills, isDone: true };
}

export const localRepoApi = {
  async listPublic(opts: { cursor?: string; numItems?: number; sort?: string } = {}): Promise<ClawHubSearchResult> {
    const args: Record<string, unknown> = {
      numItems: opts.numItems ?? 25,
      sort: opts.sort ?? "downloads",
      dir: "desc",
      highlightedOnly: false,
    };
    if (opts.cursor) args.cursor = opts.cursor;
    const raw = await localQuery("skills:listPublicPageV4", args) as { page?: unknown[]; nextCursor?: string; hasMore?: boolean };
    const page = Array.isArray(raw?.page) ? raw.page : [];
    return {
      skills: page.map((s) => normalizeSkill(s as Record<string, unknown>)),
      cursor: raw?.nextCursor ?? undefined,
      isDone: !(raw?.hasMore ?? false),
    };
  },

  async search(query: string, limit = 25): Promise<ClawHubSearchResult> {
    return siteSearch(LOCAL_SITE_URL, query, limit);
  },
};

export const clawHubApi = {
  async listPublic(opts: { cursor?: string; numItems?: number; sort?: string } = {}): Promise<ClawHubSearchResult> {
    const args: Record<string, unknown> = {
      numItems: opts.numItems ?? 25,
      sort: opts.sort ?? "downloads",
      dir: "desc",
      highlightedOnly: false,
    };
    if (opts.cursor) args.cursor = opts.cursor;

    const raw = await clawHubQuery("skills:listPublicPageV4", args) as { page?: unknown[]; nextCursor?: string; hasMore?: boolean };
    const page = Array.isArray(raw?.page) ? raw.page : [];
    return {
      skills: page.map((s) => normalizeSkill(s as Record<string, unknown>)),
      cursor: raw?.nextCursor ?? undefined,
      isDone: !(raw?.hasMore ?? false),
    };
  },

  async search(query: string, limit = 25): Promise<ClawHubSearchResult> {
    return siteSearch(CLAWHUB_SITE_URL, query, limit);
  },

  async getBySlug(slug: string): Promise<ClawHubSkill | null> {
    const raw = await clawHubQuery("skills:getBySlug", { slug }) as Record<string, unknown> | null;
    return raw ? normalizeSkill(raw) : null;
  },

  async publish(opts: {
    token: string;
    slug: string;
    displayName: string;
    version: string;
    changelog: string;
    files: Array<{ path: string; contentBase64: string; contentType: string }>;
    tags?: string[];
  }): Promise<{ skillId: string; versionId: string }> {
    const form = new FormData();
    form.append("payload", JSON.stringify({
      slug: opts.slug,
      displayName: opts.displayName,
      version: opts.version,
      changelog: opts.changelog,
      acceptLicenseTerms: true,
      tags: opts.tags ?? ["latest"],
    }));
    for (const f of opts.files) {
      const binary = Uint8Array.from(atob(f.contentBase64), (c) => c.charCodeAt(0));
      form.append("files", new Blob([binary], { type: f.contentType }), f.path);
    }
    const res = await fetch(`${CONVEX_URL.replace(".cloud", ".site")}/api/v1/skills`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${opts.token}` },
      body: form,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`Publish failed: ${res.status} ${text}`);
    }
    return res.json() as Promise<{ skillId: string; versionId: string }>;
  },
};
