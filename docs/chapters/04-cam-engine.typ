#import "../template.typ": *

= CAM Engine

The CAM (Computer-Aided Manufacturing) engine integrates CNC machining physics, sheet metal fabrication, toolpath generation, and nesting optimization into a unified manufacturing pipeline.

#align(center)[
  #image("../assets/cam-engine-pipeline.svg", width: 100%)
]

== CNC Physics Models

The CNC module implements *six physics-based models* for accurate machining simulation and cost estimation:

=== Cutting Force — Kienzle Model

The Kienzle equation predicts specific cutting force:

$ F_c = k_(c 1.1) dot h^(1 - m_c) dot b $

where $k_(c 1.1)$ is the specific cutting force for 1 mm² chip cross-section, $h$ is chip thickness, $m_c$ is the material exponent, and $b$ is chip width.

=== Tool Life — Taylor Equation

Tool wear prediction uses the extended Taylor equation:

$ V_c dot T^n = C $

where $V_c$ is cutting velocity, $T$ is tool life in minutes, and $n$, $C$ are material-dependent constants.

=== Cutting Temperature — Loewen-Shaw

Thermal modeling for cutting zone temperature:

$ theta = theta_0 + (F_c dot V_c) / (A dot k) dot f(R) $

=== Chatter Stability — Altintas Model

Stability lobe diagram computation to avoid self-excited vibration:

$ a_("lim") = -1 / (2 dot K_f dot "Re"[G(j omega_c)]) $

=== Material Removal Rate

$ "MRR" = a_p dot a_e dot v_f $

where $a_p$ is depth of cut, $a_e$ is width of cut, and $v_f$ is feed rate.

=== Surface Finish Prediction

$ R_a = f^2 / (32 dot r_epsilon) $

where $f$ is feed per revolution and $r_epsilon$ is tool nose radius.

== Sheet Metal Operations

=== Cutting Methods

#table(
  columns: (auto, 1fr, auto, auto),
  table.header([*Method*], [*Parameters*], [*Speed*], [*Tolerance*]),
  [🔥 Laser], [Kerf width, gas type, pierce time, focal position], [High], [±0.1 mm],
  [⚡ Plasma], [Amperage, arc voltage, pierce height, cut height], [Very High], [±0.5 mm],
  [💧 Waterjet], [Pressure (MPa), abrasive flow, standoff distance], [Medium], [±0.05 mm],
  [📐 Punching], [Tool size, stroke rate, nibble spacing], [High], [±0.1 mm],
)

=== Bending Models

Three bending formulas with springback prediction:

#table(
  columns: (auto, 1fr, auto),
  table.header([*Formula*], [*Description*], [*Use Case*]),
  [DIN 6935], [$K = (pi / 180) dot alpha dot (r_i + K_"factor" dot t)$ — standard bend allowance], [General purpose],
  [Leu-Zhuang], [Non-linear springback model for large-radius bends], [High precision],
  [Approximate], [Simplified K-factor method for quick estimates], [Quick quoting],
)

Where $K_"factor"$ ranges from 0.3 (soft materials, tight radii) to 0.5 (hard materials, large radii).

== Material Catalogs

=== Sheet Materials (17)

#table(
  columns: (auto, auto, auto, auto, auto),
  table.header([*Material*], [*Density*], [*Tensile*], [*Conductivity*], [*Max Thickness*]),
  [Mild Steel], [7.85 g/cm³], [400 MPa], [50 W/m·K], [25 mm],
  [Stainless 304], [8.00 g/cm³], [505 MPa], [16 W/m·K], [20 mm],
  [Stainless 316], [8.00 g/cm³], [515 MPa], [16 W/m·K], [20 mm],
  [Aluminum 5052], [2.68 g/cm³], [230 MPa], [138 W/m·K], [12 mm],
  [Aluminum 6061], [2.70 g/cm³], [310 MPa], [167 W/m·K], [12 mm],
  [Copper C110], [8.94 g/cm³], [220 MPa], [388 W/m·K], [6 mm],
  [Brass C260], [8.53 g/cm³], [340 MPa], [120 W/m·K], [6 mm],
  [Titanium Gr2], [4.51 g/cm³], [345 MPa], [16 W/m·K], [10 mm],
)

#text(size: 8pt, fill: r3ditor-gray)[_Plus 9 additional materials: Galvanized, Spring Steel, Corten, Inconel 625, Monel 400, Zinc, Nickel 200, Hastelloy C276, Zircaloy_]

=== CNC Materials (6)

#table(
  columns: (auto, auto, auto, auto),
  table.header([*Material*], [*k#sub[c1.1]*], [*Taylor n*], [*Hardness*]),
  [Aluminum 6061-T6], [800 N/mm²], [0.25], [95 HB],
  [Aluminum 7075-T6], [900 N/mm²], [0.20], [150 HB],
  [Stainless 304], [2200 N/mm²], [0.20], [187 HB],
  [Steel 4140], [2100 N/mm²], [0.25], [197 HB],
  [Titanium Ti-6Al-4V], [1800 N/mm²], [0.15], [334 HB],
  [Brass C360], [780 N/mm²], [0.30], [78 HB],
)

== Toolpath Generation

The toolpath pipeline produces machine-ready G-code:

+ *Feature Recognition* — identify machinable features (holes, pockets, profiles)
+ *Operation Planning* — select tools, determine roughing/finishing strategy
+ *Toolpath Computation* — generate tool center-line paths with collision avoidance
+ *Post-Processing* — translate generic toolpath to machine-specific G-code

=== G-code Post-Processors

Seven machine controller formats are supported:

#grid(
  columns: (1fr, 1fr, 1fr, 1fr),
  column-gutter: 8pt,
  row-gutter: 8pt,
  tech-badge("Fanuc", color: r3ditor-blue),
  tech-badge("Haas", color: r3ditor-indigo),
  tech-badge("Heidenhain", color: r3ditor-purple),
  tech-badge("Siemens 840D", color: r3ditor-sky),
  tech-badge("Mazak", color: r3ditor-green),
  tech-badge("Grbl", color: r3ditor-accent),
  tech-badge("LinuxCNC", color: r3ditor-red),
)

== Nesting Optimization

The nesting engine optimizes part placement on sheet stock to minimize material waste:

- *Algorithm*: Bottom-left fill with rotation (0°, 90°, 180°, 270°)
- *Target*: < 1 second for 100 parts
- *Metrics*: Material utilization percentage, waste area, nested count
- *Output*: Part placement coordinates + cutting path order

#info-box(title: "Future Enhancement")[
  Planned: genetic algorithm-based nesting for complex part geometries with irregular contours, targeting 85%+ material utilization for production runs.
]
