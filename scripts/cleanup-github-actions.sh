#!/usr/bin/env bash
# scripts/cleanup-github-actions.sh
# 批量清理 GitHub 仓库中的历史 Actions 运行记录与部署记录
set -euo pipefail

if ! command -v gh >/dev/null 2>&1; then
  echo "❌ 错误: 未检测到 GitHub CLI (gh)。请先安装: brew install gh"
  exit 1
fi

REPO="${1:-}"
if [ -z "$REPO" ]; then
  # 自动检测当前 git remote
  REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || echo "")
fi

if [ -z "$REPO" ]; then
  echo "用法: $0 [owner/repo]"
  echo "例如: $0 daocatt/jotify-moment"
  exit 1
fi

echo "🔍 正在获取仓库 $REPO 的历史工作流运行记录..."

count=0
while true; do
  RUNS=$(gh run list --repo "$REPO" --limit 100 --json databaseId -q '.[].databaseId')
  if [ -z "$RUNS" ]; then
    break
  fi

  for run_id in $RUNS; do
    echo "🗑️ 正在删除运行记录: $run_id"
    gh run delete "$run_id" --repo "$REPO" || true
    count=$((count + 1))
  done
  sleep 1
done

echo "✅ 清理完成！共计删除 $count 条 Actions 运行记录。"
