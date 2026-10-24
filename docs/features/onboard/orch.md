# onboard — orch

- 원본: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md)
- 시작 해시: `7484ce7`(main)
- 통합 브랜치: task 0 · 1은 main(tasks.md 브랜치 결정). task 2부터는 A를 main에 통합한 뒤 main에서 만든 `feat-onboard`.
- 지휘: Claude Code(Opus). 지휘자는 배치 코드를 고치지 않는다. 지휘자가 쓰는 것은 이 문서, 통합 커밋, 문서 최신화 커밋뿐이다.

## 결정 로그

| 날짜 | 결정 | 근거 |
|---|---|---|
| 2026-10-24 | 이번 run에서 Codex 워커를 쓰는 것을 허락받았다. Codex 워커가 PoC · 관찰에서 `claude` CLI를 실행하는 것과, Claude 워커가 `codex exec`를 실행하는 것도 포함한다 | 사용자: "codex 허가. 여기저기 많이 사용해도 됨" |
| 2026-10-24 | task 12에서 실제 HOME 설치를 허락받았다(링크, 스킬, Claude · Codex 사용자 범위 MCP). doan이 만들지 않은 것을 덮어쓰지 않는다는 규칙은 그대로 적용한다 | 사용자 결정 |
| 2026-10-24 | 구현 배치는 Codex를 기본으로 쓴다. 판단이 필요한 배치는 Astra medium, 기계적인 배치는 Sol medium으로 둔다. 리뷰도 Codex Astra medium으로 하되, 저장소 밖 쓰기 · 셸 실행 같은 보안 경계가 있는 G의 리뷰만 Claude Opus high로 교차 확인한다 | 지휘자 판단 — 사용자의 Codex 사용 허락과 Claude 사용량 절약. 보안 경계만 다른 모델 계열의 시각을 더한다 |
| 2026-10-24 | 초안(B)은 Codex가 그린다 | 지휘자 판단 — 위와 같다. select-inspect도 Codex가 그렸다 |
| 2026-10-24 | 이후 배치는 Opus와 Codex를 섞는다: H · M과 R-G · R-H · R-I 리뷰는 Claude Opus high, J · L은 Codex. 실행 중인 G · K는 Codex로 유지하고, Codex가 구현한 배치는 Opus가 리뷰해 서로 다른 모델 계열이 교차로 본다 | 사용자: "왜 전부 코덱스임? 오푸스랑 적당히 섞지않고?" |

## 배치

| 배치 | tasks | 파일 소유 | 선행 | 모델 · 노력 (이유) | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| A | 0, 1 | `docs/PRODUCT.md`, `AGENTS.md`, `.scratch/onboard/poc7/` | — | Codex Astra medium (격리 판단, 실제 설정을 보호해야 하고 PoC 판정이 필요하다) | tasks 0 · 1 검증, 실제 상태의 키 단위 비교 | 완료 — main `13e222e` `d63db08` `f80bae0` `f4b0ee4` |
| C | 3 | `cli/internal/repo/`, `cli/internal/cli/init.go`, `mcp.go`, `skill.md`(`--token-css` 설명만) | — | Codex Astra medium (경로 보안 경계) | `go test ./...` · `go vet ./...`, task 3 명령 | 완료 — `feat-onboard` `2fc9c86` `04c6ac5`, R-C red 0 / yellow 0 |
| B | 2 | `design/onboard.html` | A | Codex Astra medium (상태 설계 판단) | `doan check` · `doan ls`, 지휘자 리뷰, 사용자 확정 | 완료 — Opus 초안 채택 `4a44adc`(B2), 사용자가 초안 검토를 생략하고 진행을 지시(2026-10-24) |
| D | 4 | `app/src/main/onboarding/states.ts`(+test, `fixtures/`), `app/src/main/cli.ts`(`cliCommand`), `app/src/main/folderState.ts`, `app/src/renderer/onboardingView.ts`(+test) | A(fixture, 셸 출력 형식) | Codex Astra medium | `npm --prefix app test` · `typecheck` | 완료 — R-D 🟡1(PATH `..` 정규화) 수정 1회, 통합 HEAD TS 1144개 · typecheck 통과 |
| E | 5 | `app/package.json`, `app/package-lock.json`, electron-builder 설정, `.gitignore`, AGENTS.md 'Commands' | A(7d 버전), D | Codex Sol medium (기계적) | task 5 검증 | 완료 — `feat-onboard` 통합, R-E red 0 / yellow 0 |
| F | 6 | `app/src/main/shell.ts`, `cli.ts`(`runLs` 주변), `index.ts`(IPC), `app/src/preload/` | D | Codex Astra medium (재루팅 · 동시성) | task 6 검증 + e2e | 완료 — 통합, R-F red 0 / yellow 0, 통합 HEAD e2e PASS |
| K | 11 | `cli/internal/cli/skill.md`, `.scratch/onboard/observe/` | C, E | Codex Astra medium (관찰 판단, `claude -p` · `codex exec` 실행) | task 11 검증 | 완료 — 1회차에 두 에이전트 모두 `doan check` 오류 · 경고 0, 본문 변경 없음 |
| G | 7 | `app/src/main/onboarding/`(states 외), `index.ts`(메뉴), `app/src/preload/`, `app/e2e/` helper, AGENTS dev 명령 | F, E | Codex Astra medium (저장소 밖 쓰기, 셸 실행) | task 7 검증 + e2e | 수정 1회 진행 중 — R-G(Opus) red 0 / yellow 3 |
| H | 8 | `app/src/renderer/`(마법사 · 대화상자 · 사이드바) | G, B 확정 | Codex Astra medium | task 8 검증 + e2e | 대기 |
| I | 9 | `app/e2e/` | H | Codex Astra medium | task 9 검증 | 대기 |
| J | 10 | `/design-sync`가 정하는 범위, `docs/DESIGN.md` | I | Codex Astra medium | `/design-sync` 완료 조건 | 대기 |
| L | 12 | `.scratch/onboard/packaged/` | H, E | Codex Sol medium (확인 절차) | task 12 확인 항목 | 대기 |
| M | 13 | `docs/` 전반, `app/src/main/cli.ts` 주석, 이 디렉터리 삭제 | 전부 | Codex Astra medium (문서 정확성) | task 13 검증 | 대기 |
| R-* | 리뷰 | 보고서만 | 각 구현 배치 | Codex Astra medium, R-G만 Claude Opus high | `/code-review`, 🔴 0 | — |

tasks.md의 task 0~13은 모두 위 배치 중 하나에 속한다.

## 순서와 파일 겹침

- 1파: A ∥ C. 두 배치의 파일은 서로 겹치지 않는다(문서 대 Go).
- A를 main에 통합해 push한 뒤 `feat-onboard`를 만들고, C를 그 위에 cherry-pick한다.
- 2파: B ∥ D. 파일이 겹치지 않는다(`design/` 대 `app/src` 순수 함수).
- 3파: E ∥ F. E는 `package.json` · 설정, F는 main · preload를 맡는다. `cliCommand`는 D가 끝냈다.
- K는 C · E 통합 뒤에 시작하고, F · G · H와 병렬로 돈다. `skill.md`만 고친다.
- G는 F 뒤에 돈다(`index.ts` · preload가 겹친다). H는 G와 B 확정 뒤, I는 H 뒤, J는 I 뒤에 돈다. L은 H 뒤, M은 마지막이다.
- 각 배치는 자기 child worktree에서 돈다. 2파부터는 지휘 체크아웃(`feat-onboard`)에서 갈라진다.

## 진행 기록

- 2026-10-24 C 첫 시작이 Codex 업데이트 안내(0.163.0 → 0.164.0) 화면에 막혔다. 사용자가 Codex를 직접 업데이트한 뒤 다시 시작했다.
- 2026-10-24 A의 PoC 7b에서 Claude 격리 호출이 OAuth 만료로 실패했다. 지휘자는 인증 파일 복사를 금지하고, 지휘 세션에서 관찰한 상대 링크 스킬 발견을 근거로 대신 기록하게 했다(PRODUCT §6에 한계를 명시했다). 7c 도중 Codex 업데이트로 실행 파일이 잠시 사라졌고, 다시 탐지해 재시도했다.
- 2026-10-24 PoC 7 결과를 design.md에 반영했다(`2ab9a1e`): zsh `-lic`, Claude 상태는 설정 파일 읽기 전용 파싱, Codex는 덮어쓰기, 링크 값은 `<config>/skills` 기준으로 계산, electron-builder 26.18.0.
- 2026-10-24 A를 main에 통합해 push한 뒤 `feat-onboard`를 만들었다. C는 리뷰(red 0 / yellow 0, ⚪ 2: 기존 TOCTOU 한계, 확인하지 않은 I/O 오류 경로)를 거쳐 통합했다. 통합 HEAD에서 `go test ./...` · `go vet ./...` 통과. onboard-a · onboard-c worktree를 제거했다. 증거는 `.scratch/onboard/`(poc7, evidence)에 있다.
- 2026-10-24 B 질문에 지휘자가 답했다: 창 전체 마법사 배치, 교체 버튼 이름, 상태 칩과 design.md 문구를 함께 쓰는 규칙.
- 2026-10-24 B 초안을 지휘자가 검토했다: `doan ls`(canvas `onboard`, 1440, 프레임 8개 일치) · `doan check`(오류 0, `mock.css` 경고 6개) 직접 확인, 실제 앱 스크린샷(wizard-cli, wizard-agents, wizard-project, confirm-replace)과 상태 대응표를 대조했다. 통합한 뒤 사용자 확정을 요청했다. 확인용 앱은 임시 userData로 띄웠다.
- 2026-10-24 D는 R-D 🟡1(PATH 항목의 `..`를 정규화해 링크 너머 경로를 바꿈)을 수정 1회로 고친 뒤 통합했다. onboard-b · onboard-d worktree를 제거했다(증거는 `.scratch/onboard/evidence/`).
- 2026-10-24 `worker-start --worktree new-child`는 지휘 체크아웃의 HEAD가 아니라 main(`f4b0ee4`)에서 갈라졌다. E · F에는 시작 직후 `git merge --ff-only feat-onboard`를 지시했다. 이후 배치는 `--worktree new-child --base-branch feat-onboard`로 띄운다.
- 2026-10-24 E · F 통합(각 리뷰 red 0 / yellow 0), 통합 HEAD에서 TS 1161개 · typecheck · Go · e2e PASS. K는 1회차에 두 에이전트가 오류 · 경고 0으로 통과해 skill 본문을 바꾸지 않았다(증거 `.scratch/onboard/evidence/K/`).
- 2026-10-24 사용자 요청으로 같은 초안 배치를 Opus high로 한 번 더 그려 Astra 초안과 비교했다. 사용자가 Opus 초안 + Astra의 셸별 PATH 타일을 골랐고, 열린 질문 3개(MCP unknown 때 Connect, 4단계 Done만, 단계 표시기 체크)를 답했다. B2(Opus)가 반영해 `4a44adc`로 통합했다. 단계 표시기 완료 판정은 지휘자가 정했다(`dadb603`). 두 원본 초안은 `.scratch/onboard/evidence/`에 보관했다.
- 2026-10-24 사용자가 초안 검토를 생략하고 계속 진행하라고 했다. 초안 확정 게이트는 이 지시로 통과한 것으로 기록한다.
