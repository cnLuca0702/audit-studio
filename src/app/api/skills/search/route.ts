import { NextResponse } from "next/server";

interface SearchBody {
  query: string;
}

interface NpmSearchResult {
  package: {
    name: string;
    version: string;
    description?: string;
    links?: { npm?: string; repository?: string };
  };
}

// POST /api/skills/search — search npm registry for skill packages
export async function POST(req: Request) {
  try {
    const { query } = (await req.json()) as SearchBody;

    if (!query) {
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    }

    // Search npm for packages with "pi-skill" or "pi-agent-skill" keyword
    const searchQuery = encodeURIComponent(`${query} keywords:pi-skill,pi-agent-skill`);
    const res = await fetch(
      `https://registry.npmjs.org/-/v1/text/search?size=20&text=${searchQuery}`,
      { signal: AbortSignal.timeout(10_000) }
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: `npm search failed: ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    const results = (data.objects ?? []).map((obj: NpmSearchResult) => ({
      name: obj.package.name,
      version: obj.package.version,
      description: obj.package.description ?? "",
      npmUrl: obj.package.links?.npm,
      repoUrl: obj.package.links?.repository,
    }));

    return NextResponse.json({ results });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message ?? String(error) },
      { status: 500 }
    );
  }
}
