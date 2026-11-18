# Documentation index

Source baseline `0313f00`, reviewed 18 November 2026. Version 3.1.5 is read from package/config, not a claim about the currently published npm artifact.

- [HLD](architecture-hld.md): system boundaries, components, dependencies and trust.
- [LLD](architecture-lld.md): tool endpoints, session data, limits and error contracts.
- [Operational how-to](operations.md): safe verification, startup diagnosis, history lifecycle and change procedure.
- [Verification](verification-2026-11-18.md): checks actually run and acceptance gaps.
- [Agent integration](agent-integration.md): subprocess consumer example.
- [Security policy](../SECURITY.md), [change log](../CHANGELOG.md).

The documents under `superpowers/plans/` and `superpowers/specs/` describe dated design work. They are not evidence of current runtime acceptance. Update active documentation alongside code changes; link each changed contract to a test and dated verification. Keep progress/decisions in Linear, implementation truth in reviewed Git. Do not commit prompts, chat history, credentials or private host details as examples.
