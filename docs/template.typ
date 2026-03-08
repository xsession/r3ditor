// ═══════════════════════════════════════════════════════════════════
// r3ditor — Enterprise Documentation Template
// ═══════════════════════════════════════════════════════════════════

#let r3ditor-blue    = rgb("#1E40AF")
#let r3ditor-indigo  = rgb("#4F46E5")
#let r3ditor-sky     = rgb("#0EA5E9")
#let r3ditor-dark    = rgb("#0F172A")
#let r3ditor-gray    = rgb("#64748B")
#let r3ditor-light   = rgb("#F8FAFC")
#let r3ditor-accent  = rgb("#F59E0B")
#let r3ditor-green   = rgb("#10B981")
#let r3ditor-red     = rgb("#EF4444")
#let r3ditor-purple  = rgb("#8B5CF6")

// ─── Document Template ───
#let enterprise-doc(
  title: "",
  subtitle: "",
  version: "0.2.0",
  date: "2026",
  authors: (),
  body,
) = {
  set document(
    title: title,
    author: authors,
  )

  set page(
    paper: "a4",
    margin: (top: 2.5cm, bottom: 2.5cm, left: 2.5cm, right: 2.5cm),
    header: context {
      if counter(page).get().first() > 1 {
        set text(size: 8pt, fill: r3ditor-gray)
        grid(
          columns: (1fr, 1fr),
          align(left)[r3ditor Technical Documentation],
          align(right)[v#version],
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
          align(left)[© #date — AGPL-3.0],
          align(right)[Page #counter(page).display("1 / 1", both: true)],
        )
      }
    },
  )

  set text(
    font: "Inter",
    size: 10pt,
    fill: r3ditor-dark,
    lang: "en",
  )

  set par(
    justify: true,
    leading: 0.7em,
  )

  // ─── Headings ───
  show heading.where(level: 1): it => {
    pagebreak(weak: true)
    v(1cm)
    block(width: 100%)[
      #rect(
        width: 100%,
        inset: (x: 20pt, y: 16pt),
        fill: gradient.linear(r3ditor-blue, r3ditor-indigo, angle: 0deg),
        radius: 6pt,
      )[
        #text(
          size: 24pt,
          weight: "bold",
          fill: white,
        )[#it.body]
      ]
    ]
    v(0.5cm)
  }

  show heading.where(level: 2): it => {
    v(0.6cm)
    block(width: 100%)[
      #grid(
        columns: (4pt, 1fr),
        column-gutter: 12pt,
        rect(width: 4pt, height: 24pt, fill: r3ditor-indigo, radius: 2pt),
        text(size: 16pt, weight: "bold", fill: r3ditor-blue)[#it.body],
      )
    ]
    v(0.3cm)
  }

  show heading.where(level: 3): it => {
    v(0.4cm)
    text(size: 12pt, weight: "bold", fill: r3ditor-indigo)[#it.body]
    v(0.2cm)
  }

  // ─── Code blocks ───
  show raw.where(block: true): it => {
    block(
      width: 100%,
      inset: 12pt,
      fill: rgb("#1E1E2E"),
      radius: 6pt,
      stroke: 1pt + rgb("#313244"),
    )[
      #set text(font: "JetBrains Mono", size: 8.5pt, fill: rgb("#CDD6F4"))
      #it
    ]
  }

  show raw.where(block: false): it => {
    box(
      inset: (x: 4pt, y: 2pt),
      fill: r3ditor-light,
      radius: 3pt,
      stroke: 0.5pt + r3ditor-gray.lighten(60%),
    )[
      #set text(font: "JetBrains Mono", size: 9pt, fill: r3ditor-indigo)
      #it
    ]
  }

  // ─── Tables ───
  set table(
    stroke: 0.5pt + r3ditor-gray.lighten(60%),
    inset: 8pt,
  )

  show table: it => {
    block(
      width: 100%,
      radius: 6pt,
      clip: true,
      stroke: 0.5pt + r3ditor-gray.lighten(40%),
    )[#it]
  }

  // ─── Links ───
  show link: it => {
    text(fill: r3ditor-sky)[#underline[#it]]
  }

  body
}

// ─── Component Helpers ───

#let info-box(title: "Info", body) = {
  block(
    width: 100%,
    inset: 14pt,
    fill: rgb("#EFF6FF"),
    radius: 6pt,
    stroke: 1.5pt + r3ditor-sky,
  )[
    #text(weight: "bold", fill: r3ditor-blue)[ℹ #title] \
    #v(4pt)
    #body
  ]
}

#let warning-box(title: "Warning", body) = {
  block(
    width: 100%,
    inset: 14pt,
    fill: rgb("#FFFBEB"),
    radius: 6pt,
    stroke: 1.5pt + r3ditor-accent,
  )[
    #text(weight: "bold", fill: rgb("#B45309"))[⚠ #title] \
    #v(4pt)
    #body
  ]
}

#let success-box(title: "Success", body) = {
  block(
    width: 100%,
    inset: 14pt,
    fill: rgb("#ECFDF5"),
    radius: 6pt,
    stroke: 1.5pt + r3ditor-green,
  )[
    #text(weight: "bold", fill: rgb("#047857"))[✓ #title] \
    #v(4pt)
    #body
  ]
}

#let metric-card(label, value, unit: "") = {
  box(
    width: 100%,
    inset: 12pt,
    fill: white,
    radius: 6pt,
    stroke: 1pt + r3ditor-gray.lighten(50%),
  )[
    #align(center)[
      #text(size: 22pt, weight: "bold", fill: r3ditor-indigo)[#value]
      #if unit != "" [ #text(size: 10pt, fill: r3ditor-gray)[#unit]]
      #v(2pt)
      #text(size: 8pt, fill: r3ditor-gray)[#label]
    ]
  ]
}

#let tech-badge(name, color: r3ditor-indigo) = {
  box(
    inset: (x: 8pt, y: 4pt),
    fill: color.lighten(85%),
    radius: 10pt,
    stroke: 0.5pt + color.lighten(40%),
  )[
    #text(size: 8pt, weight: "medium", fill: color)[#name]
  ]
}

#let crate-ref(name) = {
  box(
    inset: (x: 6pt, y: 3pt),
    fill: rgb("#FEF3C7"),
    radius: 4pt,
    stroke: 0.5pt + rgb("#D97706"),
  )[
    #text(font: "JetBrains Mono", size: 8pt, fill: rgb("#92400E"))[📦 #name]
  ]
}

#let phase-indicator(number, label, status: "planned") = {
  let bg = if status == "complete" { r3ditor-green.lighten(80%) }
    else if status == "active" { r3ditor-sky.lighten(80%) }
    else { r3ditor-gray.lighten(80%) }
  let fg = if status == "complete" { rgb("#047857") }
    else if status == "active" { r3ditor-blue }
    else { r3ditor-gray }
  box(
    inset: (x: 10pt, y: 6pt),
    fill: bg,
    radius: 6pt,
    stroke: 1pt + fg.lighten(30%),
  )[
    #text(weight: "bold", fill: fg)[Phase #number] #text(fill: fg)[— #label]
  ]
}
