// Atlas graph renderer — runs inside the panel iframe
// Expects: window.__ATLAS_DATA__ = { nodes: [...], edges: [...] }
//          window.__ATLAS_DARK__ = boolean
//          window.__ATLAS_OPTIONS__ = { showOrphans: boolean }
(function () {
  "use strict";

  const data = window.__ATLAS_DATA__;
  if (!data || !data.nodes.length) return;

  const options = window.__ATLAS_OPTIONS__ || { showOrphans: false };

  const container = document.getElementById("atlas-container");
  if (!container) return;

  // --- Theme detection ---
  const sbTheme = document.documentElement.getAttribute("data-theme");
  const isDark = sbTheme
    ? sbTheme === "dark"
    : (window.__ATLAS_DARK__ ?? matchMedia("(prefers-color-scheme: dark)").matches);
  console.log("[Atlas] theme:", sbTheme, "isDark:", isDark);
  if (!sbTheme) {
    document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
  }

  const style = getComputedStyle(document.documentElement);
  const v = (name) => style.getPropertyValue(name).trim();

  const palette = {
    bg: v("--atlas-bg"),
    currentNode: v("--atlas-node-current"),
    neighborNode: v("--atlas-node-neighbor"),
    orphanNode: v("--atlas-node-orphan"),
    edge: v("--atlas-edge"),
    edgeHighlight: v("--atlas-edge-highlight"),
    label: v("--atlas-label"),
    labelCurrent: v("--atlas-label-current"),
    dimNode: v("--atlas-node-dim"),
    dimEdge: v("--atlas-edge-dim"),
    dimLabel: v("--atlas-label-dim"),
  };

  // --- Toolbar ---
  const toolbar = document.getElementById("atlas-toolbar");
  if (toolbar) {
    const orphanBtn = document.createElement("button");
    orphanBtn.className = "atlas-btn" + (options.showOrphans ? " active" : "");
    orphanBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2">
      <circle cx="8" cy="8" r="6" stroke-dasharray="3,2"/>
    </svg><span>Orphans</span>`;
    orphanBtn.addEventListener("click", () => {
      options.showOrphans = !options.showOrphans;
      orphanBtn.classList.toggle("active", options.showOrphans);
      toggleOrphanVisibility(options.showOrphans);
      // Fire-and-forget persist to worker
      syscall("system.invokeFunction", "atlas.setOption", "showOrphans", options.showOrphans);
    });
    toolbar.appendChild(orphanBtn);
  }

  // --- Dimensions ---
  const width = container.clientWidth || 300;
  const height = container.clientHeight || 400;

  // --- SVG setup ---
  const svg = d3
    .select(container)
    .append("svg")
    .attr("width", "100%")
    .attr("height", "100%")
    .attr("viewBox", [0, 0, width, height]);

  // Zoom layer
  const g = svg.append("g");

  const zoom = d3
    .zoom()
    .scaleExtent([0.3, 4])
    .on("zoom", (event) => {
      g.attr("transform", event.transform);
    });
  svg.call(zoom);

  // --- Build adjacency for hover highlighting ---
  const adjacency = new Map();
  for (const node of data.nodes) {
    adjacency.set(node.id, new Set());
  }
  for (const edge of data.edges) {
    if (adjacency.has(edge.source)) adjacency.get(edge.source).add(edge.target);
    if (adjacency.has(edge.target)) adjacency.get(edge.target).add(edge.source);
  }

  // --- Degree map for scaling node size ---
  const degree = new Map();
  for (const node of data.nodes) degree.set(node.id, 0);
  for (const edge of data.edges) {
    degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
    degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
  }

  // --- Force simulation (tuned for full graph) ---
  const nodeCount = data.nodes.length;
  const chargeStrength = nodeCount > 50 ? -80 : nodeCount > 20 ? -120 : -200;
  const linkDistance = nodeCount > 50 ? 60 : nodeCount > 20 ? 70 : 80;

  const simulation = d3
    .forceSimulation(data.nodes)
    .force(
      "link",
      d3
        .forceLink(data.edges)
        .id((d) => d.id)
        .distance(linkDistance),
    )
    .force("charge", d3.forceManyBody().strength(chargeStrength))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("x", d3.forceX(width / 2).strength(0.05))
    .force("y", d3.forceY(height / 2).strength(0.05))
    .force("collision", d3.forceCollide().radius(15))
    .alphaDecay(0.02);

  // --- Edges ---
  const link = g
    .append("g")
    .attr("class", "edges")
    .selectAll("line")
    .data(data.edges)
    .join("line")
    .attr("stroke", palette.edge)
    .attr("stroke-width", 1.5)
    .attr("stroke-opacity", 0.6);

  // --- Node groups ---
  const node = g
    .append("g")
    .attr("class", "nodes")
    .selectAll("g")
    .data(data.nodes)
    .join("g")
    .attr("class", (d) => "node-group" + (d.isOrphan ? " orphan" : ""))
    .style("cursor", "pointer");

  // Circles — radius scales with connection count; orphans are smaller
  node
    .append("circle")
    .attr("r", (d) => {
      if (d.isOrphan) return 3;
      const deg = degree.get(d.id) || 0;
      const base = d.isCurrent ? 7 : 4;
      return base + Math.min(deg, 10) * 0.4;
    })
    .attr("fill", (d) => {
      if (d.isOrphan) return palette.orphanNode;
      return d.isCurrent ? palette.currentNode : palette.neighborNode;
    })
    .attr("fill-opacity", (d) => d.isOrphan ? 0.4 : 1)
    .attr("stroke", (d) => d.isOrphan ? palette.orphanNode : "none")
    .attr("stroke-width", (d) => d.isOrphan ? 1.5 : 0)
    .attr("stroke-dasharray", (d) => d.isOrphan ? "2,2" : "none");

  // Labels — always outside the circle
  node
    .append("text")
    .text((d) => truncate(d.name, 20))
    .attr("dx", 10)
    .attr("dy", 4)
    .attr("text-anchor", "start")
    .attr("fill", (d) => {
      if (d.isOrphan) return palette.orphanNode;
      return d.isCurrent ? palette.currentNode : palette.label;
    })
    .attr("fill-opacity", (d) => d.isOrphan ? 0.6 : 1)
    .attr("font-size", "10px")
    .attr("font-weight", (d) => (d.isCurrent ? "600" : "400"))
    .attr("font-family", "system-ui, -apple-system, sans-serif")
    .attr("paint-order", "stroke")
    .attr("stroke", palette.bg)
    .attr("stroke-width", 3);

  // Touch hit area — invisible larger target for easier tapping on mobile
  const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
  if (isTouch) {
    node
      .append("circle")
      .attr("r", (d) => {
        if (d.isOrphan) return 9;
        const deg = degree.get(d.id) || 0;
        const base = d.isCurrent ? 7 : 4;
        return Math.max(20, (base + Math.min(deg, 10) * 0.4) * 3);
      })
      .attr("fill", "none")
      .attr("pointer-events", "all");
  }

  // --- Orphan visibility ---
  function toggleOrphanVisibility(show) {
    const orphans = node.filter((d) => d.isOrphan);
    orphans
      .transition()
      .duration(300)
      .style("opacity", show ? 1 : 0)
      .on("end", function () {
        d3.select(this).style("pointer-events", show ? "auto" : "none");
      });
    // Reheat simulation so orphans settle naturally when shown
    if (show) {
      simulation.alpha(0.3).restart();
    }
  }

  // Apply initial orphan visibility
  toggleOrphanVisibility(options.showOrphans);

  // --- Drag behavior ---
  const drag = d3
    .drag()
    .on("start", (event, d) => {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    })
    .on("drag", (event, d) => {
      d.fx = event.x;
      d.fy = event.y;
    })
    .on("end", (event, d) => {
      if (!event.active) simulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    });
  node.call(drag);

  // --- Click → navigate ---
  node.on("click", (_event, d) => {
    if (d.isCurrent) return;
    syscall("system.invokeFunction", "atlas.handleNavigate", d.id);
  });

  // --- Hover highlighting ---
  node
    .on("mouseenter", (_event, d) => {
      const neighbors = adjacency.get(d.id) || new Set();

      node.select("circle").attr("fill", (n) => {
        if (n.id === d.id) return n.isOrphan ? palette.orphanNode : palette.currentNode;
        if (neighbors.has(n.id)) {
          return n.isCurrent ? palette.currentNode : palette.neighborNode;
        }
        return palette.dimNode;
      });

      node.select("text").attr("fill", (n) => {
        if (n.id === d.id) return n.isCurrent ? palette.labelCurrent : (n.isOrphan ? palette.orphanNode : palette.label);
        if (neighbors.has(n.id)) {
          return n.isCurrent ? palette.labelCurrent : palette.label;
        }
        return palette.dimLabel;
      });

      link
        .attr("stroke", (l) => {
          const src = typeof l.source === "object" ? l.source.id : l.source;
          const tgt = typeof l.target === "object" ? l.target.id : l.target;
          if (src === d.id || tgt === d.id) return palette.edgeHighlight;
          return palette.dimEdge;
        })
        .attr("stroke-width", (l) => {
          const src = typeof l.source === "object" ? l.source.id : l.source;
          const tgt = typeof l.target === "object" ? l.target.id : l.target;
          if (src === d.id || tgt === d.id) return 2.5;
          return 1.5;
        });
    })
    .on("mouseleave", () => {
      node
        .select("circle")
        .attr("fill", (n) => {
          if (n.isOrphan) return palette.orphanNode;
          return n.isCurrent ? palette.currentNode : palette.neighborNode;
        });

      node
        .select("text")
        .attr("fill", (n) => {
          if (n.isOrphan) return palette.orphanNode;
          return n.isCurrent ? palette.labelCurrent : palette.label;
        });

      link.attr("stroke", palette.edge).attr("stroke-width", 1.5);
    });

  // --- Tick ---
  simulation.on("tick", () => {
    link
      .attr("x1", (d) => d.source.x)
      .attr("y1", (d) => d.source.y)
      .attr("x2", (d) => d.target.x)
      .attr("y2", (d) => d.target.y);

    node.attr("transform", (d) => `translate(${d.x},${d.y})`);
  });

  // --- Helpers ---
  function truncate(str, maxLen) {
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen - 1) + "\u2026";
  }
})();
