---
name: redesign-skill
description: >-
  Diagnostic and surgical redesign skill. Audits existing web interfaces to identify repetitive patterns,
  cluttered elements, and generic templates, applying non-destructive visual upgrades
  without altering underlying functionality or business logic.
---

# Redesign Skill (Audit & In-Place Upgrade)

A specialized methodology for auditing and elevating existing production codebases without breaking architectural contracts, routing, state management, or existing test suites.

## 3-Phase Execution Method

1. **Scan & Inventory:**
   - Map existing files, styling systems (Tailwind, CSS Modules, CSS variables), and component boundaries.
   - Detect hardcoded arbitrary values or legacy color tokens.
2. **Diagnostic Audit:**
   - Check contrast ratios across all surfaces.
   - Verify that semantic operational indicators (healthy, running, quarantine, error) remain instantly recognizable.
   - Pinpoint visual drift between the approved design reference and the live rendered code.
3. **Surgical Upgrade:**
   - Apply minimal, atomic modifications.
   - Strictly avoid structural DOM churn or refactoring working components.
   - Preserve all data-testid attributes, event handlers, and API integrations.
