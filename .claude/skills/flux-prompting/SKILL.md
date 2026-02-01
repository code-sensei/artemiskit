---
name: flux-prompting
description: |
  Expert guidance for prompting Flux AI image generation models (FLUX.1, FLUX.2, Kontext) to achieve high-quality, prompt-adherent results. Use when generating images with Flux models, crafting prompts for specific visual styles, creating product photography, isolated objects, transparent backgrounds, artistic illustrations, or photorealistic images. Covers prompt structure, technical parameters, style control, text rendering, and common pitfalls to avoid.
---

# Flux Prompting Guide

Generate high-quality images with Flux models by following these proven techniques.

## Core Principles

1. **Be specific and detailed** - Flux thrives on rich descriptions, not vague keywords
2. **Use natural language** - Describe images conversationally, not keyword-stuffed
3. **Focus on what you want** - Flux has no negative prompts; describe positively
4. **Front-load important elements** - Key details at prompt start get priority
5. **Match technical specs to output** - Camera settings, lighting, aspect ratio matter

## Prompt Structure Framework

Use this hierarchy: **Subject + Action + Style + Context + Technical**

```
[Main subject with key attributes]
[Action or pose if applicable]
[Art style or rendering approach]
[Environment/background context]
[Technical specs: camera, lighting, composition]
```

**Example:**
```
A weathered brass compass resting on an antique nautical map,
soft directional lighting from upper left creating gentle shadows,
photorealistic product photography style,
shallow depth of field with soft bokeh background,
shot on Canon 5D Mark IV, 85mm lens at f/2.8, studio lighting
```

## Model-Specific Parameters

### FLUX.1 [dev]
- **Steps:** 20-30 optimal (max 50)
- **Guidance scale:** 3.5 recommended (range 1.5-5)
- **Resolution:** 1024x1024 base, up to 1920x1080 for quality

### FLUX.1 [schnell]
- **Steps:** 2-4 (optimized for speed)
- **Best for:** Rapid iteration, testing prompts

### FLUX.2 [pro/max]
- **Resolution:** Up to 4MP native
- **Prompt upsampling:** Enable for automatic enhancement
- **Text rendering:** Superior accuracy with quoted text

## Creating Isolated Objects / Transparent Backgrounds

Flux cannot directly output transparent PNGs. Use this two-step workflow:

### Step 1: Generate with Clean Background

**For FLUX.1 [schnell]** (preferred for white backgrounds):
```
[Object description], isolated on pure white background,
studio product photography, even diffused lighting,
no shadows on background, sharp focus, high detail
```

**For FLUX.1 [dev]** (avoid "white background" - causes blur):
```
[Object description], game asset style, clear background,
centered in frame, full object visible, clean edges,
studio lighting, minimal shadows
```

**For Product Shots:**
```
Professional product photo of [product] on polished surface,
bright studio lighting with soft shadows,
clean seamless backdrop, ultra-realistic,
sharp focus, high detail, minimal reflections
```

### Step 2: Remove Background

After generation, use background removal tools:
- Flux Background Remover (fluxai.pro/background-remover)
- Remove.bg or similar AI-powered tools
- Manual masking in image editors

### Tips for Clean Cutouts
- Use "game asset" in prompts for cleaner edges
- Specify "full body" or "complete object visible"
- Avoid complex backgrounds that bleed into subject
- Request "centered in frame" for easier masking

## Photorealistic Images

### Camera & Lens References
```
Shot on [Camera Model], [focal length] lens at f/[aperture]
```

**Examples:**
- `Shot on Canon 5D Mark IV, 85mm lens at f/1.8` - Portrait
- `Shot on Sony A7R IV, 35mm lens at f/8` - Landscape
- `Shot on Fujifilm X-T5, 50mm macro at f/2.8` - Product
- `Shot on iPhone 16 Pro, wide angle` - Casual/authentic

### Lighting Descriptions
- `soft diffused key light` - Even, flattering
- `dramatic rim lighting` - Silhouette emphasis
- `golden hour lighting` - Warm, directional
- `three-point studio setup` - Professional
- `high-key lighting` - Bright, minimal shadows
- `low-key lighting` - Dramatic, deep shadows

### Era-Specific Styles
- `2000s digicam aesthetic` - Early digital look
- `80s vintage photo` - Film grain, warm tones
- `Polaroid instant photo` - Square, faded edges
- `35mm film photography` - Classic analog feel

## Text in Images

Flux can render text accurately when properly prompted.

### Syntax
```
The text "[YOUR TEXT HERE]" appears in [style] [position]
```

### Examples
```
A neon sign reading "OPEN 24/7" glowing in red and blue,
mounted above a diner entrance at night

A vintage poster with the text "JAZZ NIGHT" in bold art deco
lettering, cream and gold color scheme

Coffee cup with "Good Morning" written in elegant script
on the ceramic surface
```

### Text Rendering Tips
- Use quotation marks around exact text
- Specify font style (serif, sans-serif, script, bold)
- Describe placement relative to other elements
- Keep text concise - shorter phrases render better
- Flux supports hex color codes: `text in #FF5733 orange`

## Artistic Styles

### Style Prompting Technique
Simple "in the style of" often fails. Use this pattern:
```
[Subject], [artist/movement] art style, [technique description]
```

**Example:**
```
A sunflower field, Van Gogh art style,
visible impasto brushstrokes, swirling sky,
bold yellow and blue color palette, post-impressionist painting
```

### Common Style Keywords

**Illustration:**
- `vector illustration, flat design, bold outlines`
- `watercolor painting, soft edges, color bleeding`
- `digital art, clean lines, vibrant colors`
- `concept art, painterly style, atmospheric`

**3D/Rendering:**
- `3D render, Octane render, volumetric lighting`
- `isometric illustration, clean geometry`
- `low poly art, geometric facets, minimal`
- `photorealistic CGI, ray tracing, subsurface scattering`

**Photography Styles:**
- `editorial photography, magazine quality`
- `street photography, candid, documentary`
- `fashion photography, high contrast, dramatic`
- `architectural photography, straight lines, symmetry`

**Artistic Movements:**
- `art nouveau, organic curves, decorative borders`
- `art deco, geometric patterns, gold accents`
- `minimalist, negative space, simple composition`
- `surrealist, dreamlike, impossible geometry`

## Aspect Ratios & Resolution

### Recommended Sizes
| Use Case | Aspect Ratio | Resolution |
|----------|--------------|------------|
| Square/Profile | 1:1 | 1024x1024 |
| Landscape/Web | 16:9 | 1920x1080 |
| Portrait/Mobile | 9:16 | 1080x1920 |
| Social Feed | 4:5 | 1080x1350 |
| Print | 3:2 | 1536x1024 |
| Cinematic | 21:9 | 2560x1080 |

### Resolution Guidelines
- **1024x1024:** Fast, good quality baseline
- **1920x1080:** Optimal quality/speed balance
- **2560x1440:** Diminishing returns, longer render
- **4K+:** Often blurry, not recommended for FLUX.1

## Common Mistakes to Avoid

### Don't Use
- Negative prompts (`--no`, `not`, `without`) - Flux ignores them
- Weight syntax `(word:1.5)` - Not supported
- "White background" in FLUX.1 [dev] - Causes blur
- Overly long prompts (>500 tokens) - Gets truncated
- Vague terms ("beautiful", "nice", "amazing")

### Do Instead
- Describe what you want, not what to avoid
- Place important words at prompt start
- Use "clear background" or "game asset" for isolation
- Be specific about style, lighting, composition
- Use concrete descriptors over subjective ones

## Layer-Based Prompting (Complex Scenes)

For detailed scenes, describe in layers:

```
BACKGROUND: Rolling hills at sunset, warm orange and pink sky
MIDDLE GROUND: A rustic wooden farmhouse with smoke from chimney
FOREGROUND: A winding dirt path with wildflowers on both sides
ATMOSPHERE: Golden hour lighting, pastoral peaceful mood
STYLE: Impressionist landscape painting, visible brushstrokes
```

## Flux Kontext (Image Editing)

For editing existing images with Flux Kontext:

### Action + Constraint Framework
```
[What to change] while [what to preserve]
```

**Examples:**
```
Change the car to bright red while keeping everything else identical

Replace the background with a beach scene while maintaining
the person's exact position, scale, and pose

Transform the clothing to medieval armor while preserving
exact facial features and expression
```

### Kontext Tips
- Be specific, not vague ("change to red" vs "make it better")
- Avoid pronouns - always reference "the woman with black hair"
- Work incrementally for complex edits
- Kontext understands context - describe changes only

## Quick Reference Templates

### Product Photography
```
Professional product photo of [PRODUCT],
centered on [SURFACE], bright studio lighting,
soft shadows, clean white background,
ultra-realistic, sharp focus, commercial quality
```

### Portrait
```
Portrait of [SUBJECT DESCRIPTION],
[EXPRESSION], [POSE], studio headshot,
85mm lens f/1.8, soft diffused key light,
subtle rim light, neutral backdrop, natural skin
```

### Landscape
```
[SCENE DESCRIPTION], [TIME OF DAY],
[WEATHER/ATMOSPHERE], sweeping vista,
shot on medium format camera,
[STYLE: photorealistic/painterly/etc]
```

### Abstract/Artistic
```
Abstract composition featuring [ELEMENTS],
[COLOR PALETTE], [MOVEMENT/FLOW],
[ART STYLE], museum quality fine art
```

## Further Reading

- See [references/style-gallery.md](references/style-gallery.md) for 50+ tested style prompts
- See [references/product-templates.md](references/product-templates.md) for e-commerce prompts
- See [references/troubleshooting.md](references/troubleshooting.md) for fixing common issues
