// Atlas graph renderer — runs inside the panel iframe
// Expects: window.__ATLAS_DATA__ = { nodes: [...], edges: [...] }
//          window.__ATLAS_DARK__ = boolean
(function () {
  "use strict";

  const data = window.__ATLAS_DATA__;
  const isDark = window.__ATLAS_DARK__;
  if (!data || !data.nodes.length) return;

  const container = document.getElementById("atlas-container");
  if (!container) return;

  // --- Color palette ---
  const palette = isDark
    ? {
      bg: "#1e1e2e",
      currentNode: "#89b4fa",
      neighborNode: "#a6adc8",
      edge: "#45475a",
      edgeHighlight: "#89b4fa",
      label: "#cdd6f4",
      labelCurrent: "#1e1e2e",
      dimNode: "#313244",
      dimEdge: "#313244",
      dimLabel: "#585b70",
    }
    : {
      bg: "#ffffff",
      currentNode: "#1e66f5",
      neighborNode: "#6c6f85",
      edge: "#bcc0cc",
      edgeHighlight: "#1e66f5",
      label: "#4c4f69",
      labelCurrent: "#ffffff",
      dimNode: "#dce0e8",
      dimEdge: "#dce0e8",
      dimLabel: "#bcc0cc",
    };

  container.style.backgroundColor = palette.bg;

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

  // --- Force simulation ---
  const simulation = d3
    .forceSimulation(data.nodes)
    .force(
      "link",
      d3
        .forceLink(data.edges)
        .id((d) => d.id)
        .distance(80),
    )
    .force("charge", d3.forceManyBody().strength(-200))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collision", d3.forceCollide().radius(20))
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
    .attr("class", "node-group")
    .style("cursor", "pointer");

  // Circles
  node
    .append("circle")
    .attr("r", (d) => (d.isCurrent ? 6 : 5))
    .attr("fill", (d) => (d.isCurrent ? palette.currentNode : palette.neighborNode));

  // Labels — always outside the circle
  node
    .append("text")
    .text((d) => truncate(d.name, 20))
    .attr("dx", 10)
    .attr("dy", 4)
    .attr("text-anchor", "start")
    .attr("fill", (d) => (d.isCurrent ? palette.currentNode : palette.label))
    .attr("font-size", "10px")
    .attr("font-weight", (d) => (d.isCurrent ? "600" : "400"))
    .attr("font-family", "system-ui, -apple-system, sans-serif")
    .attr("paint-order", "stroke")
    .attr("stroke", palette.bg)
    .attr("stroke-width", 3);

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
        if (n.id === d.id) return palette.currentNode;
        if (neighbors.has(n.id)) {
          return n.isCurrent ? palette.currentNode : palette.neighborNode;
        }
        return palette.dimNode;
      });

      node.select("text").attr("fill", (n) => {
        if (n.id === d.id) return n.isCurrent ? palette.labelCurrent : palette.label;
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
        .attr("fill", (n) =>
          n.isCurrent ? palette.currentNode : palette.neighborNode
        );

      node
        .select("text")
        .attr("fill", (n) =>
          n.isCurrent ? palette.labelCurrent : palette.label
        );

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
