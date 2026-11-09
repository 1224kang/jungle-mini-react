#!/usr/bin/env bash
# 프로젝트 전체 검증: Docker 컨테이너 안에서 단위 테스트를 실행한다.
# 사용법: bash scripts/verify.sh
set -euo pipefail

cd "$(dirname "$0")/.."

docker compose run --rm -T dev npm run test:run
