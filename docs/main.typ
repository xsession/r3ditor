// ═══════════════════════════════════════════════════════════════════
// r3ditor — Enterprise Technical Documentation
// Master Document
// ═══════════════════════════════════════════════════════════════════

#import "template.typ": *

#show: enterprise-doc.with(
  title: "r3ditor Technical Documentation",
  subtitle: "Open-Source CAD/CAM Editor — Architecture & Engineering Reference",
  version: "0.2.0",
  date: "2026",
  authors: ("r3ditor Engineering Team",),
)

// ═══════════════════════════════════════════
// COVER PAGE
// ═══════════════════════════════════════════

#set page(header: none, footer: none)

#v(3cm)

#align(center)[
  #block(width: 100%)[
    #rect(
      width: 100%,
      inset: (x: 40pt, y: 30pt),
      fill: gradient.linear(r3ditor-blue, r3ditor-indigo, angle: 135deg),
      radius: 12pt,
    )[
      #text(size: 42pt, weight: "black", fill: white, tracking: 2pt)[r3ditor]
      #v(6pt)
      #text(size: 14pt, fill: white.darken(10%), weight: "medium")[Open-Source CAD/CAM Editor]
    ]
  ]
]

#v(1.5cm)

#align(center)[
  #text(size: 20pt, weight: "bold", fill: r3ditor-dark)[Technical Documentation]
  #v(4pt)
  #text(size: 12pt, fill: r3ditor-gray)[Architecture & Engineering Reference — v0.2.0]
]

#v(2cm)

#grid(
  columns: (1fr, 1fr, 1fr, 1fr),
  column-gutter: 12pt,
  metric-card("Rust Crates", "15"),
  metric-card("WGSL Shaders", "5"),
  metric-card("Materials", "23"),
  metric-card("Target FPS", "60"),
)

#v(1.5cm)

#align(center)[
  #grid(
    columns: (auto, auto, auto, auto, auto, auto),
    column-gutter: 8pt,
    tech-badge("Rust 2021", color: rgb("#DEA584")),
    tech-badge("wgpu 28", color: r3ditor-indigo),
    tech-badge("Truck B-Rep", color: r3ditor-sky),
    tech-badge("Tauri 2.2", color: r3ditor-blue),
    tech-badge("React 18", color: r3ditor-sky),
    tech-badge("wasmtime 28", color: r3ditor-purple),
  )
]

#v(2cm)

#align(center)[
  #text(size: 9pt, fill: r3ditor-gray)[
    License: MIT OR Apache-2.0 \
    Generated: March 2026 \
    Classification: Public
  ]
]

#pagebreak()

// ═══════════════════════════════════════════
// TABLE OF CONTENTS
// ═══════════════════════════════════════════

#set page(
  header: context {
    if counter(page).get().first() > 1 {
      set text(size: 8pt, fill: r3ditor-gray)
      grid(
        columns: (1fr, 1fr),
        align(left)[r3ditor Technical Documentation],
        align(right)[v0.2.0],
      )
      v(2pt)
      line(length: 100%, stroke: 0.5pt + r3ditor-gray.lighten(60%))
    }
  },
  footer: context {
    if counter(page).get().first() > 1 {
      line(length: 100%, stroke: 0.5pt + r3ditor-gray.lighten(60%))
      v(4pt)
      set text(size: 8pt, fill: r3ditor-gray)
      grid(
        columns: (1fr, 1fr),
        align(left)[© 2026 — MIT OR Apache-2.0],
        align(right)[Page #counter(page).display("1 / 1", both: true)],
      )
    }
  },
)

#outline(
  title: [Table of Contents],
  indent: 1.5em,
  depth: 3,
)

// ═══════════════════════════════════════════
// CHAPTERS
// ═══════════════════════════════════════════

#include "chapters/01-executive-summary.typ"
#include "chapters/02-architecture-overview.typ"
#include "chapters/03-cad-kernel.typ"
#include "chapters/04-cam-engine.typ"
#include "chapters/05-gpu-renderer.typ"
#include "chapters/06-editor-shell.typ"
#include "chapters/07-api-cloud.typ"
#include "chapters/08-plugin-system.typ"
#include "chapters/09-data-formats.typ"
#include "chapters/10-deployment.typ"
#include "chapters/11-performance.typ"
#include "chapters/12-migration.typ"
#include "chapters/13-appendices.typ"
