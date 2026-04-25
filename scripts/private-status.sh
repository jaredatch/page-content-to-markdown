#!/usr/bin/env bash
# Show the git status of both the public repo and the nested private repo
# at private/, side-by-side. Use this before/after committing to catch drift
# between the two histories.
#
# Usage:
#   scripts/private-status.sh        # show status of both repos
#   scripts/private-status.sh -v     # also show recent commits in each
#
# Exit codes:
#   0  both repos clean
#   1  one or both have uncommitted changes
#   2  private/ is missing (no private-repo access)

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PRIVATE_DIR="$REPO_ROOT/private"

VERBOSE=0
if [[ "${1:-}" == "-v" || "${1:-}" == "--verbose" ]]; then
  VERBOSE=1
fi

# Colors (skip if not a TTY)
if [[ -t 1 ]]; then
  BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'
  YELLOW=$'\033[33m'; CYAN=$'\033[36m'; RESET=$'\033[0m'
else
  BOLD=""; DIM=""; RED=""; GREEN=""; YELLOW=""; CYAN=""; RESET=""
fi

print_section() {
  local title=$1
  local path=$2
  echo "${BOLD}${CYAN}=== ${title} ===${RESET}"
  echo "${DIM}${path}${RESET}"
}

repo_dirty() {
  # Returns 0 if dirty (has changes), 1 if clean
  local dir=$1
  if ! git -C "$dir" diff --quiet --ignore-submodules HEAD 2>/dev/null; then
    return 0
  fi
  if ! git -C "$dir" diff --cached --quiet --ignore-submodules HEAD 2>/dev/null; then
    return 0
  fi
  if [[ -n "$(git -C "$dir" ls-files --others --exclude-standard)" ]]; then
    return 0
  fi
  return 1
}

show_status() {
  local dir=$1
  if repo_dirty "$dir"; then
    echo "${YELLOW}● uncommitted changes${RESET}"
    git -C "$dir" -c color.status=always status --short
  else
    echo "${GREEN}✓ clean${RESET}"
  fi

  # Compare to upstream if tracking branch exists
  local branch upstream ahead behind
  branch=$(git -C "$dir" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
  upstream=$(git -C "$dir" rev-parse --abbrev-ref --symbolic-full-name @{u} 2>/dev/null || echo "")
  if [[ -n "$upstream" ]]; then
    ahead=$(git -C "$dir" rev-list --count "$upstream"..HEAD 2>/dev/null || echo "0")
    behind=$(git -C "$dir" rev-list --count HEAD.."$upstream" 2>/dev/null || echo "0")
    if [[ "$ahead" -gt 0 || "$behind" -gt 0 ]]; then
      echo "${YELLOW}  branch ${branch}: ${ahead} ahead, ${behind} behind ${upstream}${RESET}"
    else
      echo "${DIM}  branch ${branch}: in sync with ${upstream}${RESET}"
    fi
  else
    echo "${DIM}  branch ${branch}: no upstream configured${RESET}"
  fi

  if [[ $VERBOSE -eq 1 ]]; then
    echo "${DIM}  recent commits:${RESET}"
    git -C "$dir" log --oneline -5 | sed 's/^/    /'
  fi
}

# --- Public repo ---
echo
print_section "Public repo" "$REPO_ROOT"
show_status "$REPO_ROOT"
public_dirty=0
repo_dirty "$REPO_ROOT" && public_dirty=1

echo

# --- Private repo ---
print_section "Private repo" "$PRIVATE_DIR"
if [[ ! -d "$PRIVATE_DIR" ]]; then
  echo "${RED}✗ private/ is missing${RESET}"
  echo "${DIM}  (clone the private repo into ./private if you need access)${RESET}"
  echo
  exit 2
fi
if [[ ! -d "$PRIVATE_DIR/.git" ]]; then
  echo "${RED}✗ private/ exists but is not a git repo${RESET}"
  echo "${DIM}  expected: a clone of page-content-to-markdown-private${RESET}"
  echo
  exit 2
fi
show_status "$PRIVATE_DIR"
private_dirty=0
repo_dirty "$PRIVATE_DIR" && private_dirty=1

echo

# --- Summary ---
if [[ $public_dirty -eq 0 && $private_dirty -eq 0 ]]; then
  echo "${GREEN}Both repos clean.${RESET}"
  exit 0
fi

if [[ $public_dirty -eq 1 && $private_dirty -eq 1 ]]; then
  echo "${YELLOW}Both repos have uncommitted changes.${RESET}"
  echo "${DIM}Reminder: when public-repo work is captured in private notes (e.g. PLAN.md),${RESET}"
  echo "${DIM}reference the public commit hash in the private commit message.${RESET}"
elif [[ $public_dirty -eq 1 ]]; then
  echo "${YELLOW}Public repo has uncommitted changes.${RESET}"
else
  echo "${YELLOW}Private repo has uncommitted changes (public is clean).${RESET}"
  echo "${DIM}If these notes describe shipped public-repo work, reference the relevant commit hash.${RESET}"
fi
exit 1
