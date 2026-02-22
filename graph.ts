import { syscall } from "@silverbulletmd/silverbullet/syscall";

export interface GraphNode {
  id: string;
  name: string;
  isCurrent: boolean;
  isOrphan: boolean;
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export async function buildFullGraph(
  currentPage: string,
  includeOrphans = false,
): Promise<GraphData> {
  const nodeMap = new Map<string, GraphNode>();
  const edgeSet = new Set<string>();
  const edges: GraphEdge[] = [];

  // Query ALL links — no where clause
  const allLinks = await syscall("index.queryLuaObjects", "link", {
    objectVariable: "l",
  }, {});

  for (const link of allLinks) {
    const source = link.page;
    const target = link.toPage;
    if (!source || !target || !isPageLink(source) || !isPageLink(target)) {
      continue;
    }
    if (isSystemPage(source) || isSystemPage(target)) continue;

    // Ensure both nodes exist
    if (!nodeMap.has(source)) {
      nodeMap.set(source, {
        id: source,
        name: source,
        isCurrent: source === currentPage,
        isOrphan: false,
      });
    }
    if (!nodeMap.has(target)) {
      nodeMap.set(target, {
        id: target,
        name: target,
        isCurrent: target === currentPage,
        isOrphan: false,
      });
    }

    // Deduplicate edges
    const edgeKey = `${source}->${target}`;
    if (!edgeSet.has(edgeKey)) {
      edgeSet.add(edgeKey);
      edges.push({ source, target });
    }
  }

  // Ensure current page is always in the graph even if it has no links
  if (!nodeMap.has(currentPage)) {
    nodeMap.set(currentPage, {
      id: currentPage,
      name: currentPage,
      isCurrent: true,
      isOrphan: false,
    });
  }

  // Add orphan pages (pages with zero links)
  if (includeOrphans) {
    const allPages = await queryAllPages();
    for (const pageName of allPages) {
      if (!nodeMap.has(pageName)) {
        nodeMap.set(pageName, {
          id: pageName,
          name: pageName,
          isCurrent: pageName === currentPage,
          isOrphan: true,
        });
      }
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    edges,
  };
}

/** Query all content pages, filtering out system pages and non-page entries */
async function queryAllPages(): Promise<Set<string>> {
  const allPages = await syscall("index.queryLuaObjects", "page", {
    objectVariable: "p",
  }, {});

  const pageNames = new Set<string>();
  for (const page of allPages) {
    const name = page.name ?? page.ref;
    if (!name || !isPageLink(name) || isSystemPage(name)) continue;
    pageNames.add(name);
  }
  return pageNames;
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
    isOrphan: false,
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
      nodeMap.set(target, { id: target, name: target, isCurrent: false, isOrphan: false });
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
      nodeMap.set(source, { id: source, name: source, isCurrent: false, isOrphan: false });
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

/** Filter out system/internal pages */
function isSystemPage(name: string): boolean {
  if (/^(PLUGS|SETTINGS|CONFIG)$/.test(name)) return true;
  if (name.startsWith("Library/")) return true;
  if (name.startsWith("_")) return true;
  return false;
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
