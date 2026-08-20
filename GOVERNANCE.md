# Project Governance

## Maintainer responsibility

Maintainers decide releases, scope, architecture, dependency updates, and security responses using the published specifications and quality gates.

## Decision order

1. Chess correctness
2. User data safety
3. Shell stability and security
4. Accessibility and usability
5. Performance
6. Visual polish
7. Feature breadth

## Architecture changes

A meaningful boundary change requires an ADR. Examples:

- Replacing the rules authority
- Adding a network service
- Bundling an engine
- Changing persistence technology
- Adding a compiled helper
- Changing plugin kinds

## Release authority

A release cannot proceed with a failing required gate. Maintainers may defer a feature but may not waive known legality or data-loss defects.

## Contributions

Contributions are reviewed through pull requests. No contributor gains authority solely through volume of commits; responsibility follows sustained, safe participation.

## Conflicts

When documentation conflicts with tested behavior, resolve the discrepancy in
the same pull request and preserve chess correctness, data safety, and public
compatibility in that order.
