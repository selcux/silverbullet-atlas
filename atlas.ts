import {
  asset,
  clientStore,
  editor,
} from "@silverbulletmd/silverbullet/syscalls";
import { buildFullGraph } from "./graph.ts";

const PLUG_NAME = "atlas";
const STORE_KEY = "atlasEnabled";
const OPTIONS_KEY = "atlasOptions";

interface AtlasOptions {
  showOrphans: boolean;
}

const defaultOptions: AtlasOptions = {
  showOrphans: false,
};

async function getOptions(): Promise<AtlasOptions> {
  const stored = await clientStore.get(OPTIONS_KEY);
  return { ...defaultOptions, ...stored };
}

export async function setOption(key: string, value: unknown) {
  const options = await getOptions();
  (options as Record<string, unknown>)[key] = value;
  await clientStore.set(OPTIONS_KEY, options);
}

export async function toggleAtlas() {
  const enabled = await clientStore.get(STORE_KEY);
  if (enabled) {
    await clientStore.set(STORE_KEY, false);
    await editor.hidePanel("rhs");
  } else {
    await clientStore.set(STORE_KEY, true);
    await renderGraph();
  }
}

export async function updateGraph() {
  const enabled = await clientStore.get(STORE_KEY);
  if (!enabled) return;

  await renderGraph();
}

export async function handleNavigate(pageName: string) {
  if (!pageName) return;
  await editor.navigate({ page: pageName });
}

async function renderGraph() {
  const currentPage = await editor.getCurrentPage();
  const options = await getOptions();
  // Always include orphan data so the panel can toggle instantly
  const graphData = await buildFullGraph(currentPage, true);
  const isDark = !!(await editor.getUiOption("darkMode"));

  // Load assets
  const [d3Js, rendererJs, css] = await Promise.all([
    asset.readAsset(PLUG_NAME, "assets/d3.min.js"),
    asset.readAsset(PLUG_NAME, "assets/atlas-render.js"),
    asset.readAsset(PLUG_NAME, "assets/atlas-style.css"),
  ]);

  const html = `
    <style>${css}</style>
    <div id="atlas-toolbar"></div>
    <div id="atlas-container"></div>
  `;

  const script = `
    ${d3Js}
    window.__ATLAS_DATA__ = ${JSON.stringify(graphData)};
    window.__ATLAS_DARK__ = ${JSON.stringify(isDark)};
    window.__ATLAS_OPTIONS__ = ${JSON.stringify(options)};
    ${rendererJs}
  `;

  await editor.showPanel("rhs", 1, html, script);
}
