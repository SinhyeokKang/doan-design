# app-setup — orch

- 원본: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md)
- 시작 해시: `4803e22`(main)
- 통합 브랜치: `feat-app-setup`(main에서 만듦)
- 지휘: Claude Code(Opus). 직렬 체인 3번(마지막) 고리(`.scratch/handoff/orch-chain.md`). 지휘자는 배치 코드를 고치지 않는다. 지휘자가 쓰는 것은 이 문서, 통합 커밋, 문서 최신화 커밋뿐이다.
- 지휘 자료(브리프·인계·리뷰·근거): `.scratch/orch/app-setup/`

## 결정 로그

| 날짜 | 결정 | 근거 |
|---|---|---|
| 2026-10-25 | Codex 워커를 넓게 쓴다. 배치마다 Opus와 Codex를 섞고, 각 배치는 다른 모델 계열이 리뷰한다 | 사용자: "codex 허가. 여기저기 많이 사용해도 됨"(체인 인계 규칙) |
| 2026-10-25 | 초안은 Codex(`gpt-6-astra` high)와 Claude(Opus high)가 같은 요청으로 각자 그린다. 지휘자가 더 나은 초안을 고르고, 다른 초안에서 가져올 부분을 붙인다 | 사용자 요구(tasks.md '앞선 단계') |
| 2026-10-25 | 초안 게이트는 지휘자가 확정한다. 사용자의 앱 내 확인은 건너뛴다. `/design-draft`가 사용자에게 묻는 질문도 지휘자가 받는다(워커는 `ask`) | 사용자(체인 인계 규칙, 세 기능 공통) |
| 2026-10-25 | 초안 요청: 캔버스 `design/app-setup.html`, canvas id `app-setup`. 프레임 id는 `settings-connections`, `connection-rows`, `settings-projects`, `home-setup`, `wizard`, `first-prompt`다 | 지휘자 판단 — tasks.md '초안 범위'의 다섯 묶음을 프레임으로 나누고, 줄 5상태·펼친 줄은 표 프레임(`connection-rows`)으로 따로 뺐다. 기존 초안의 kebab-case id 관례를 따랐다 |
| 2026-10-25 | design-nav task 12(0개 작업공간의 FirstPrompt 통합)를 이 기능의 task 10이 맡는다 | orch-chain.md — 나중에 병합되는 쪽이 통합한다. design-nav가 먼저 병합됐다(PRODUCT §7) |
| 2026-10-25 | Settings 창의 마지막 탭은 `ui-state.json`에 저장한다 | design.md '창과 preload' — design-nav가 main에 있으므로 메모리 대안은 쓰지 않는다 |
| 2026-10-25 | `/agent-eval`에 "요청 없이 config를 바꾸지 않음" 시나리오를 새 id로 더한다 | 지휘자 판단 — 가이드에 새 제한 문장이 생기고, 그 효과는 시나리오로만 확인된다(design.md '근거와 범위') |
| 2026-10-25 | Settings…는 앱 메뉴의 About 바로 다음, "Set Up doan…"이 있던 자리에 둔다 | 지휘자 판단 — macOS 관례이고 기존 메뉴 순서를 바꾸지 않는다 |

## 배치

| 배치 | tasks | 파일 소유 | 선행 | 모델 · 노력 (이유) | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| DX | 앞선 단계(초안, Codex 쪽) | `design/app-setup.html`(자기 worktree) | — | Codex Astra high (사용자 지정) | `doan check` · `doan ls`(프레임 id 일치) | 대기 |
| DC | 앞선 단계(초안, Claude 쪽) | `design/app-setup.html`(자기 worktree) | — | Claude Opus high (사용자 지정, 공정 비교) | 위와 같다 | 대기 |
| A1 | 1 | `app/src/main/onboarding/states.ts`(+test), `app/src/main/menuState.ts`(+test), 새 순수 함수 파일(`connectionSummary`·`senderAllowed`·`setupLock`·`homeAlerts`) + 테스트 | — | Codex Astra medium (IPC 허용 목록·잠금은 보안 경계다) | `npm --prefix app test` · `typecheck` | 대기 |
| A2 | 2 | `app/src/renderer/onboardingView.ts`(+test), 새 순수 함수 파일(`promptSentence`·`firstPromptReducer`·`arrival`) + 테스트 | — | Claude Sonnet high (규칙이 문서에 다 있다) | 위와 같다 | 대기 |
| G1 | 3, 4, 5 | `cli/`(새 config 연산·명령, `mcp.go`, `skill.md`, `active.go`·`active_test.go`) | — | Codex Astra medium (경로 검증·원자적 쓰기·MCP 표면) | `go test ./...` · `go vet ./...` | 대기 |
| E | 6 | `eval/scenarios/`(새 시나리오), `docs/USABILITY-EVAL.md` | G1 통합 | Claude Sonnet high (실행·기록 위주, 판정은 다른 계열 judge가 한다) | `self-test PASS`, 라운드 기록 | 대기 |
| C | 7, 8 | `app/src/main/`(index·view·새 settings 창·IPC·config 브리지), `app/src/preload/`(기존 + 새 settings preload), `app/electron.vite.config.ts`, 새 `app/src/renderer/settings.html`(빈 진입점), `app/src/main/index.test.ts` | A1·A2 통합 | Claude Opus high (창별 IPC 보안, 동시성, 빌드 설정) | test · typecheck · build | 대기 |
| D1 | 9 | 새 `app/src/renderer/settings*`(Connections·Projects), `Home.tsx` 연결 칩·배너·Finish 카드, e2e 새 파일과 `windows.ts` 확장; `App.tsx`·`styles.css` 공유 편집은 D2와 순서를 맞춘다 | C·G1 통합, 초안 확정 | Codex Astra medium (UI 상태 표가 문서에 있다. C와 다른 계열) | test · typecheck · e2e(최종 PASS, exit 0) | 대기 |
| D2 | 10 | `Onboarding.tsx`, 새 `FirstPrompt.tsx`, `ProjectOverview.tsx`(0개 상태), `app/e2e/onboarding.ts`; `App.tsx`·`styles.css`는 D1 뒤 | C 통합, 초안 확정 | Claude Opus high (모달 포커스·도착 감지·클립보드 순서) | 위와 같다 | 대기 |
| S | 11 | `docs/DESIGN.md`, `.scratch/design-sync/`, 불일치 수정(D1·D2 파일) | D1·D2 통합 | Claude Opus high (design-sync 판단) | `/design-sync` 완료 조건, e2e PASS | 대기 |
| R-* | 배치별 리뷰 | 보고서만 | 각 구현 배치 | 다른 계열: A1·G1·D1 → Claude Opus high, A2·C·D2·S → Codex Astra medium | `/code-review`, 🔴 0 | — |
| F | 12 | 고침은 각 배치 소유자에게 돌린다 | 전부 통합 | 전체 `/code-review`: Codex Astra medium. `/runtime-test`: 지휘자 | task 12 명령 모두 통과 | 대기 |
| P | 13 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/DIRECTORY.md`, 이 디렉터리 삭제 | F | Codex Astra medium (문서 정확성), 리뷰 Claude Sonnet high | task 13 확인 | 대기 |

tasks.md의 앞선 단계와 task 1~13은 모두 위 배치 중 하나에 속한다.

## 순서와 파일 겹침

- 1파: DX ∥ DC ∥ A1 ∥ A2 ∥ G1. 서로 겹치는 파일이 없다. DX와 DC는 같은 파일을 각자 worktree에 그리고, 고른 쪽만 통합한다.
- 2파: C(A1·A2 통합 뒤) ∥ E(G1 통합 뒤). C의 단위 테스트는 `doan config`를 가짜로 둔다. 실제 CLI는 D1 e2e부터 쓴다. task 7의 electron-vite 설정 diff는 적용 전에 사용자에게 보이고 확인받는다.
- 3파: D1 ∥ D2(C 통합·초안 확정 뒤). `App.tsx`·`styles.css`·`windows.ts`는 겹친다. D1이 먼저 넣고, D2는 그 파일 편집을 D1 통합 뒤로 미룬다(브리프 '미룬 항목').
- 4파: S(task 11) → F → P.
- 각 배치는 `--worktree new-child --base-branch feat-app-setup`으로 만든 자기 worktree에서 돈다.

## 초안 리뷰

(대기)

## 진행 기록

- 2026-10-25: Run `run_b57025894603`. 1파 시작 — DX(`ctx_0467bcf57158`, Codex Astra high), DC(`ctx_e96089737d31`, Opus high), A1(`ctx_92cdade62997`, Codex Astra medium), A2(`ctx_8b0adeb5bac4`, Sonnet high), G1(`ctx_463ab6ba25e5`, Codex Astra medium). `launch.effective`가 요청과 같다.
- 2026-10-25: A1 질문 — ① `machine.ts` observeLink가 해석 오류 코드를 넘기도록 소유 범위에 더했다(대상 ENOENT만 `dangling`). ② 배너는 Needs attention만, Couldn't check만으로는 배너·카드 모두 없다. 배너가 있어도 Finish 카드를 통째로 숨기지 않는다 — 같은 항목이 둘에 나오지 않을 뿐이다(spec '홈 표시').
- 2026-10-25: A1 에스컬레이션 — `dangling` 추가가 `onboardingView.ts`의 전수 매핑에 걸린다. A1이 그 매핑만 별도 작은 커밋으로 고치고, A2에는 그 매핑을 건드리지 말라고 알렸다. `machine.ts`의 dangling 확인 보호도 A1의 최소 I/O 수정에 넣었다.
- 2026-10-25: DC 질문 — 마법사 1·2단계가 Settings Connections 줄(같은 5상태·동작, Details에 기존 항목 줄)을 그대로 쓸지 → 쓴다(지휘자 판단, spec '결과 중심, 경로는 Details'). 4단계 구성과 마법사 이동은 그대로다.
- 2026-10-25: A2 완료(`4ce1993`) — test 1716·typecheck 통과 보고. 새 모듈 위치 `app/src/firstPrompt/`(main·renderer 공유)를 받아들였다. 별도 `/code-review`는 돌리지 않았다. 교차 리뷰 R-A2(`ctx_d871d39dc0ff`, Codex Astra medium). A2 워커 해제.
- 2026-10-25: A1 질문 — e2e `onboarding.ts`의 끊어진 링크 기대값(Replace… → Fix…) 두 줄만 고치고 전체 e2e를 돌리도록 허락했다.
- 2026-10-25: G1 완료(`48eed1b`, `38d5cc6`, `38572e3`) — `go test`·`go vet` 통과 보고. MCP 상대 경로는 저장소 기준(design.md), CLI는 cwd 기준. 가이드의 'serve는 필요하면 더한다' 문장을 '사람에게 묻는다'로 좁혔다. 교차 리뷰 R-G1(`ctx_75cfbe12ac19`, Opus high). G1 워커는 수정 차례에 대비해 유지(retain).
- 2026-10-25: R-A2 결과 🔴 0 · 🟡 1(끝 마침표 여러 개를 하나로 줄이지 않음 — 재현) · ⚪ 0. test 1716·typecheck 재확인. 지휘자 결정: 말줄임표도 마침표 하나로 줄인다(design.md). A2-fix(Sonnet medium, `as-a2`)로 보냈다. R-A2 워커 해제.
- 2026-10-25: A2-fix 완료(`9764a95`). 지휘자가 diff를 확인했다. A2 통합.
