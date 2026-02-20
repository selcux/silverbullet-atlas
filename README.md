# Atlas — Graph View for SilverBullet

An interactive local knowledge graph that lives in the right panel. Shows the current page's direct connections (outlinks + backlinks) as a force-directed D3.js graph.

## Features

- **Auto-updates** on page navigation — graph recenters on the current page
- **Click to navigate** — click any neighbor node to jump to that page
- **Drag nodes** — reposition nodes, simulation reheats
- **Zoom & pan** — scroll to zoom, drag background to pan
- **Hover highlighting** — hover a node to highlight its connections, dim the rest
- **Dark/light mode** — adapts to your SilverBullet theme

## Install

Run the **Library: Install** command in SilverBullet and use this URL:

```
https://github.com/selcukcihan/silverbullet-atlas/blob/main/PLUG.md
```

## Usage

Run the command: **Atlas: Toggle Graph View**

This opens (or closes) the graph panel on the right side. The graph automatically updates as you navigate between pages.

## Development

### Prerequisites

- [Deno](https://docs.deno.com/runtime/)

### Setup

1. Create a namespace folder in your space:
   ```bash
   mkdir -p ~/myspace/Library/Atlas
   ```

2. Symlink this repo into your space:
   ```bash
   ln -s $PWD ~/myspace/Library/Atlas
   ```

3. Build:
   ```bash
   deno task build
   ```

SilverBullet auto-syncs within ~20s. Run **Plugs: Reload** to activate.

## Architecture

```
Web Worker (no DOM)              Panel iframe (has DOM)
┌─────────────────────┐         ┌──────────────────────┐
│  atlas.ts            │──JSON──▶│  d3.min.js           │
│  ├─ toggleAtlas()    │         │  atlas-render.js     │
│  ├─ updateGraph()    │◀─call───│  atlas-style.css     │
│  └─ handleNavigate() │         │                      │
│                      │         │  SVG force graph     │
│  graph.ts            │         │  drag/zoom/click     │
│  └─ buildLocalGraph()│         └──────────────────────┘
│        ▼             │
│  SB Index syscalls   │
└─────────────────────┘
```

## License

MIT
