# Private braces security fork — NOT an upstream release

Maintainer: Carrick-K7/nexus-7. Identity: @carrick-local/braces 3.0.3-carrick.1.
Derived from the SRI-verified npm braces 3.0.3 MIT archive (UPSTREAM.json).
GHSA-vfj7-8cjw-p6xm / CVE-2026-93687 has no upstream fixed release at review.
Runtime patch matches OPEN, UNMERGED micromatch/braces PR88 commit
 a795ee83ecd011131b2d618fe754ac5a8e124dae; this is not upstream endorsement.

The only runtime changes are parser brace/paren stack guards and iterative
DFS-path depth/cycle validation before compile/expand/stringify recursion.
Shared acyclic nodes remain valid. No new lexer, rangeLimit or grammar change.
parse accepts 128 nested opening groups and rejects 129. Walker depth counts
root-to-leaf edges: 128 accepted, 129 rejected; hence a parsed 128-group string
contains a leaf at 129 and walkers reject it (127 groups accepted). Rejection
is SyntaxError, not truncation; maxLength/maxDepth cannot relax this hard bound.
Existing maxLength and rangeLimit remain unchanged.

This vendored dev-only fork is NOT covered as an upstream fixed package by npm
advisories. Full and production npm audits remain mandatory but do not prove
fork security: the source diff, hashes and executable regression gate do.
Remove this fork only after reviewing an upstream fix and rerunning the same
compatibility/security/full application gates. Monitor the upstream advisory.
No application runtime dependency or Next ESLint rule/config is added/removed.

Reproduce: python3 vendor/braces/regenerate.py; then npm ci and npm run check.
The regeneration script verifies upstream SRI, applies SECURITY.patch and
rebuilds fork.tgz deterministically; MANIFEST.json binds all packaged files.
node vendor/braces/verify.mjs verifies both archives, installed bytes, ordinary
syntax differential cases, shared DAGs, depth boundaries and bounded attacks.
Deep 4500-brace stack-exhaustion proof uses explicit 512KiB stack (not default
Node24, which returned normally); direct AST12000/cycles use default stack.
Every attack child has 128MiB heap / 5s timeout / 64KiB output bounds.
