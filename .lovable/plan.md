# DEP Admin Portal — Build Plan

A calm, professional back-office for MetLife Legal Plans staff. No auth; a role switcher in the top bar (Admin only for now, extensible). Opens straight into Admin.

## Look & feel (matches estate-genius-studio)
- Warm paper background (#F7F2E9-ish), white rounded cards, soft shadows
- Deep evergreen primary + soft evergreen tint, sparing gold accent
- Serif display headings (e.g. Fraunces), clean sans body (Inter)
- Left sidebar workspace, top bar with role switcher + autosave chip
- Restrained motion, generous spacing

## App shell
- Left sidebar: brand lockup + 4 modules
  1. Template Management
  2. Question Management
  3. Recommendation Rules
  4. FAQ & Content
- Top bar: role switcher dropdown ("Admin"), service scope filter, autosave chip ("All changes saved · 2s ago")
- `/` redirects to `/templates`

## Shared tagged configuration model (core principle)
One shared bank of items, each tagged with one or more services:
`common | will | trust | poa | healthcare | bundle`

Tables (single source of truth, no per-document silos):
- `attributes` — canonical facts (e.g. `full_legal_name`, `spouse_name`), typed, tagged
- `questions` — prompts that map to attributes, tagged, ordered, with branching
- `answer_options` — for select/multi
- `routing_rules` — conditional show/skip logic across questions
- `recommendation_rules` — "if X then recommend document Y"
- `content_assets` — FAQs, explainer copy, tooltips
- `templates` — document templates referencing attributes via merge fields
- `tags` — the service taxonomy

Every list/editor supports filtering by tag; the top-bar service scope is a filter over the shared model, not a separate dataset. Bundles compose subsets and dedupe by attribute id.

## Four modules

### 1. Template Management
- Grid of templates (Will, Revocable Trust, POA, Healthcare Directive, …)
- Detail view: rich text template body, merge-field picker sourced from `attributes`, tag chips, version list
- Upload source doc to Storage; AI "Extract merge fields" edge function suggests attribute mappings — admin reviews, edits, approves before save
- Autosave draft; explicit "Publish version"

### 2. Question Management
- Sortable list of questions filtered by tag
- Editor: prompt, help text, input type, mapped attribute, answer options, tags (multi), routing rules
- AI "Rewrite for clarity" and "Suggest follow-ups" — admin edits & approves
- Preview panel shows the question as members will see it

### 3. Recommendation Rules
- Rule list: `IF <conditions on answers/attributes> THEN recommend <documents>`
- Visual condition builder (attribute, operator, value; AND/OR groups)
- Test sandbox: enter sample answers → see recommended documents
- AI "Explain this rule in plain English" for QA

### 4. FAQ & Content
- Library of FAQs and content snippets, tagged
- Rich text editor, category, tags, published toggle
- AI "Draft FAQ from topic" and "Improve answer" — admin approves

## AI pattern
Every AI action calls a Supabase edge function (`ai-generate`) with the LOVABLE_API_KEY server-side using `google/gemini-3-flash-preview`. Response is shown in a review dialog with editable text and Approve / Discard. Nothing is written to the DB until the admin approves.

## Data & infra
- Supabase (Lovable Cloud): Postgres for the shared model, Storage bucket `template-sources` for uploads, edge function for AI
- RLS: since there's no auth yet, tables use permissive policies scoped by a `role` header the client sends (Admin). Structured so real auth + roles can be layered in later without schema change (a `user_roles` table + `has_role()` helper is stubbed).
- Autosave via debounced mutations; toast + top-bar chip reflect state

## Extensibility for future roles
- Role switcher reads from a `roles` enum; UI gates behind `useRole()` hook
- Adding "Reviewer", "Content Editor", etc. later = add enum value + policies; no component rewrite

## Phase 1 deliverable (this build)
- Full shell, theme, sidebar, top bar, role switcher, autosave chip
- Backend: schema, seed tags & sample data, edge function
- Template Management, Question Management, Recommendation Rules, FAQ & Content — all four modules functional with CRUD, tag filtering, AI-assist w/ approval, autosave

Explicit non-goals for phase 1: real auth, publish workflow to member app, PDF rendering of templates, analytics, audit log UI (rows are timestamped in DB for later).
