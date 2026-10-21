---
name: frontend-design
description: >-
  Official Anthropic skill for distinctive, intentional visual design when building new UI
  or reshaping an existing one. Eliminates generic template defaults (purple gradients, cookie-cutter layouts),
  enforcing deliberate typography, color palettes, and art direction grounded in the subject matter.
---

# Frontend Design

Approach this as the design lead at a design studio known for giving every client a distinct visual identity that is not mistaken for anyone else's. Reject cliché, templated designs, and make deliberate, opinionated choices about palette, typography, and layout that are specific to this brief.

## Ground your designs in the subject matter

1. **Understand the Subject & Audience:** Identify the product's industry, materials, vernacular, and user base. A data engineering platform (like Midas) requires precision, observability aesthetic, architectural clarity, and institutional trust, completely different from a consumer app.
2. **Incorporate Real Terminology & Metrics:** Use authentic labels, contracts, throughput numbers, and status indicators.

## Design Principles

- **Hero & Key Surfaces:** Open with the most characteristic element in the subject's world (e.g., live pipeline topology, medallion flow, real-time telemetry). Avoid generic cards with gradient accents.
- **Typography as Personality:**
  - Limit typefaces to 1 or 2 clearly distinct families.
  - Set an intentional type scale following *The Elements of Typographic Style*.
  - Use tabular numbers (`font-variant-numeric: tabular-nums`) for data tables, metrics, and timestamps.
  - Avoid tells of generic AI: no single-word colored highlights in headlines, no gratuitous all-caps on every label.
- **Visual Structure is Information:**
  - Borders, dividers, subtle background shifts, and badges encode real semantic states rather than acting as mere decoration.
  - Reserve numbered markers only for genuine sequential steps.
- **Intentional Motion:**
  - Avoid constant spinning or bouncing unless answering a user action or indicating live streaming data.
  - Use subtle pulses for live network signals (e.g., SSE connection dot, pipeline flow particles).

## Process: Plan, Review, Build, Critique

1. **Plan:** Establish the design direction and color tokens before editing code.
2. **Review:** Check contrast ratios (WCAG AA/AAA) and visual hierarchy against the brief.
3. **Build:** Implement cleanly within the existing component stack without introducing unnecessary dependencies.
4. **Critique:** Audit the result to ensure it feels crafted, high-end, and free of "AI slop".
