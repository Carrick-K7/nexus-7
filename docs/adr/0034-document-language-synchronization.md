# ADR-0034: Synchronize the document language

**Status:** Accepted for v4.8.6 on 2026-08-01.

## Context

The interface persisted its English/Chinese choice and translated visible
content, but the server-rendered root kept `lang="en"`. After switching to
Chinese, assistive technology could therefore select English pronunciation
rules for Chinese content. Automated axe checks only proved that the declared
language was syntactically valid; they could not prove that it matched the
active application language.

## Decision

The client shell owns both persisted display preferences. In the same layout
effect that applies the selected color scheme, it sets the root document
language to `en` or `zh-CN`. The browser contract checks the attribute after a
language switch and again after reload, when persisted state is rehydrated.

## Consequences

- Visible language and assistive-technology pronunciation remain aligned.
- The initial server document stays English and becomes Chinese before paint
  when a persisted Chinese preference is hydrated.
- This changes presentation metadata only; city settlement, persistence,
  public API contracts and trust-lane status are unchanged.
