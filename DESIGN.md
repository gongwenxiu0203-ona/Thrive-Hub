---
name: Thrive Hub
description: A clear operational console for alliance-marketing work.
colors:
  operational-purple: "#6d55e8"
  operational-purple-deep: "#5d43d4"
  focus-lilac: "#d6beff"
  canvas: "#fbfaff"
  panel: "#ffffff"
  ink: "#334155"
  muted: "#6b7280"
  line: "#e7e0ef"
  line-strong: "#dcd4e7"
  danger: "#e11d48"
typography:
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "1rem"
    fontWeight: 600
    lineHeight: 1.5
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.25
rounded:
  sm: "6px"
  md: "8px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.operational-purple}"
    textColor: "{colors.panel}"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
    typography: "{typography.label}"
    height: "36px"
  button-secondary:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "8px 14px"
    typography: "{typography.label}"
    height: "36px"
  input:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    padding: "8px 12px"
    typography: "{typography.body}"
    height: "40px"
---

# Design System: Thrive Hub

## Overview

**Creative North Star: "The Clear Operations Console"**

Thrive Hub is a restrained operational workspace: calm enough for sustained daily use, dense enough for real work, and predictable across modules. Visual hierarchy comes from spacing, typography, tonal surfaces, and explicit state—not decoration. Desktop supports full workflows; mobile prioritizes review, approval, and quick actions.

The system rejects decorative SaaS dashboards, consumer-style oversized controls, inconsistent legacy-admin patterns, and desktop layouts merely squeezed onto phones.

**Key Characteristics:**
- Professional, clear, and efficient.
- Flat by default, layered only when interaction requires it.
- One component vocabulary across customers, contracts, projects, finance, and BI.
- Accessible focus, status, and responsive behavior.

## Colors

Operational Purple carries primary action and current selection; pale lilac-gray surfaces organize the workspace without visual noise.

### Primary
- **Operational Purple:** Primary actions, active navigation, selected tabs, and focus-related emphasis.
- **Deep Operational Purple:** Hover and pressed states only.

### Neutral
- **Quiet Canvas:** Application background and sidebar base.
- **White Panel:** Forms, tables, modal surfaces, and content panels.
- **Slate Ink:** Primary body and data text.
- **Operational Muted:** Supporting labels and metadata; never use where contrast falls below AA.
- **Lilac Line:** Borders and dividers that establish structure without shadow.

**The One Accent Rule.** Purple communicates action, selection, or focus. It is never ambient decoration.

## Typography

**Display Font:** System sans stack
**Body Font:** System sans stack

**Character:** Familiar, compact, and highly legible in Chinese and English. One family prevents visual fragmentation across dense operational screens.

### Hierarchy
- **Headline** (600, 20–24px): Page titles only.
- **Title** (600, 16px): Modal, panel, and section titles.
- **Body** (400, 14px): Forms, tables, and operational copy.
- **Label** (500–600, 12–14px): Buttons, field labels, tabs, and metadata.

**The Working Scale Rule.** Product headings remain fixed and compact; fluid display typography is prohibited.

## Elevation

The system is flat by default. Canvas, panel color, and borders create depth. A restrained shadow is reserved for modal surfaces and floating menus; cards at rest do not combine wide shadows with borders.

**The Flat-by-Default Rule.** If a static content panel needs a shadow to be understood, its structure is wrong.

## Components

### Buttons
- **Shape:** Gently curved rectangle (6px), never oversized pills for standard actions.
- **Primary:** Operational Purple with white text; one primary action per action group.
- **Hover / Focus:** Deep Purple on hover; visible two-pixel focus ring with offset.
- **Secondary / Ghost:** White bordered secondary and tonal ghost variants; danger uses rose only for destructive actions.
- **Mobile:** Primary touch targets are at least 44px high.

### Cards / Containers
- **Corner Style:** Restrained (8px).
- **Background:** White panel over Quiet Canvas.
- **Shadow Strategy:** None at rest; modal-only elevation.
- **Border:** One-pixel Lilac Line.
- **Internal Padding:** 16–24px, reduced deliberately on compact mobile summaries.

### Inputs / Fields
- **Style:** White background, one-pixel strong line, 6px radius, 40px desktop height.
- **Focus:** Purple border and pale focus ring; focus is never indicated by color alone.
- **Error / Disabled:** Text plus semantic color; disabled state remains readable.

### Navigation
- Desktop uses a persistent grouped sidebar. Mobile uses a dismissible navigation drawer and compact top bar. Active state combines tint, text color, and a structural indicator. All navigation controls expose accessible names and 44px touch targets on mobile.

### Modal
- Shared overlay, header, title, close control, scroll region, and footer alignment.
- Escape closes when safe; opening moves focus inside and closing restores focus.
- Mobile modals become near-full-height sheets with actions kept reachable.

## Do's and Don'ts

### Do:
- **Do** use Operational Purple only for primary action, current selection, and focus.
- **Do** preserve desktop information density while restructuring mobile around review and quick actions.
- **Do** provide default, hover, focus, active, disabled, loading, and error states.
- **Do** use the shared Modal and button vocabulary before creating local variants.

### Don't:
- **Don't** build decorative SaaS dashboards that prioritize visual effects over operational clarity.
- **Don't** use consumer-style oversized controls, excessive empty space, or playful motion that slows frequent tasks.
- **Don't** ship dense legacy-admin patterns with inconsistent buttons, improvised modal layouts, weak hierarchy, or hidden states.
- **Don't** shrink desktop tables and complex forms onto mobile without prioritizing review and quick actions.
- **Don't** combine a one-pixel border with a wide decorative shadow, use glassmorphism by default, or over-round panels beyond 16px.
