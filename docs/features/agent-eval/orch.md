# agent-eval — orch

- 원본: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md)
- 시작 해시: `23b6e54`(main). 통합 브랜치: `feat-agent-eval`.
- 지휘: Claude Code(Opus). 워커는 `--worktree new-child --base-branch feat-agent-eval`로 띄운다(AGENTS.md).

## 결정 로그

| 날짜 | 결정 | 근거 |
|---|---|---|
| 2026-10-24 | 루프는 우리가 사용성 문제를 찾고 고치는 개발 과정이다. 평가 루프를 먼저 만들고 제품 개선은 그 결과로 이어 간다 | 사용자 |
| 2026-10-24 | 읽기 시나리오: 코멘트 반영, 캔버스로 코드 구현, 캔버스 이해 질문 | 사용자 |
| 2026-10-24 | `/agent-eval`은 두 계열을 상시 실행 · 교차 판정(AGENTS.md 예외), 기록은 `docs/USABILITY-EVAL.md`, 시나리오는 루트 `eval/` + Node 실행기, 실행 주기는 가이드 · 출력 변경 PR, 기능 마무리 전, 에이전트 버전 변경 때 1회(실패만 2회 더) | 사용자 |
| 2026-10-24 | 하네스 문서(스킬, USABILITY-EVAL.md, AGENTS.md)는 main에 직접 커밋하고, 실행기 · 시나리오는 이 브랜치에서 orch로 만든다. `/feature-review`는 생략했다 | 사용자: "메인에 병합하고, 브랜치 하나 따서 … orch로". 설계는 대화에서 사용자 결정으로 확정 |
| 2026-10-24 | 모델 배분: 실행기(1) · 통합(5)은 Opus high, 시나리오(2~4)는 Codex Astra medium. 리뷰는 다른 계열 | 지휘자 판단 — 계약 설계와 판정은 판단 비중이 크고, 시나리오는 계약 안의 작성 작업이다 |

## 배치

| 배치 | tasks | 파일 소유 | 선행 | 모델 · 노력 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| E | 1 | `eval/run.ts`, `eval/lib/**`, `eval/scenarios/_example/`, AGENTS.md 'Commands' | — | Claude Opus high | `node --test eval/`, self-test | 대기 |
| SA | 2 | `eval/scenarios/{W1,W2,R5}/` | E | Codex Astra medium | self-test(해당 id) | 대기 |
| SB | 3 | `eval/scenarios/{R1,R2,R3}/` | E | Codex Astra medium | self-test(해당 id) | 대기 |
| SC | 4 | `eval/scenarios/R4/` | E | Codex Astra medium | self-test(R4) | 대기 |
| F | 5 | `docs/**`, `.agents/skills/agent-eval/SKILL.md`, 이 디렉터리 삭제 | E, SA, SB, SC | Claude Opus high(실제 회차 실행 포함) | tasks 5 검증 | 대기 |
| R-* | 리뷰 | 보고서만 | 각 배치 | E · F는 Codex Astra, S*는 Claude Opus | `/code-review`, 🔴 0 | — |

tasks.md의 task 1~5는 모두 위 배치에 속한다. SA · SB · SC는 서로 파일이 겹치지 않아 병렬로 돈다.

## 진행 기록

