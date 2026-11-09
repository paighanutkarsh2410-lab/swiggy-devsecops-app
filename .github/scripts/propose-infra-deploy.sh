#!/usr/bin/env bash
# Opens a pull request in the infra repo that deploys this commit's images.
#
# Run by CI after the images are scanned, published and signed. It sets the
# image tag and each image's sha256 digest, so the cluster runs exactly the
# bytes CI signed. The infra repo's own CI checks the signatures, and once
# the pull request is merged Argo CD rolls it out.
#
# Usage: propose-infra-deploy.sh <infra-checkout-dir> <commit-sha>
# Needs BACKEND_DIGEST, FRONTEND_DIGEST and PARTNER_DIGEST (sha256:...), and
# GH_TOKEN with Contents and Pull requests write access to the infra repo.
# With DRY_RUN=1 it only edits and shows the diff.
set -euo pipefail

INFRA_DIR="$1"
SHA="$2"
SHORT="${SHA:0:7}"
BRANCH="deploy/app-$SHORT"
VALUES_FILES=(charts/swiggy/values-kind.yaml charts/swiggy/values-aws.yaml)
declare -A DIGESTS=(
  [swiggy-devsecops-backend]="${BACKEND_DIGEST:-}"
  [swiggy-devsecops-frontend]="${FRONTEND_DIGEST:-}"
  [swiggy-devsecops-partner]="${PARTNER_DIGEST:-}"
)

if ! [[ "$SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Expected a full 40-character commit SHA, got: $SHA" >&2
  exit 1
fi
for image in "${!DIGESTS[@]}"; do
  if ! [[ "${DIGESTS[$image]}" =~ ^sha256:[0-9a-f]{64}$ ]]; then
    echo "Expected a sha256 digest for $image, got: '${DIGESTS[$image]}'" >&2
    exit 1
  fi
done

cd "$INFRA_DIR"

# Replace the image tag line, '  tag: "<40 hex characters>"', and each
# '    <image>: "sha256:<64 hex characters>"' digest line in each file.
# The quotes matter: unquoted, YAML reads an all-digit SHA as a number.
for file in "${VALUES_FILES[@]}"; do
  if ! grep -qE '^  tag: "[0-9a-f]{40}"$' "$file"; then
    echo "No quoted image tag line found in $file" >&2
    exit 1
  fi
  sed -i -E "s/^  tag: \"[0-9a-f]{40}\"$/  tag: \"$SHA\"/" "$file"
  for image in "${!DIGESTS[@]}"; do
    if ! grep -qE "^    $image: \"sha256:[0-9a-f]{64}\"$" "$file"; then
      echo "No digest line for $image found in $file" >&2
      exit 1
    fi
    sed -i -E "s/^    $image: \"sha256:[0-9a-f]{64}\"$/    $image: \"${DIGESTS[$image]}\"/" "$file"
  done
done

if git diff --quiet; then
  echo "The infra repo already deploys $SHORT. Nothing to do."
  exit 0
fi

git --no-pager diff --stat
[ "${DRY_RUN:-0}" = "1" ] && { git --no-pager diff; exit 0; }

if gh pr list --head "$BRANCH" --state open --json number --jq '.[0].number' | grep -q .; then
  echo "A pull request for $BRANCH is already open."
  exit 0
fi

git config user.name "swiggy-app-ci"
git config user.email "swiggy-app-ci@users.noreply.github.com"
git switch -c "$BRANCH"
git commit -q -am "Deploy app $SHORT" \
  -m "Images built, scanned, published and signed by swiggy-devsecops-app CI for commit $SHA."
git push -q origin "$BRANCH"

gh pr create \
  --base main \
  --head "$BRANCH" \
  --title "Deploy app $SHORT" \
  --body "Deploys [\`$SHORT\`](https://github.com/paighanutkarsh2410-lab/swiggy-devsecops-app/commit/$SHA) to every environment, pinned by digest:

| Image | Digest |
|---|---|
| swiggy-devsecops-backend | \`${DIGESTS[swiggy-devsecops-backend]}\` |
| swiggy-devsecops-frontend | \`${DIGESTS[swiggy-devsecops-frontend]}\` |
| swiggy-devsecops-partner | \`${DIGESTS[swiggy-devsecops-partner]}\` |

All three images passed the app repo's tests, Trivy scans and OWASP ZAP scan, and were signed with cosign by its CI, with a CycloneDX SBOM attached as a signed attestation. This repo's CI verifies those signatures before this can merge. Once merged, Argo CD deploys it to the kind cluster, and the next \`aws-deploy.sh\` deploys it to AWS."
