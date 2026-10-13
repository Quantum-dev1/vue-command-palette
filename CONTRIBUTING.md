# Contributing

Thanks for taking the time to contribute!

## Setup

```bash
npm install
npm run dev        # demo app with hot reload
```

## Before opening a pull request

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

All four run in CI on every pull request.

## Guidelines

- Keep the library free of runtime dependencies (only the `vue` peer dependency).
- Put framework-agnostic logic in `src/core/` and cover it with unit tests.
- Component behaviour changes need a test in `tests/CommandPalette.spec.ts`.
- Keep accessibility intact: ARIA roles, keyboard support and focus management are part of the public contract.
- If you change visuals, regenerate the README media with `npm run screenshot`.
- Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages (`feat:`, `fix:`, `docs:` …).

## Reporting bugs

Please include the library version, Vue version, browser, and a minimal reproduction (a StackBlitz link is ideal).
