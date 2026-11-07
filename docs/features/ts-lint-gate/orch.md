# ts-lint-gate — orch

원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md). 체인 [chain-261107](../chain-261107/chain.md)의 링크 3(마지막 링크)이다.

- 시작 hash: `9b89a9d7`(origin/main)
- 통합 branch: `feat/ts-lint-gate`
- 지휘자: Claude Code(Opus 5.5), worktree `ts-lint-gate-orch`
- Codex 주간 사용량(시작 때): 53%(`window_minutes` 10080)

## 결정 기록

사용자에게 새로 물은 것은 없다.

1. **lint 명령 사용** — 체인 시작 점검 승인 3. tasks의 "command undecided — needs user confirmation" 줄은 승인된 것으로 보고 `npm --prefix app run lint`를 검증에 쓴다.
2. **N 재측정** — 지휘자 판단. `9b89a9d7`에서 저장소 밖 scratch에 oxlint 1.92.0 + oxlint-tsgolint 7.0.2006(둘 다 그때 최신, oxlint peer `oxlint-tsgolint >=7.0.2005`)을 설치하고 design §4 설정으로 `app/src`·`app/runtime`(테스트 제외)을 돌렸다. exhaustive-deps 82건(18 파일, 파일별 분포가 design §2와 같다), no-misused-promises 4건이다. 다른 규칙 이름은 없다. `-A typescript/no-misused-promises`로 `--max-warnings 82`는 exit 0, `81`은 exit 1이다.
3. **인용 고침** — 지휘자 판단. 링크 1·2 뒤 줄 번호가 바뀐 곳을 고쳤다: `index.ts:1195`→`:1230`, `Onboarding.tsx:214`→`:217`, `Onboarding.tsx` `run` helper 202줄→205줄. `SettingsAgents.tsx:128`·`:136`·101줄과 `agentStep.ts`의 `.catch` 두 곳(191·199줄)은 그대로다. quit 순서 코드(`mcp`→`usage`→`agentAuth`→`Promise.all([onboarding, addPage])`)도 design §5와 같다. design §4·tasks T4의 "defect-sweep과 overview-tabs가 고치므로"를 지금 사정(체인 밖에서도 main이 움직임)으로 고쳤다.
4. **batch 나누기** — 지휘자 판단. 도구·gate·문서(T0·T2·T3)와 기존 오류 고침(T1)은 파일이 겹치지 않아 병렬이다. T1의 lint 확인과 T2의 `verify.mjs` 전체 PASS는 서로를 기다리므로, 각 작업자는 자기 단위 검증까지만 하고 lint 오류 0·gate 전체 PASS는 지휘자가 통합 HEAD에서 본다. T4는 지휘자가 한다.
5. **모델** — 체인 상시 권한(링크 3은 Codex 주 작업자, `gpt-6-astra` effort `high`까지). 구현 둘 다 Codex다. 리뷰는 다른 family로: A는 Claude Sonnet medium(작은 diff), B는 Claude Sonnet medium. Claude 7일 사용량이 높아 리뷰도 Sonnet으로 둔다.
6. **`/agent-eval`** — 해당 없음. guide, CLI 출력, `doan check` 규칙, skill stub이 바뀌지 않는다(design §8).
7. **`/runtime-test`** — B가 T1의 두 probe(보통 Quit, Settings > Agents Retry)를 격리 환경에서 돌린다. Codex 작업자가 Electron을 띄울 수 없으면 그 사실을 handoff에 적고, 지휘자가 통합 HEAD에서 돌린다.

## batch

| batch | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | gate | 상태 |
|---|---|---|---|---|---|---|
| A | T0, T2, T3 | `app/package.json`, `app/package-lock.json`, 새 `app/.oxlintrc.json`, `.agents/skills/verify/scripts/verify.mjs`·`verify.test.mjs`, `AGENTS.md`, `.agents/skills/verify/SKILL.md`, `.agents/skills/design-sync/SKILL.md`, `docs/ARCHITECTURE.md`, `docs/DIRECTORY.md`, `docs/BACKLOG.md` | 없음 | Codex `gpt-6.1-sol` high — 판단보다 단계가 많다(설치, lock·서식 확인, disable 주석 확인, gate 단계, 문서 여섯 개) | T0 확인 항목, `node --test .agents/skills/verify/scripts/verify.test.mjs`, `npm --prefix app run typecheck`, `npm --prefix app test`, `npm --prefix app run build`, T3 grep | 대기 |
| A 리뷰 | A diff | 없음(보고만) | A | Claude Sonnet medium — 설정·문서 위주의 작은 diff, 다른 family | `/code-review` | 대기 |
| B | T1 | `app/src/main/index.ts`·`index.test.ts`, `app/src/renderer/Onboarding.tsx`, `app/src/renderer/SettingsAgents.tsx` | 없음 | Codex `gpt-6-astra` high — quit 순서의 거절 처리와 회귀 테스트, 격리된 실제 앱 probe | `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run build`, `/runtime-test` 두 probe | 대기 |
| B 리뷰 | B diff | 없음(보고만) | B | Claude Sonnet medium — 다른 family의 독립 리뷰 | `/code-review` | 대기 |
| 지휘자 | T4 | 통합, `docs/features/ts-lint-gate/` 삭제 | A·B | — | `npm --prefix app run lint` N / N-1, `node .agents/skills/verify/scripts/verify.mjs` PASS | 대기 |

## 겹침과 순서

- A와 B는 겹치는 파일이 없어 병렬이다.
- A·B를 `feat/ts-lint-gate`에 통합한 HEAD에서 lint 오류 0과 `verify.mjs` PASS를 본다. 결함은 해당 작업자에게 돌려보낸다.
- 병합 전 최신 `origin/main`으로 rebase하고 N을 다시 센 뒤 그 HEAD에서 `/verify`를 돌린다.

## 기록
