Rule: Never trust the model/agent knowledgebase alone for time-sensitive, important, or critical information. For coding and software engineering changes, always perform live verification (including a web search that explicitly includes the current year, obtained from a terminal command) and document the verification before publishing or applying changes classified as Important or Critical.

Definitions:
- Important change: updates that affect correctness, user guidance, API contracts, developer experience, build/runtime behavior, or expected functionality but do not immediately endanger safety or compliance (e.g., dependency version bumps that may introduce breaking behavior, API response format changes, documentation corrections, CI pipeline updates).
- Critical change: updates that affect security, legal compliance, privacy, production stability, availability, or other high-impact production behavior (e.g., security patches for dependencies with CVEs, changes to auth/permissions, migration of production databases, vulnerability in buildtoolchain, or changes that could corrupt customer data).

Mandatory verification workflow (apply this for every Important or Critical change):
1. Determine change level.
   - If change is Important or Critical, proceed with the full verification workflow.
2. Obtain current year and environment identifiers from trusted terminal commands before searches.
   - Unix/Linux/macOS year: date +%Y
   - UTC year (optional): date -u +%Y
   - Windows PowerShell: (Get-Date).Year
   - Also capture local environment/runtime/tooling versions that are relevant (examples):
     - Git commit and branch: git rev-parse --verify HEAD; git rev-parse --abbrev-ref HEAD
     - Language/runtime versions: node --version, python --version, java -version, go version, ruby -v
     - Package manager versions: npm --version, pip --version, mvn -v, cargo --version
     - Container image digest (if applicable): docker images --digests or inspect image by digest
   - If terminal is unavailable, use a reliable time API and record the API call and response.
   - Record the exact commands and their raw outputs in the verification evidence.
3. Perform web searches that explicitly include the current year and relevant technical context in the query (e.g., "npm audit 2026 lodash prototype pollution 2026", "Kubernetes API deprecation 2026", "OpenSSL CVE 2026").
   - Prioritize authoritative engineering sources: official vendor docs, language or framework maintainers, package registry pages (npmjs.org, pypi.org, crates.io), CVE databases (NVD, MITRE), vendor security advisories, RFCs, and standards bodies.
   - For SDKs, libraries, or tools, search for release notes, migration guides, and deprecation timelines; include the year in the query where relevant.
   - If time-sensitive, add search filters for "last updated", or use site-specific searches (e.g., site:github.com "release" "v1.2.3" OR site:vendor.com "security advisory").
4. Capture and record evidence for each technical claim you will adopt or act on:
   - URL(s) of the authoritative source(s) and the exact page/permalink (release notes, advisory, changelog).
   - Title and last-updated date from the page (if provided).
   - A short quoted excerpt (1–3 lines) showing the relevant fact (e.g., "This release fixes CVE-YYYY-XXXX by ...", "Kubernetes v1.x API deprecated in YYYY").
   - The search query used and the date/time of the search (include the year obtained in step 2).
   - Screenshots, archived snapshots (e.g., web.archive.org), or saved copies of release notes and advisories when feasible for long-term traceability.
   - For code/artifact verification, include commit SHA(s), signed tag, or image digest to unambiguously identify the exact artifact referenced.
5. Cross-validate:
   - Confirm the same fact against at least two independent authoritative sources when possible (e.g., vendor advisory + NVD entry + package registry advisory).
   - For dependency/security issues, verify the CVE entry, the vendor patch note, and the package registry/version metadata.
   - If sources disagree, stop the change, escalate to the appropriate subject-matter owner (security lead, platform engineer, library maintainer), and annotate the disagreement in the change log with the differing evidence.
6. Decision and documentation:
   - Only proceed with the change after evidence meets acceptance criteria (authoritative source(s), cross-validation, and reproducible local verification where applicable).
   - Add a "Verification" section to the changed document, changelog, or PR that lists:
     - Evidence collected (URLs, titles, last-updated dates, quoted excerpts).
     - Terminal command outputs captured for the current year and environment identifiers (commit SHA, runtime versions, image digests).
     - Date/time of verification and the search queries used.
     - A short rationale explaining why the source(s) are trusted and why the chosen remediation or change is appropriate.
   - For code changes, include reproducible steps to validate the fix locally (tests to run, commands, test data) and CI run IDs if automated checks were executed.
7. Changelog entry:
   - For every Important/Critical change, create a changelog item that includes: change level, author, summary, date/time of verification, commands used to obtain current year and environment identifiers, search queries, authoritative URLs, commit SHAs/tags/image digests, and any archived snapshots.
8. Post-deployment monitoring and rollback plan:
   - Define a monitoring and rollout plan before deployment. For Critical changes, use canary/feature-flagged rollouts and automated observability checks (errors, latency, error budgets).
   - Schedule a re-check cadence: Critical: daily for the first week then weekly for the first month; Important: weekly for the first month then monthly for three months.
   - If an authoritative source publishes a newer version, patch, or update, repeat the verification workflow and update the change record and changelog.
   - Ensure a tested rollback or mitigation path (e.g., reverse migration, revert commit, disable feature flag) is documented and immediately available.

Acceptable source guidance:
- Prefer official vendor documentation, package registry advisories, CVE/NVD/MITRE entries, language/framework maintainers' release notes, standards organizations, and scholarly publications for algorithmic/cryptographic claims.
- Avoid relying solely on secondary summaries, social media, Stack Overflow answers, or internal knowledgebase content unless those are supported by primary sources and clearly cited; always link back to the primary source.

Failure protocol:
- If verification cannot be completed prior to an urgent Critical change, block the change and escalate to a human approver (security lead, on-call SRE, or engineering manager). Do not rely on cached or model-only knowledge to approve the change.
- For emergency fixes that must be applied, require post-deployment verification as soon as possible and document the exact rationale, evidence collected after deployment, and the mitigation/rollback plan used.

Automation recommendations:
- Automate retrieval of the current year and insertion into search queries and verification scripts.
- Automate evidence collection in CI/CD: store URLs, capture page metadata and snapshots, record CI run IDs, test results, artifact digests, and link these to the changelog/PR.
- Integrate dependency vulnerability scanning (e.g., SCA tools, npm audit, pip-audit, OWASP Dependency-Check), SBOM generation, signed artifacts, and reproducible builds into pipelines.
- Store verification artifacts and audit logs in an auditable location with access control (artifact repository, secure log store) and tie them to the change request or release ticket.

Always treat the model/agent knowledgebase as a starting point, not a final authority, for time-sensitive, important, or critical engineering information. Follow the workflow above every time such a change is made.
