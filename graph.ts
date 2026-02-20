import { syscall } from "@silverbulletmd/silverbullet/syscall";

export interface GraphNode {
  id: string;
  name: string;
  isCurrent: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export async function buildLocalGraph(
  currentPage: string,
): Promise<GraphData> {
  const nodeMap = new Map<string, GraphNode>();
  const edgeSet = new Set<string>();
  const edges: GraphEdge[] = [];

  // Add current page as center node
  nodeMap.set(currentPage, {
    id: currentPage,
    name: currentPage,
    isCurrent: true,
  });

  // Query outgoing links: pages linked FROM currentPage
  const outWhereExpr = await syscall(
    "lua.parseExpression",
    "l.page == targetPage",
  );
  const outlinks = await syscall("index.queryLuaObjects", "link", {
    objectVariable: "l",
    where: outWhereExpr,
  }, { targetPage: currentPage });

  for (const link of outlinks) {
    const target = link.toPage;
    if (!target || !isPageLink(target)) continue;

    if (!nodeMap.has(target)) {
      nodeMap.set(target, { id: target, name: target, isCurrent: false });
    }

    const edgeKey = `${currentPage}->${target}`;
    if (!edgeSet.has(edgeKey)) {
      edgeSet.add(edgeKey);
      edges.push({ source: currentPage, target });
    }
  }

  // Query backlinks: pages that link TO currentPage
  const backWhereExpr = await syscall(
    "lua.parseExpression",
    "l.toPage == targetPage",
  );
  const backlinks = await syscall("index.queryLuaObjects", "link", {
    objectVariable: "l",
    where: backWhereExpr,
  }, { targetPage: currentPage });

  for (const link of backlinks) {
    const source = link.page;
    if (!source || !isPageLink(source)) continue;

    if (!nodeMap.has(source)) {
      nodeMap.set(source, { id: source, name: source, isCurrent: false });
    }

    const edgeKey = `${source}->${currentPage}`;
    if (!edgeSet.has(edgeKey)) {
      edgeSet.add(edgeKey);
      edges.push({ source, target: currentPage });
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    edges,
  };
}

/** Filter out non-page links (images, URLs, attachments) */
function isPageLink(name: string): boolean {
  // Skip external URLs
  if (name.startsWith("http://") || name.startsWith("https://")) return false;
  // Skip attachment-like paths with file extensions for media
  if (/\.(png|jpg|jpeg|gif|svg|webp|pdf|mp3|wav|ogg|mp4)$/i.test(name)) {
    return false;
  }
  return true;
}
