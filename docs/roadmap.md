# Roadmap

Ideas for where metafill could go. Nothing here is a promise or a dated
commitment - it's a list of things that would make the tool more useful, roughly
in order of how often they'd help. Feedback and PRs are welcome.

## Translation quality

- **Do-not-translate glossary** - keep brand names, feature names, and specific
  terms identical across every locale.
- **Keyword helpers** - per-locale keyword density and duplicate detection, and
  warnings when keywords overlap the name/subtitle.
- **Review diffs** - show what changed since the last reviewed version of a
  locale, so re-reviews are quick.
- **Re-translate a single field** - regenerate just one field instead of the
  whole locale.

## Providers and models

- **More providers and local models** - e.g. an Ollama / local-model option for
  fully offline translation.
- **Per-field model choice** - a cheaper model for keywords, a stronger one for
  descriptions.

## Workflow

- **Multi-app bulk operations** - translate or publish across several apps at
  once.
- **Optional submit-for-review** - an explicit, opt-in flag to submit after
  publishing (off by default, since metafill never submits today).
- **Screenshots** - manage and order localized screenshots alongside text.
- **Live output in the web UI for App Store Connect sync** - same streaming the
  CLI already has.

## Project

- **Tests and CI** - a small test suite for the lib functions and a CI check on
  PRs.
- **GitHub Action** - run translate/publish from a workflow.

If one of these matters to you, open an issue and say so - it helps prioritize.
