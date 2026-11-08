# Dependency updates and security alerts

Project npm defaults save caret ranges (`save-exact=false`, `save-prefix=^`). npm manifests use compatible version ranges, while the committed lockfile records exact resolutions for reproducible `npm ci` installs. Existing SDK `latest` policies remain explicit. Dependabot can also update exact pins; ranges alone do not repair a vulnerable locked or nested dependency.

## Update policy

- npm version updates run daily. Patch/minor updates are grouped separately from major updates, and the Claude Agent SDK stays outside those groups for manual review. Five version-update PRs can coexist; GitHub manages security-update limits separately.
- Security updates remain enabled and visible. Compatible npm PRs retain the existing checked-head auto-merge policy. The workflow explicitly excludes Python and GitHub Actions updates from automatic merging; npm CI does not establish model compatibility.
- Python monitoring covers the Pocket TTS, Kokoro and Ming requirement directories, including the Chinese requirements file. Ming's custom model-preparation `setup.py` is excluded from package-metadata discovery. These updates require manual review.
- GitHub Actions updates run weekly and require manual review.
- Multiplane reports its installed package version in contracts/readiness metadata instead of a frozen source constant. Its tests retain lockfile integrity and shared Three.js checks without rejecting compatible version ranges.
- The lockfile stays committed. Do not replace compatible ranges with unrestricted wildcards or delete it to silence an alert.

## Targeted remediation

- `@fastify/static` starts at 10.1.10 so its native dependency chain supports patched glob/minimatch versions.
- Remotion and its CLI start at 4.0.541 together, removing their vulnerable nested Zod versions.
- HyperFrames still requests an older exact Undici version upstream. Its scoped override allows patched Undici 7.30.1+ within major 7.
- KaTeX's override allows 0.18.2+ within the 0.18 family because existing math/diagram parents constrain it to a vulnerable 0.16 family. Check real math/diagram rendering when updating it; remove this override when parents support a fixed version natively.
- The Remotion bundler's Webpack override preserves the previously installed 5.112.2 floor instead of accepting the newer bundler's older exact dependency. It allows compatible major-5 upgrades. Remove it when the upstream requirement reaches that floor.

The Chinese Pocket TTS requirements allow compatible library upgrades and require PyTorch 2.13.0+ within major 2 to cover the three reported PyTorch advisories. Current PyTorch metadata requires Python 3.11+. This changes future dependency resolution; it does not replace or certify an already installed speech environment. Rebuild it with the setup command and verify the pinned Mandarin adapter/checkpoint before relying on synthesis. Model/code revisions and dependency-library version policies are separate contracts.

## Dismissal policy

Keep an alert open while a reachable or potentially relevant vulnerable dependency remains. A lower severity, development scope or lack of a fix alone does not establish that it is safe to dismiss. Dismiss only with package/advisory-specific evidence and a recorded reason, such as a verified false-positive dependency match or proof that the vulnerable functionality is not used. Accepted risk is a separate documented decision. Do not add blanket ignores or disable security updates to reduce the alert count.

Changes must reach the repository's default branch before GitHub can rescan and close its alerts. A clean npm audit applies to the resolved JavaScript tree and currently known npm advisories; it does not audit Python environments or certify arbitrary downloaded model code.
