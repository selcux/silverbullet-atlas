import {
  asset,
  clientStore,
  editor,
} from "@silverbulletmd/silverbullet/syscalls";
import { buildFullGraph } from "./graph.ts";

const PLUG_NAME = "atlas";
const STORE_KEY = "atlasEnabled";

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
  const graphData = await buildFullGraph(currentPage);
  const isDark = !!(await editor.getUiOption("darkMode"));

  // Load assets
  const [d3Js, rendererJs, css] = await Promise.all([
    asset.readAsset(PLUG_NAME, "assets/d3.min.js"),
    asset.readAsset(PLUG_NAME, "assets/atlas-render.js"),
    asset.readAsset(PLUG_NAME, "assets/atlas-style.css"),
  ]);

  const html = `
    <style>${css}</style>
    <div id="atlas-container"></div>
  `;

  const script = `
    ${d3Js}
    window.__ATLAS_DATA__ = ${JSON.stringify(graphData)};
    window.__ATLAS_DARK__ = ${JSON.stringify(isDark)};
    ${rendererJs}
  `;

  await editor.showPanel("rhs", 1, html, script);
}
