# Release and automation security

## Checks before distribution

CI runs type checking, tests, and a production build on branch pushes and pull
requests. The release workflow additionally scans the complete fetched Git history
for secrets, runs type checking and tests on Windows, checks the tag against the
package version, and requires that version's changelog entry before packaging.
These workflows provide checks; they do not change repository branch protection or
make the checks mandatory for merges.

A manual **Release** workflow run is an artifact-only smoke test, including when
launched against a tag. It always invokes electron-builder with `--publish never`
and cannot enter the publishing job. A push of a matching `v<package version>` tag
is the publishing trigger. The installer, differential-update blockmap, channel
metadata, and SHA-256 checksum manifest must all be present. The publishing job
has contents-write permission, verifies the transferred assets, creates a draft,
uploads the complete asset set, then publishes. A rerun may finish an existing
draft, but deliberately refuses to overwrite an already published release.

Build and scan jobs have contents-read permission and do not retain checkout
credentials. Official GitHub actions are pinned to full commit SHAs with version
comments. Upgrade pins only after checking the upstream release and commit.

## Unsigned Windows installers

FirstMate's current build configuration does not establish an Authenticode
signing identity. Installers remain unsigned. Release notes disclose this; the
SHA256SUMS.txt file detects accidental or malicious changes relative to that
manifest but cannot prove publisher identity when both are obtained from the
same source. It does not replace signing or justify bypassing a Windows warning.

Before presenting builds as signed, the maintainer must choose and authorize a
code-signing identity/provider, arrange protected access to the signing service,
configure electron-builder, and verify the resulting installer on Windows with
`Get-AuthenticodeSignature` or SignTool. No signing certificate, new credential,
repository permission, or security setting is provisioned by these workflows.
See [electron-builder's signing guidance](https://www.electron.build/code-signing-win.html).

## Weekly EVE static-data updates

The updater always starts from the repository's default branch, regardless of the
branch selected for a manual dispatch. It checks CCP's build number, regenerates
the data, confirms the downloaded archive matches that build, and runs type
checking plus the complete test suite before sharing an artifact with the isolated
branch-publishing job.

The only branch it writes is `automation/update-eve-exploration-data`. Before
writing, it verifies that the validated base has not moved and inspects the remote
branch. Identical validated content is reused. Unexpected non-data changes or
non-bot commits stop the update for manual review; an explicit force-with-lease
protects against concurrent changes. Do not put hand-written work on this reserved
branch. A default-branch change during validation requires rerunning the workflow.

Repository policy disables Actions-created pull requests, so the updater requests
no pull-requests-write permission and never calls the PR creation/edit API. A
successful update means the validated branch is ready, not that a PR exists.
Open the workflow run's summary, follow **Compare changes and open a pull
request**, review the diff, and choose **Create draft pull request**. If GitHub
shows an existing PR, use it rather than creating a duplicate. A human-created PR
can run normal PR checks; Actions-token branch pushes do not trigger new push
workflows by default. Review the updater's validation run as well.

## Automated secret checks

The Secret scan workflow runs on branch pushes, pull requests, a weekly schedule,
manual dispatch, and as a release prerequisite. It uses the standalone
[Gitleaks CLI](https://github.com/gitleaks/gitleaks), pinned to v8.30.1 and the
SHA-256 digest of its official Linux x64 release asset. The digest is embedded in
`scripts/ci/scan-secrets.sh`, verified before extraction/execution, and must be
updated together with the version. It requires no license key, third-party
scanning service, additional token, or write permission.

Run `bash scripts/ci/scan-secrets.sh` on Linux x64 from the repository root for
the same scan. On other platforms, install the official version and run
`gitleaks git --no-banner --redact --log-opts=--all .` after fetching full history.
The scan covers all fetched Git history, not uncommitted work. Scan uncommitted
files separately with `gitleaks dir --no-banner --redact <path>` before committing.

The default rules redact matches in logs and fail on findings or scanner errors.
There is no blanket allowlist or baseline suppressing history. If a real secret
is found, revoke/rotate it first, assess exposure, and coordinate any history
cleanup separately. Never paste the secret into a public issue or log. Review
false positives narrowly instead of disabling the scan. A passing regex-based
scan is a useful check, not a guarantee that every secret has been detected.
