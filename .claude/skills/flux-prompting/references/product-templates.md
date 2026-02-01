# Product Photography Templates

Ready-to-use prompt templates for e-commerce, marketing, and commercial product imagery.

## Contents
- [White Background (E-commerce)](#white-background-e-commerce)
- [Lifestyle & Context](#lifestyle--context)
- [Hero Shots](#hero-shots)
- [Category-Specific Templates](#category-specific-templates)
- [Transparent Background Workflow](#transparent-background-workflow)

---

## White Background (E-commerce)

### Standard Product Shot
```
Professional product photo of [PRODUCT],
centered on pure white seamless background,
bright even studio lighting, soft diffused shadows,
sharp focus throughout, commercial e-commerce quality,
Amazon/Shopify marketplace ready
```

### Multi-Angle Product
```
[PRODUCT] photographed at 3/4 angle view,
pure white background, consistent studio lighting,
product details clearly visible, no harsh shadows,
professional catalog photography
```

### Product with Subtle Shadow
```
[PRODUCT] floating on white background,
soft drop shadow beneath for depth,
clean product isolation, even lighting,
professional packshot quality
```

**Important for FLUX.1 [dev]:** Use "clear background" or "seamless backdrop" instead of "white background" to avoid blur issues.

---

## Lifestyle & Context

### In-Use Lifestyle
```
[PRODUCT] being used by [PERSON DESCRIPTION],
natural home/outdoor environment,
authentic candid moment, soft natural lighting,
lifestyle photography, Instagram-worthy aesthetic
```

### Flat Lay Composition
```
Flat lay arrangement featuring [PRODUCT] as hero,
complementary props and accessories,
clean marble/wood/fabric surface,
overhead view, styled product photography,
Pinterest-worthy composition
```

### Environmental Context
```
[PRODUCT] in natural setting that suggests its use,
environmental storytelling, mood lighting,
premium brand aesthetic, editorial quality,
aspirational lifestyle imagery
```

---

## Hero Shots

### Dramatic Hero
```
Hero product shot of [PRODUCT],
dramatic directional lighting from [DIRECTION],
dark moody background with subtle gradient,
premium luxury aesthetic, advertising quality,
sharp focus with beautiful bokeh
```

### Floating/Levitation
```
[PRODUCT] floating/levitating against [BACKGROUND],
dynamic angle, sense of motion,
clean isolation, dramatic rim lighting,
high-end advertising campaign quality
```

### Macro Detail
```
Extreme close-up macro shot of [PRODUCT],
revealing texture and material quality,
shallow depth of field, precise focus on [DETAIL],
premium craftsmanship visible
```

---

## Category-Specific Templates

### Electronics/Tech
```
Sleek technology product shot of [DEVICE],
minimal gradient background (dark gray to black),
subtle reflections on surface beneath,
clean modern aesthetic, Apple-inspired quality,
precise lighting showing screen/details
```

### Fashion/Apparel
```
Fashion product photography of [GARMENT],
on invisible mannequin/ghost mannequin effect,
fabric texture and drape visible,
professional apparel photography,
clean white background, e-commerce ready
```

### Jewelry
```
Luxury jewelry photography of [PIECE],
dramatic lighting with sparkle highlights,
reflective surface beneath, dark gradient background,
macro detail showing craftsmanship,
precious metal and gem reflections
```

### Food & Beverage
```
Appetizing food photography of [ITEM],
hero lighting from [ANGLE], steam/freshness visible,
complementary garnish and props,
shallow depth of field, appetite appeal,
restaurant/cookbook quality
```

### Cosmetics/Beauty
```
Luxury cosmetics photography of [PRODUCT],
glossy reflective surfaces, color-accurate,
gradient background matching brand colors,
perfect product form, premium beauty brand aesthetic
```

### Furniture/Home
```
Furniture product shot of [ITEM],
room context with complementary decor,
natural window lighting, warm inviting atmosphere,
interior design magazine quality,
scale reference visible
```

### Automotive/Parts
```
Automotive product photography of [PART/ACCESSORY],
dramatic industrial lighting, metallic reflections,
technical precision visible, dark background,
performance/quality emphasis
```

### Skincare/Wellness
```
Clean skincare product photography of [PRODUCT],
natural botanical props, soft diffused lighting,
fresh water droplets optional, minimal aesthetic,
wellness brand quality, calming mood
```

---

## Transparent Background Workflow

### Step 1: Generate Clean-Edge Image

**Option A - Game Asset Style (Best for clean edges):**
```
[PRODUCT DESCRIPTION], game asset style,
clear isolated background, centered in frame,
full object visible, sharp clean edges,
even studio lighting, no background shadows
```

**Option B - Product Cutout Style:**
```
[PRODUCT] product cutout,
isolated on seamless light gray background,
professional studio lighting, soft shadows under product only,
complete object visible, packshot quality
```

**Option C - For FLUX.1 [schnell] (supports white bg):**
```
[PRODUCT] isolated on pure white background,
product photography, even diffused lighting,
no shadows on background, sharp focus,
high detail, clean isolation
```

### Step 2: Background Removal

After generating, process through:
1. **Flux Background Remover** (fluxai.pro/background-remover)
2. **Remove.bg** (remove.bg)
3. **Photoshop/GIMP** manual masking

### Tips for Best Cutout Results
- Generate at minimum 1024x1024 resolution
- Ensure complete object is visible (no cropping)
- Avoid complex transparency (glass, mesh)
- Request "sharp edges" or "clean edges"
- Light gray backgrounds mask easier than pure white

---

## Batch Generation Tips

### Consistent Series
When generating multiple products in a series:
1. Use identical lighting descriptions
2. Maintain same background style
3. Keep camera angle consistent
4. Use same aspect ratio
5. Save prompts as templates with `[PRODUCT]` placeholder

### A/B Testing Variants
Generate multiple versions for testing:
- Vary background (white vs lifestyle)
- Test different angles (front, 3/4, side)
- Compare lighting (soft vs dramatic)
- Try with/without props
