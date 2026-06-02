# metafill

Fill your App Store metadata in every App Store language, fast.

metafill is a local tool for indie and solo Apple developers who don't want to
translate App Store metadata by hand for dozens of locales. You write your
English listing once, machine-translate it into every App Store language, review
it, and upload it straight to your App Store Connect draft. It runs on your own
machine with your own keys (BYOK), and sends nothing to any poTeam server.

> **Honest scope:** metafill is a fast first pass that fills every locale in
> minutes. It is not a substitute for proper per-market ASO keyword research -
> machine-translated keywords may not rank as well as a native speaker's, so
> review the markets that matter most before shipping. For the long tail of
> locales, a solid machine translation beats leaving them in English.

## Features

- Manage multiple apps (iOS, macOS, tvOS), each with its own metadata folder.
- Every App Store locale in one place, with per-locale status (reviewed,
  translated, empty, missing, over-limit).
- Limit-aware editing of name, subtitle, keywords, description, promotional
  text, and release notes.
- Seed your source from the public App Store or sync from App Store Connect.
- Machine-translate with your choice of provider: Anthropic (Claude), OpenAI, or
  Google (Gemini) - or import JSON from any other model.
- Review per locale, then publish to your App Store Connect draft. metafill
  never submits for review; you do that yourself.
- Export your config to share with teammates (keys are never included).

## Documentation

- [Getting started](docs/getting-started.md) - install, set up keys, first run.
- [Interface guide](docs/interface.md) - every screen and button explained.
- [Command-line usage](docs/cli.md) - the npm scripts and bring-your-own-model
  translation.
- [Roadmap](docs/roadmap.md) - ideas and planned work.

## Quick start

```bash
git clone https://github.com/elpofigisto/metafill.git
cd metafill
npm install
npm run dev
```

Open the URL it prints, then follow [Getting started](docs/getting-started.md)
to add your keys and your first app.

## Your keys stay yours

metafill is BYOK and runs entirely on your machine. It talks directly to Apple's
App Store Connect API and to your chosen AI provider using keys you supply. No
backend, no telemetry, no proxy, nothing sent to poTeam. Your `.p8` key, `.env`,
and `apps.config.json` are git-ignored and never leave your computer; config
export omits every key.

## Contributing

Pull requests are welcome. metafill is a small Next.js app with dependency-light
Node scripts under `app/`, `components/`, `lib/`, and `scripts/`.

## License

MIT. See [LICENSE](LICENSE). Copyright 2026 Oleksandr Kozlovskyi (poTeam).

## Support

If metafill saves you time, you can [buy me a coffee](https://buymeacoffee.com/poteam).

## Other things I make

- Boomkey - https://boomkey.pro
- Hush - https://apps.apple.com/app/id6757990863
- Tidyshot - https://apps.apple.com/us/app/tidyshot-screenshot-organizer/id6758950886
- poteam.pro - https://poteam.pro
