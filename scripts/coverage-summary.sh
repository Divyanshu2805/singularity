#!/usr/bin/env bash
# Prints the backend's test coverage, one row per module and a total, as a Markdown table - from the reports
# `./mvnw verify` (or `test`) leaves in each module's target/site/jacoco. CI appends it to the run's summary; locally
# it is the quick way to read the numbers without opening six HTML reports.
#
# Usage:
#   ./mvnw verify && scripts/coverage-summary.sh
#
# A module with no report (nothing to test, or the tests were skipped) is shown as such rather than left out.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "### Backend test coverage"
echo
echo "| Module | Lines covered | Lines | Branches covered | Branches |"
echo "|---|---|---|---|---|"

total_file="$(mktemp)"
trap 'rm -f "$total_file"' EXIT

for module in common-lib discovery-service gateway-service account-service workspace-service intelligence-service; do
  report="$ROOT/$module/target/site/jacoco/jacoco.csv"
  if [ ! -f "$report" ]; then
    echo "| $module | no report | | | |"
    continue
  fi
  awk -F, -v module="$module" -v totals="$total_file" '
    NR > 1 { branch_missed += $6; branch_covered += $7; line_missed += $8; line_covered += $9 }
    END {
      lines = line_missed + line_covered; branches = branch_missed + branch_covered
      printf "| %s | %.1f%% | %d | %s | %d |\n", module,
        (lines ? 100 * line_covered / lines : 0), lines,
        (branches ? sprintf("%.1f%%", 100 * branch_covered / branches) : "-"), branches
      print line_covered, lines, branch_covered, branches >> totals
    }' "$report"
done

awk '
  { line_covered += $1; lines += $2; branch_covered += $3; branches += $4 }
  END {
    if (lines) printf "| **All modules** | **%.1f%%** | %d | **%.1f%%** | %d |\n",
      100 * line_covered / lines, lines, (branches ? 100 * branch_covered / branches : 0), branches
  }' "$total_file"
