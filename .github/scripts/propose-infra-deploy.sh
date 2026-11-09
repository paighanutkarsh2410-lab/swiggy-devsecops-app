#!/usr/bin/env bash
# Opens a pull request in the infra repo that deploys this commit's images.
#
# Run by CI after the images are scanned and published. The infra repo's own
# CI validates the change, and once it is merged Argo CD rolls it out.
#
# Usage: propose-infra-deploy.sh <infra-checkout-dir> <commit-sha>
# Needs GH_TOKEN with Contents and Pull requests write access to the infra
# repo. With DRY_RUN=1 it only edits and shows the diff.
set -euo pipefail

INFRA_DIR="$1"
SHA="$2"
SHORT="${SHA:0:7}"
BRANCH="deploy/app-$SHORT"
VALUES_FILES=(charts/swiggy/values-kind.yaml charts/swiggy/values-aws.yaml)

if ! [[ "$SHA" =~ ^[0-9a-f]{40}$ ]]; then
  echo "Expected a full 40-character commit SHA, got: $SHA" >&2
  exit 1
fi

cd "$INFRA_DIR"

# Replace the image tag line, '  tag: "<40 hex characters>"', in each file.
# The quotes matter: unquoted, YAML reads an all-digit SHA as a number.
for file in "${VALUES_FILES[@]}"; do
  if ! grep -qE '^  tag: "[0-9a-f]{40}"$' "$file"; then
    echo "No quoted image tag line found in $file" >&2
    exit 1
  fi
  sed -i -E "s/^  tag: \"[0-9a-f]{40}\"$/  tag: \"$SHA\"/" "$file"
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
  -m "Images built, scanned and published by swiggy-devsecops-app CI for commit $SHA."
git push -q origin "$BRANCH"

gh pr create \
  --base main \
  --head "$BRANCH" \
  --title "Deploy app $SHORT" \
  --body "Updates the image tag for every environment to [\`$SHORT\`](https://github.com/paighanutkarsh2410-lab/swiggy-devsecops-app/commit/$SHA).

All three images passed the app repo's tests and Trivy scans before publishing. Once this is merged, Argo CD deploys it to the kind cluster, and the next \`aws-deploy.sh\` deploys it to AWS."
