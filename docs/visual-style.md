# Visual Style: Brutalist Technical Poster

This document is the durable visual design reference for Braincode UI surfaces.

The target style is **Brutalist Graphic Poster / 反精致科技海报风**. The goal is not polished cyberpunk gloss. The goal is to express AI, brain-computer interfaces, code, neural networks, agents, and model routing through rough linework, strong contrast, low color count, and hand-made industrial print energy.

## Core direction

- Rough, technical, experimental, independent-developer feeling.
- Strong visual pressure rather than elegant whitespace.
- Poster-like information layout rather than SaaS dashboard softness.
- Hand-drawn technical diagram + underground publication + industrial print texture.
- Avoid glossy gradients, glassmorphism, neon cyberpunk, and overly refined enterprise UI.

## Color system

Use a restrained three-color system:

- **Aged paper / 米白 / 旧纸色**: main background, archive and print feel.
- **Heavy black / 重黑色**: titles, silhouettes, borders, brutal lines, structural pressure.
- **Oxidized dark red / 暗红色 / 氧化红**: visual impact, warning, signal, energy, neural pulse.

Avoid high-saturation neon colors. The palette should feel closer to old posters, industrial printing, revolutionary posters, research dossiers, and underground technical zines.

## Linework

Linework is the core of the style.

Use:

- thick black strokes;
- irregular edges;
- rough ink marks;
- dry brush texture;
- woodcut-like lines;
- distressed strokes;
- visible grain and imperfect print damage;
- geometric facets for heads, brains, machines, diagrams, and neural structures.

Useful prompt keywords:

- `rough ink`
- `dry brush`
- `woodcut`
- `distressed stroke`
- `brutal linework`
- `hand-drawn technical diagram`
- `industrial print texture`

## Composition

For banner-like layouts, prefer:

```text
left: title + slogan + controls/information
right: main visual: head / brain / machine / signal / code
background: red-black rays, fragments, geometric blocks, signal waveforms
bottom: diagrams, symbols, technical paths, status strips
```

Common layout traits:

- asymmetrical poster layout;
- heavy borders;
- oversized title text;
- compressed information blocks;
- visible grid and diagram fragments;
- warning/signal strips;
- angular, blocky shapes.

## Typography

Use strong, compressed, utilitarian type.

English direction:

- Condensed Bold;
- Mono Bold;
- Distressed Sans;
- Poster Gothic;
- typewriter/terminal monospace for metadata and machine text.

Chinese direction:

- 思源黑体 Heavy;
- 阿里巴巴普惠体 Heavy;
- 站酷高端黑;
- 优设标题黑;
- 仓耳今楷 / 宋黑混合 when a more literary tone is needed.

Implementation fallback stack should prefer system-available fonts first, but keep the visual weight heavy and condensed where possible.

## UI application rules

- Use hard rectangular panels, not rounded SaaS cards.
- Use thick black borders and offset shadows.
- Use dark red for primary actions, warnings, signal markers, and active mode emphasis.
- Theme rendering follows the terminal/browser/system appearance and resolves to exactly two palettes: `light` and `dark`.
- App-level backgrounds should remain transparent; apply theme color to text, borders, panels, controls, and status surfaces instead.
- Use aged paper surfaces for forms and code blocks.
- Keep code/config editing areas monospaced and print-like.
- Prefer visible structure over subtle affordances.
- Bilingual UI should support **English** and **Chinese** at minimum.
- Do not expose secrets in visual panels; show auth status only unless a secure credential flow exists.

## Product fit

This style is especially suitable for Braincode because it communicates:

- AI tooling;
- open source and hacker culture;
- research tooling;
- neural networks and brain-like orchestration;
- code and technical diagrams;
- anti-commercial, hard-core independent developer energy.

The expected feeling is:

```text
hardcore / experimental / technical / research-driven / dangerous / independent
```
