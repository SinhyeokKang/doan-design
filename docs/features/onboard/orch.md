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

## 배치

| 배치 | tasks | 파일 소유 | 선행 | 모델 · 노력 (이유) | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| A | 0, 1 | `docs/PRODUCT.md`, `AGENTS.md`, `.scratch/onboard/poc7/` | — | Codex Astra medium (격리 판단, 실제 설정을 보호해야 하고 PoC 판정이 필요하다) | tasks 0 · 1 검증, 실제 상태의 키 단위 비교 | 대기 |
| C | 3 | `cli/internal/repo/`, `cli/internal/cli/init.go`, `mcp.go`, `skill.md`(`--token-css` 설명만) | — | Codex Astra medium (경로 보안 경계) | `go test ./...` · `go vet ./...`, task 3 명령 | 대기 |
| B | 2 | `design/onboard.html` | A | Codex Astra medium (상태 설계 판단) | `doan check` · `doan ls`, 지휘자 리뷰, 사용자 확정 | 대기 |
| D | 4 | `app/src/main/onboarding/states.ts`(+test, `fixtures/`), `app/src/main/cli.ts`(`cliCommand`), `app/src/main/folderState.ts`, `app/src/renderer/onboardingView.ts`(+test) | A(fixture, 셸 출력 형식) | Codex Astra medium | `npm --prefix app test` · `typecheck` | 대기 |
| E | 5 | `app/package.json`, `app/package-lock.json`, electron-builder 설정, `.gitignore`, AGENTS.md 'Commands' | A(7d 버전), D | Codex Sol medium (기계적) | task 5 검증 | 대기 |
| F | 6 | `app/src/main/shell.ts`, `cli.ts`(`runLs` 주변), `index.ts`(IPC), `app/src/preload/` | D | Codex Astra medium (재루팅 · 동시성) | task 6 검증 + e2e | 대기 |
| K | 11 | `cli/internal/cli/skill.md`, `.scratch/onboard/observe/` | C, E | Codex Astra medium (관찰 판단, `claude -p` · `codex exec` 실행) | task 11 검증 | 대기 |
| G | 7 | `app/src/main/onboarding/`(states 외), `index.ts`(메뉴), `app/src/preload/`, `app/e2e/` helper, AGENTS dev 명령 | F, E | Codex Astra medium (저장소 밖 쓰기, 셸 실행) | task 7 검증 + e2e | 대기 |
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

(배치가 진행되면 추가한다)
