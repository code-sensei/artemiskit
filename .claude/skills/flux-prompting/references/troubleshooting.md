# Flux Troubleshooting Guide

Solutions to common problems when generating images with Flux models.

## Contents
- [Blurry/Fuzzy Output](#blurryfuzzy-output)
- [Wrong Style/Aesthetic](#wrong-styleaesthetic)
- [Text Rendering Issues](#text-rendering-issues)
- [Composition Problems](#composition-problems)
- [Color Issues](#color-issues)
- [Consistency Problems](#consistency-problems)
- [Technical Errors](#technical-errors)

---

## Blurry/Fuzzy Output

### Problem: White background causes blur in FLUX.1 [dev]

**Cause:** Known issue with FLUX.1 [dev] variant when "white background" is in prompt.

**Solutions:**
1. Use FLUX.1 [schnell] instead (not affected)
2. Replace "white background" with:
   - "clear background"
   - "seamless light backdrop"
   - "isolated, clean background"
   - "game asset style"
3. Use light gray instead: "soft gray (#f5f5f5) background"

### Problem: Overall soft/blurry image

**Causes & Solutions:**

| Cause | Solution |
|-------|----------|
| Too few steps | Increase to 25-30 steps (dev) |
| Resolution too high | Stay at 1920x1080 or below |
| Guidance too low | Increase guidance_scale to 3.5-4 |
| Vague prompt | Add specific details, camera settings |

**Add to prompt:**
```
sharp focus, high detail, crisp edges,
professional quality, 8K resolution
```

### Problem: Faces/hands are distorted

**Solutions:**
1. Add explicit quality markers:
   ```
   detailed realistic face, natural proportions,
   anatomically correct hands, five fingers
   ```
2. Use portrait-specific settings:
   ```
   professional portrait photography,
   85mm lens, catchlights in eyes
   ```
3. Generate at higher resolution, crop in post

---

## Wrong Style/Aesthetic

### Problem: Getting photorealistic when wanting illustration

**Cause:** Flux defaults to photorealism unless actively directed otherwise.

**Solution:** Double-specify the style:
```
[Subject], illustration style, digital art,
NOT a photograph, painted quality,
visible artistic brushstrokes/linework
```

### Problem: "In the style of X" not working

**Cause:** Simple style references often ignored.

**Solution:** Use verbose technique description:
```
[Subject], Van Gogh art style, Van Gogh inspired,
thick impasto brushstrokes, swirling dynamic movement,
bold saturated yellows and blues,
post-impressionist painting technique
```

### Problem: Inconsistent style across generations

**Solutions:**
1. Use fixed seed for testing style variations
2. Create detailed style description, save as template
3. Include specific technique descriptors, not just artist names

---

## Text Rendering Issues

### Problem: Text is garbled/misspelled

**Solutions:**
1. Always use quotation marks:
   ```
   The text "HELLO WORLD" appears on the sign
   ```
2. Keep text short (1-3 words optimal)
3. Describe typography explicitly:
   ```
   "OPEN" in bold sans-serif capital letters,
   clearly legible, professional typography
   ```
4. Use FLUX.2 for better text (superior text rendering)

### Problem: Text appears in wrong location

**Solution:** Be explicit about placement:
```
The text "SALE" appears centered at the top of the image,
positioned above the main subject,
large prominent lettering
```

### Problem: Text is too small/large

**Solution:** Specify relative size:
```
Large prominent text "WELCOME" taking up
approximately 30% of the image width,
bold eye-catching lettering
```

---

## Composition Problems

### Problem: Subject is cropped/cut off

**Solutions:**
1. Explicitly request full visibility:
   ```
   full body visible, complete subject in frame,
   no cropping, entire object shown
   ```
2. Specify framing:
   ```
   subject centered with generous margins,
   breathing room around edges
   ```
3. Use appropriate aspect ratio for subject

### Problem: Cluttered/busy composition

**Solutions:**
1. Request negative space:
   ```
   minimal composition, clean negative space,
   uncluttered background, simple arrangement
   ```
2. Reduce elements:
   ```
   single subject focus, no distracting elements,
   minimalist aesthetic
   ```

### Problem: Wrong perspective/angle

**Solution:** Be explicit about camera position:
```
eye-level frontal view
overhead bird's eye view
low angle looking up
3/4 angle from upper right
worm's eye view from ground
```

---

## Color Issues

### Problem: Colors don't match specification

**Solutions:**
1. Use hex codes for precision:
   ```
   vibrant orange (#FF6B35) background,
   deep navy blue (#1E3A5F) text
   ```
2. Describe color relationships:
   ```
   complementary color scheme,
   warm sunset palette with oranges and purples
   ```

### Problem: Colors are washed out/dull

**Add to prompt:**
```
vibrant saturated colors, rich color depth,
high color contrast, vivid palette
```

### Problem: Color cast/tint on image

**Solutions:**
1. Specify neutral lighting:
   ```
   color-accurate lighting, neutral white balance,
   no color cast, true-to-life colors
   ```
2. Describe the lighting temperature:
   ```
   5500K daylight balanced lighting
   ```

---

## Consistency Problems

### Problem: Character looks different each generation

**Solutions:**
1. Use extremely detailed character description:
   ```
   [Name], a 30-year-old woman with shoulder-length
   wavy auburn hair, green eyes, light freckles
   across nose and cheeks, oval face shape,
   wearing [specific outfit description]
   ```
2. Use same seed when testing variations
3. Consider Flux Kontext for editing existing images

### Problem: Product varies between shots

**Solution:** Create detailed product spec:
```
[Product exact name], [material/color],
[specific dimensions/proportions],
[distinctive features], [brand elements]
```

### Problem: Environment/setting inconsistent

**Solution:** Lock down environment details:
```
Same setting as reference: modern minimalist
white room, light gray hardwood floors,
large window on left side providing natural light,
single green plant in white ceramic pot
```

---

## Technical Errors

### Problem: Generation fails/times out

**Solutions:**
1. Reduce resolution (try 1024x1024)
2. Simplify prompt (under 500 tokens)
3. Reduce steps (try 20)
4. Check API rate limits

### Problem: Prompt too long error

**Solutions:**
1. Prioritize essential details at start
2. Remove redundant descriptions
3. Consolidate similar adjectives
4. Maximum ~500 tokens supported

### Problem: NSFW filter triggered incorrectly

**Solutions:**
1. Use clinical/professional terminology
2. Avoid words that could be misinterpreted
3. Add context indicating legitimate use:
   ```
   medical illustration, educational diagram,
   professional healthcare context
   ```
4. Adjust safety_tolerance if available (API)

---

## Quick Fixes Checklist

When results are poor, try these in order:

1. [ ] Move key subject to prompt start
2. [ ] Add specific style descriptors
3. [ ] Include camera/technical specs
4. [ ] Specify lighting explicitly
5. [ ] Increase steps to 25-30
6. [ ] Set guidance_scale to 3.5
7. [ ] Try different seed
8. [ ] Reduce resolution if quality suffers
9. [ ] Remove conflicting descriptors
10. [ ] Simplify to core elements, rebuild

---

## Model Selection Guide

| Scenario | Recommended Model |
|----------|-------------------|
| Fast iteration/testing | FLUX.1 [schnell] |
| Quality results | FLUX.1 [dev] |
| Text in images | FLUX.2 [pro/max] |
| White backgrounds | FLUX.1 [schnell] |
| Image editing | FLUX Kontext |
| Maximum quality | FLUX.2 [max] |
| Production/commercial | FLUX.1 [pro] or FLUX.2 |
