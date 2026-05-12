#!/usr/bin/env bash
# x-engage.sh — Search X for relevant posts and prepare engagement context
#
# Usage:
#   ./x-engage.sh [topic] [--limit N] [--dry-run]
#
# Topics:
#   rust-agent     Rust for agent/LLM runtimes
#   agent-memory   Agent memory architecture, context persistence
#   x402           HTTP 402 payments, agent micropayments
#   mcp            Model Context Protocol, MCP servers
#   harness        Agentic system reliability, production harnesses
#   open-source    Open source agent OS, agent framework strategy
#   agent-loop     Agent control loop architecture, LLM supervisory control
#   edge-agent     Edge computing agents, IoT + Rust
#   multi-agent    Multi-agent coordination, swarms, EGRI
#
# Prerequisites:
#   - xurl (https://github.com/xurl/xurl) for X API access OR
#   - snscrape as fallback (pip install snscrape)
#   - jq for JSON parsing
#
# Environment:
#   X_BEARER_TOKEN  — X API v2 bearer token (required for xurl)
#   X_REPLY_CONTEXT — Path to reply playbook (default: same dir as this script)
#
# Output:
#   For each matching post: tweet text, author, engagement stats, reply suggestion
#   Ranked by relevance score (engagement * recency weight)

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLAYBOOK="${X_REPLY_CONTEXT:-${SCRIPT_DIR}/x-reply-playbook.md}"
TOPIC="${1:-rust-agent}"
LIMIT=10
DRY_RUN=false
CACHE_DIR="${HOME}/.cache/x-engage"
CACHE_TTL=300  # seconds before re-fetching same query

# Parse optional flags
shift || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --limit)   LIMIT="$2"; shift 2 ;;
    --dry-run) DRY_RUN=true; shift ;;
    *)         echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
done

# ---------------------------------------------------------------------------
# Topic -> search query mapping
# Each topic maps to an array of X search queries, ordered by precision.
# The first query is most targeted; subsequent ones cast wider nets.
# ---------------------------------------------------------------------------

declare -A TOPIC_QUERIES
declare -A TOPIC_REPLY_SECTION
declare -A TOPIC_POST_URL

TOPIC_QUERIES[rust-agent]='("rust agent" OR "rust LLM" OR "rust autonomous agent" OR "agentic rust") lang:en -is:retweet'
TOPIC_QUERIES[agent-memory]='("agent memory" OR "LLM memory system" OR "agent context persistence" OR "agent state management") lang:en -is:retweet'
TOPIC_QUERIES[x402]='("x402" OR "HTTP 402 payment" OR "agent micropayment" OR "machine payment protocol") lang:en -is:retweet'
TOPIC_QUERIES[mcp]='("model context protocol" OR "MCP server agent" OR "claude MCP" OR "MCP tool") lang:en -is:retweet min_faves:5'
TOPIC_QUERIES[harness]='("agent harness" OR "agentic reliability" OR "LLM production harness" OR "agent reliability") lang:en -is:retweet'
TOPIC_QUERIES[open-source]='("open source agent" OR "agent framework open source" OR "agent OS" OR "open core agent") lang:en -is:retweet'
TOPIC_QUERIES[agent-loop]='("agent control loop" OR "LLM control loop" OR "supervisory controller LLM" OR "agent loop architecture") lang:en -is:retweet'
TOPIC_QUERIES[edge-agent]='("edge agent" OR "IoT agent rust" OR "edge AI rust" OR "agent raspberry pi") lang:en -is:retweet'
TOPIC_QUERIES[multi-agent]='("multi-agent" OR "agent swarm" OR "agent coordination" OR "multi-agent system LLM") lang:en -is:retweet min_faves:5'

# Maps topic to the relevant section heading in the playbook
TOPIC_REPLY_SECTION[rust-agent]="Rust for AI/agents"
TOPIC_REPLY_SECTION[agent-memory]="Agent memory architecture"
TOPIC_REPLY_SECTION[x402]="x402 / agent payments"
TOPIC_REPLY_SECTION[mcp]="LLM + production systems"
TOPIC_REPLY_SECTION[harness]="Agentic system reliability / harnesses"
TOPIC_REPLY_SECTION[open-source]="Open source strategy / moats"
TOPIC_REPLY_SECTION[agent-loop]="LLM + production systems"
TOPIC_REPLY_SECTION[edge-agent]="Rust for AI/agents"
TOPIC_REPLY_SECTION[multi-agent]="Multi-agent systems"

# Maps topic to the most relevant broomva.tech post URL
TOPIC_POST_URL[rust-agent]="broomva.tech/writing/edge-agents-in-the-wild"
TOPIC_POST_URL[agent-memory]="broomva.tech/writing/control-metalayer-autonomous-development"
TOPIC_POST_URL[x402]="broomva.tech/writing/what-do-you-sell-when-everyone-can-build-anything"
TOPIC_POST_URL[mcp]="broomva.tech/writing/claude-code-architecture-exposed"
TOPIC_POST_URL[harness]="broomva.tech/writing/reliable-agentic-systems"
TOPIC_POST_URL[open-source]="broomva.tech/writing/what-do-you-sell-when-everyone-can-build-anything"
TOPIC_POST_URL[agent-loop]="broomva.tech/writing/agentic-control-loop"
TOPIC_POST_URL[edge-agent]="broomva.tech/writing/edge-agents-in-the-wild"
TOPIC_POST_URL[multi-agent]="broomva.tech/writing/symphony-hive-mode"

# ---------------------------------------------------------------------------
# Utility functions
# ---------------------------------------------------------------------------

log()   { echo "[x-engage] $*" >&2; }
info()  { echo -e "\033[0;34m$*\033[0m"; }
warn()  { echo -e "\033[0;33mWARN: $*\033[0m" >&2; }
bold()  { echo -e "\033[1m$*\033[0m"; }
dim()   { echo -e "\033[2m$*\033[0m"; }
green() { echo -e "\033[0;32m$*\033[0m"; }

check_deps() {
  local missing=()
  for cmd in jq; do
    command -v "$cmd" &>/dev/null || missing+=("$cmd")
  done
  if ! command -v xurl &>/dev/null && ! command -v snscrape &>/dev/null; then
    missing+=("xurl or snscrape")
  fi
  if [[ ${#missing[@]} -gt 0 ]]; then
    warn "Missing dependencies: ${missing[*]}"
    echo ""
    echo "Install:"
    echo "  jq:       brew install jq"
    echo "  xurl:     brew install xurl   (or https://github.com/xurl/xurl)"
    echo "  snscrape: pip install snscrape  (fallback if no X API key)"
    echo ""
    echo "Set X_BEARER_TOKEN env var for X API v2 access."
    exit 1
  fi
}

validate_topic() {
  if [[ -z "${TOPIC_QUERIES[$TOPIC]+x}" ]]; then
    echo "Unknown topic: '$TOPIC'"
    echo ""
    echo "Available topics:"
    for t in "${!TOPIC_QUERIES[@]}"; do
      printf "  %-15s  %s\n" "$t" "${TOPIC_REPLY_SECTION[$t]}"
    done | sort
    exit 1
  fi
}

# Cache management: avoid hammering the API for repeated runs
ensure_cache() {
  mkdir -p "$CACHE_DIR"
}

cache_key() {
  echo "$TOPIC-$LIMIT" | tr ' ' '_'
}

cache_path() {
  echo "${CACHE_DIR}/$(cache_key).json"
}

cache_valid() {
  local path
  path="$(cache_path)"
  [[ -f "$path" ]] || return 1
  local age
  age=$(( $(date +%s) - $(stat -f %m "$path" 2>/dev/null || stat -c %Y "$path" 2>/dev/null) ))
  [[ $age -lt $CACHE_TTL ]]
}

# ---------------------------------------------------------------------------
# Search backends
# ---------------------------------------------------------------------------

# Backend 1: xurl (X API v2)
search_xurl() {
  local query="$1"
  local limit="$2"
  if [[ -z "${X_BEARER_TOKEN:-}" ]]; then
    warn "X_BEARER_TOKEN not set. Falling back to snscrape."
    return 1
  fi
  xurl search "$query" \
    --limit "$limit" \
    --format json \
    --fields "id,text,author_id,public_metrics,created_at" \
    2>/dev/null || return 1
}

# Backend 2: snscrape (no API key required, slower)
search_snscrape() {
  local query="$1"
  local limit="$2"
  snscrape --jsonl --max-results "$limit" \
    twitter-search "$query" 2>/dev/null \
    | jq -s '.' || return 1
}

# Unified search: try xurl first, fall back to snscrape
search_posts() {
  local query="${TOPIC_QUERIES[$TOPIC]}"
  local cache
  cache="$(cache_path)"

  if cache_valid; then
    log "Using cached results ($(cache_key))"
    cat "$cache"
    return 0
  fi

  log "Searching X for: $query"

  local result=""
  if command -v xurl &>/dev/null && [[ -n "${X_BEARER_TOKEN:-}" ]]; then
    result=$(search_xurl "$query" "$LIMIT") || true
  fi

  if [[ -z "$result" ]] && command -v snscrape &>/dev/null; then
    log "Falling back to snscrape..."
    result=$(search_snscrape "$query" "$LIMIT") || true
  fi

  if [[ -z "$result" ]]; then
    warn "Both search backends failed. Check credentials and network."
    # Return empty array so the script degrades gracefully
    echo "[]"
    return 0
  fi

  echo "$result" | tee "$cache"
}

# ---------------------------------------------------------------------------
# Scoring and ranking
# ---------------------------------------------------------------------------

# Rough relevance score: (likes + 3*replies + 2*retweets) * recency_weight
# recency_weight = 1.0 for posts < 1h, 0.8 for < 6h, 0.6 for < 24h, 0.3 older
score_post() {
  local likes="$1"
  local replies="$2"
  local retweets="$3"
  local created_at="$4"

  local engagement=$(( likes + 3 * replies + 2 * retweets ))

  # Simple recency decay (bash integer arithmetic)
  local now
  now=$(date +%s)
  # created_at in ISO8601 -- convert to epoch
  local post_epoch
  post_epoch=$(date -d "$created_at" +%s 2>/dev/null \
    || date -j -f "%Y-%m-%dT%H:%M:%S" "${created_at%%.*}" +%s 2>/dev/null \
    || echo "$now")
  local age_hours=$(( (now - post_epoch) / 3600 ))

  local weight=30
  if   [[ $age_hours -lt 1  ]]; then weight=100
  elif [[ $age_hours -lt 6  ]]; then weight=80
  elif [[ $age_hours -lt 24 ]]; then weight=60
  fi

  echo $(( engagement * weight / 100 ))
}

# ---------------------------------------------------------------------------
# Reply suggestion engine
# ---------------------------------------------------------------------------

# Print the relevant reply templates from the playbook for this topic
show_reply_templates() {
  local section="${TOPIC_REPLY_SECTION[$TOPIC]}"
  if [[ ! -f "$PLAYBOOK" ]]; then
    warn "Playbook not found at: $PLAYBOOK"
    return
  fi
  echo ""
  bold "--- Reply templates for: $section ---"
  # Extract the section block from the playbook (between heading and next ###)
  awk "/^### ${section}$/,/^### [^$]/" "$PLAYBOOK" \
    | grep -v "^### [^${section}]" \
    | head -60 \
    || warn "Could not parse section '$section' from playbook"
  echo ""
  info "Primary post reference: ${TOPIC_POST_URL[$TOPIC]}"
  echo ""
}

# ---------------------------------------------------------------------------
# Main output: render search results with engagement scores
# ---------------------------------------------------------------------------

render_results() {
  local json="$1"

  local count
  count=$(echo "$json" | jq 'length' 2>/dev/null || echo 0)
  if [[ "$count" -eq 0 ]]; then
    warn "No results found for topic '$TOPIC'."
    echo ""
    echo "Try a different topic or check your search credentials."
    echo "Available topics: ${!TOPIC_QUERIES[*]}"
    return
  fi

  echo ""
  bold "=== X posts matching topic: $TOPIC ($count results) ==="
  echo ""

  # Build scored list (tab-separated: score, index)
  local scores=()
  for i in $(seq 0 $((count - 1))); do
    local post
    post=$(echo "$json" | jq ".[$i]")

    # Handle both xurl and snscrape JSON shapes
    local likes replies rts created_at
    likes=$(echo "$post"    | jq -r '.public_metrics.like_count  // .likeCount    // 0')
    replies=$(echo "$post"  | jq -r '.public_metrics.reply_count // .replyCount   // 0')
    rts=$(echo "$post"      | jq -r '.public_metrics.retweet_count // .retweetCount // 0')
    created_at=$(echo "$post" | jq -r '.created_at // .date // "2000-01-01T00:00:00Z"')

    local score
    score=$(score_post "$likes" "$replies" "$rts" "$created_at")
    scores+=("$score:$i")
  done

  # Sort by score descending
  IFS=$'\n' sorted=($(printf "%s\n" "${scores[@]}" | sort -t: -k1 -rn))
  unset IFS

  local rank=1
  for entry in "${sorted[@]}"; do
    local score="${entry%%:*}"
    local idx="${entry##*:}"
    local post
    post=$(echo "$json" | jq ".[$idx]")

    # Extract fields (handle both API shapes)
    local text author url likes replies rts
    text=$(echo "$post"    | jq -r '.text // .content // "(no text)"')
    author=$(echo "$post"  | jq -r '.author_id // .user.username // "(unknown)"')
    url=$(echo "$post"     | jq -r '"https://x.com/i/web/status/" + (.id // .id_str // "")')
    likes=$(echo "$post"   | jq -r '.public_metrics.like_count  // .likeCount    // 0')
    replies=$(echo "$post" | jq -r '.public_metrics.reply_count // .replyCount   // 0')
    rts=$(echo "$post"     | jq -r '.public_metrics.retweet_count // .retweetCount // 0')

    bold "[$rank] Score: $score  |  Likes: $likes  Replies: $replies  RTs: $rts"
    dim  "    Author: @$author"
    dim  "    URL:    $url"
    echo ""
    echo "    $text" | fold -s -w 76 | sed 's/^/    /'
    echo ""
    rank=$(( rank + 1 ))
  done
}

# ---------------------------------------------------------------------------
# Engagement mode: show posts + reply suggestions + standalone post option
# ---------------------------------------------------------------------------

show_engagement_guide() {
  echo ""
  bold "=== ENGAGEMENT GUIDE ==="
  echo ""
  info "X Free API tier limits:"
  dim  "  - Cannot reply to arbitrary public posts (only mentions + own threads)"
  dim  "  - CAN post original threads (surfaces in search)"
  dim  "  - CAN like posts (builds algorithmic signal)"
  echo ""
  info "Action flow for each result above:"
  echo "  1. Like the post (always safe, builds signal)"
  echo "  2. If it's a mention or reply to your own thread -> use a reply template"
  echo "  3. If it's a high-signal post on your topic -> save author for follow"
  echo ""
  info "Standalone post option (no API tier needed):"
  dim  "  Post one of the S-1..S-8 templates from the playbook as an original tweet."
  dim  "  These surface in topic searches and establish credibility without replying."
  echo ""
}

# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

main() {
  check_deps
  validate_topic
  ensure_cache

  log "Topic: $TOPIC | Limit: $LIMIT | Dry-run: $DRY_RUN"

  # Show playbook templates first so they're visible before potentially slow search
  show_reply_templates

  if [[ "$DRY_RUN" == "true" ]]; then
    info "[dry-run] Skipping live search. Templates shown above."
    show_engagement_guide
    exit 0
  fi

  local results
  results=$(search_posts)

  render_results "$results"
  show_engagement_guide
}

main "$@"
