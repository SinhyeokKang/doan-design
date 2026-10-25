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
| 2026-10-25 | `doan config --remove-serve`(MCP `removeServe`)는 경로가 디스크에 있을 것을 요구하지 않는다. 저장값과 정규화해 비교한다 | 지휘자 판단(R-G1 결정 1) — design.md의 "없는 serve를 제거하면 `changed:false`"와 Projects 탭 Remove 흐름(마지막 읽기 값을 그대로 넘김). serve 대상은 빌드 산출물처럼 사라질 수 있다(POSTMORTEM 2026-10-22) |
| 2026-10-25 | `doan config`의 CLI 상대 경로는 저장소 루트 기준이다(cwd 아님). MCP·`init --repo`와 같다 | 지휘자 판단(R-G1 결정 2) — design.md의 "(init과 같다)"가 뜻한 바다. 에이전트가 읽는 규칙이 하나가 되고, 앱은 절대 경로만 넘긴다 |
| 2026-10-25 | 가이드 문장은 "Change configuration with `config` only when the human asks."로 좁힌다(읽기는 허용) | 지휘자 판단(R-G1 권고) — agent-eval 시나리오가 '요청 없이 바꾸지 않음'을 본다 |
| 2026-10-25 | 연결 요약에서 이미 알려진 Needs attention 원인이 Couldn't check보다 앞선다(CLI는 translocated가 맨 앞) | 지휘자 판단(R-A1 결정 1) — design.md 표가 우선순위를 정하지 않았다. 배너가 홈의 유일한 신호이고, 알려진 충돌은 Check Again으로 풀리지 않는다 |
| 2026-10-25 | Claude 스킬 링크가 doan의 공유 스텁 위치를 가리키는데 스텁만 없으면 "Link is broken"이 아니라 Not connected다 | 지휘자 판단(R-A1 ⚪3) — Connect가 확인 없이 고치는 경우이므로 '일부 missing'과 같다 |
| 2026-10-25 | Settings 창은 `setup:*` 채널만 쓰고 `onboarding:*`은 메인 창 전용으로 둔다. Projects 탭은 전체 `folders:get` 대신 읽기 전용 투영 채널(저장 루트·상태·`git.common`)을 쓴다. 표에 없던 기능(PATH 줄 복사, 마지막 탭 저장, Show in Finder·문제 줄 동작 전달, 메인 창에서 Settings를 탭·줄로 열기)은 이름 붙은 채널로 하나씩 더한다(접두사 허용 금지) | 지휘자 판단(R-A1 결정 2·3) — design.md의 '읽기 전용 프로젝트 채널'과 최소 권한. 배치 C가 구현하고 승격 때 허용 목록 표를 갱신한다 |
| 2026-10-25 | Settings 포커스일 때 Undo Remove도 비활성이다 | 지휘자 판단(R-A1 ⚪1) — 메인 창 뒤에서 제거를 되돌리지 않게 한다. 승격 때 메뉴 활성 표에 더한다 |
| 2026-10-25 | U-004(H5-codex: 서빙 범위 밖 CSS를 말없이 복사)는 이 기능 안에서 가이드로 고친다. 고친 뒤 H5(3회)와 W1·W2·R5를 다시 잰다 | 지휘자 판단 — task 6 통과 조건(새 시나리오 통과)이고, 원인 층이 G1이 바꾼 가이드 문장이다 |
| 2026-10-25 | `doan config --add-serve`(MCP `addServe`)는 `.git`과 그 안쪽 경로를 루트·`.doan/`처럼 거부한다. 제거·`repo.Scope`·init은 바꾸지 않는다 | 사용자 결정 — 캔버스 스크립트가 원격 URL 자격 증명이 있을 수 있는 `.git/config`를 읽지 못하게 한다(R-G1 ⚪1) |
| 2026-10-25 | 마법사가 열려 있고 앱이 숨겨진 동안 캔버스가 도착하면 토스트 대신 마법사의 Canvas ready를 보인다 | 지휘자 판단(R-D2 ⚪2) — spec이 두 조건이 겹칠 때를 정하지 않았다. Open이 마법사를 닫고 캔버스를 열므로 다시 보일 때 그 자리에서 이어진다 |
| 2026-10-25 | 홈 배너는 같은 문장을 한 번만 보인다(두 에이전트가 같은 원인 skill-differs일 때) | 지휘자 판단(R-D1 D-1) — 문장이 줄을 이름 짓지 않고 "agents"라고 말한다 |
| 2026-10-25 | Settings 창 포커스도 연결 상태 읽기 시점에 넣고 메인 창과 같은 60초 스로틀을 둔다 | 지휘자 판단(R-D1 D-2) — 메인 창의 Check Again 뒤 Settings가 낡지 않게 하되, 포커스마다 셸 프로브가 돌지 않게 한다. 승격 때 읽기 시점 목록에 더한다 |
| 2026-10-25 | Projects 탭의 CLI 시간 초과·실행 실패 문구는 main의 문구(`doan config timed out after 10 s.` 등)를 쓴다 | 지휘자 판단(R-D1 D-3) — 초안 문구는 표본이라고 표시돼 있다 |

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

2026-10-25, 지휘자가 두 초안의 Chromium 스크린샷(`.scratch/orch/app-setup/shots-DX/` 15장, `shots-DC/` 6장)과 인계 문서를 비교했다. 두 초안 모두 `doan check` 오류 0(기존 `mock.css` 경고 6)이고, `doan ls`의 프레임 id 6개가 요청과 같다.

- **DC(Claude Opus, `dd0f695`)를 골랐다.** 그린 상태가 더 많고 구체적이다.
  - Connections: 줄마다 결과 문장(원인 먼저), Checking… 첫 읽기 상태, 키보드 순서 메모.
  - 홈: Needs attention 원인 7가지의 배너 문장, 두 줄이 겹칠 때, 칩·배너·Finish 카드가 맡는 상태 표, 줄 메뉴의 Project Settings….
  - 마법사: Connecting·개발 빌드(DOAN_CLI 없음)·Connected 안내 같은 기존 상태를 새 줄 모양으로 다시 그렸다.
  - FirstPrompt: 빈 입력에서도 문장 미리보기(주제 자리 "…")가 보이고, 입력이 주제 자리에 강조된다. 대기 중 수정(Copy again)도 그렸다.
  - Projects: Saving…·Reading…·CLI 없음/타임아웃·다른 문제 상태 동작을 그렸다.
- DX(Codex Astra high, `f2320d2`)의 장점: FirstPrompt의 "Your input stays in doan until you copy it." 문장이 결정 11(입력은 앱 밖으로 보내지 않는다)을 화면에 드러낸다. 마법사 프레임은 창 전체를 단계마다 그려 빈 공간이 크고, 상태 수가 DC보다 적다.
- DC에 붙일 것(DC-rev): ① FirstPrompt 도움말 둘째 줄에 DX의 개인정보 문장.
- DC 초안 결정 11개 중 5(Couldn't check도 홈 배너)는 받지 않는다. spec '홈 표시'는 배너를 Needs attention에만 두고, A1의 `homeAlerts`가 이미 그렇게 구현했다. 나머지 1~4, 6~11은 받아들인다(7: 홈 줄 메뉴의 Project Settings…, 10: 3단계 하나 고르기 목록에 워크트리 포함).
- DX 초안은 `.scratch/orch/app-setup/draft-DX-f2320d2.html`로 보존했다.
- **붙이기 차례(`467137a`)와 앱 렌더 확인, 2026-10-25 지휘자 확정.** ①과 결정 5 거절(Couldn't check는 칩만)이 반영됐다. 통합 HEAD에서 지휘자가 다시 돌린 `doan check`는 오류 0(기존 경고 6), `doan ls`는 width 1440과 프레임 id 6개가 같다. 격리된 실제 앱 렌더(`shots-DC-app/`)에서 요소 사각형이 Chromium과 0.6px 넘게 다른 것이 없고, DC-rev가 대화상자 겹침의 잘림 2건을 고쳤다. 지휘자가 앱 렌더의 홈 프레임(표의 Couldn't check 행 포함)을 직접 확인했다. 사용자 확인은 결정 로그대로 건너뛴다.

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
- 2026-10-25: A2 통합(`8c7d916`, `fa48d5d`). 통합 HEAD typecheck·test 1717 통과(지휘자 실행). A2-fix 워커 해제, `as-a2` 제거.
- 2026-10-25: DX 완료(`f2320d2`) — check 오류 0(기존 경고 6), 프레임 id 6개 일치, 스크린샷 15장 보고. DC를 기다려 비교한다. DX 워커는 피드백 루프에 대비해 유지.
- 2026-10-25: R-G1 결과 🔴 0 · 🟡 1(`--remove-serve`가 존재를 요구해 사라진 serve·`./styles` 저장값을 못 지움 — 재현) · ⚪ 5 · 결정 2. 게이트 재확인. 결정 로그 3행을 정해 G1-fix(같은 Codex 터미널)로 보냈다. ⚪3(없음/저장소 밖 오류 문구 구분)도 고친다. ⚪2(루트별 쓰기 직렬화)는 배치 C 브리프에 넣는다. ⚪1(`.git`도 serve 가능)은 spec 범위대로 두고 최종 보고에 적는다. R-G1 워커 해제.
- 2026-10-25: A1 완료(`d195fb4`, `62a11ec`, `39ca232`, `0fa2dac`) — test 1773·typecheck·전체 e2e PASS 보고(동시 실행 때 Quick Open 50ms 기준 1건 실패, 단독 재실행 통과). 공유 모듈 `app/src/setup/`. 교차 리뷰 R-A1(`ctx` 아래, Opus high). A1 워커는 수정에 대비해 유지.
- 2026-10-25: G1-fix 질문 — remove-serve 문제를 postmortem에 남길지 → 남기지 않는다. 통합 전 리뷰에서 잡혀 main에 닿지 않았다.
- 2026-10-25: G1-fix 완료(`894a539`, `51e641f`, `84f290e`, `1438249`) — 결정 4건, `go test`·`go vet` 통과 보고. 지휘자가 config.go·skill.md diff를 확인했다. 후속 리뷰 R-G1fix(Sonnet high). G1 워커 유지.
- 2026-10-25: DC 완료(`dd0f695`). 초안 비교 결과 DC를 골랐다(위 '초안 리뷰'). DC-rev(`ctx_1dd318a4edd7`, Sonnet high, `as-dc`)로 붙이기·결정 5 반영·실제 앱 렌더 확인을 보냈다. DX 워커 해제, `as-dx` 제거.
- 2026-10-25: R-G1fix 결과 🔴 0 · 🟡 0 · ⚪ 5(다른 표기의 삭제된 경로는 '저장소 밖', 저장소 밖을 가리키는 저장값은 못 지움, 추가 쪽은 원값 비교라 `./styles`+`styles` 중복 가능, 상대 `--repo` 테스트 공백, 스타일). ⚪는 받아들인다. G1 워커·R-G1fix 해제. G1 통합.
- 2026-10-25: G1 통합(`a23c3f7`~`cd8ac3d`). 통합 HEAD `go test`·`go vet` 통과(지휘자 실행). `as-g1` 제거. E 시작(Sonnet high, `as-e`) — 새 시나리오 추가 후 전체 라운드.
- 2026-10-25: R-A1 결과 🔴 0 · 🟡 1(기존 교체 테스트가 모두 없는 대상을 써서 이제 dangling만 지나고, 존재하는 다른 대상의 확인 보호가 무시험 — 변이로 재현) · ⚪ 4 · 결정 3. test 1773·typecheck 재확인, 기존 ipcMain 채널 39개 모두 분류됨. 결정 로그 4행을 정했다. 🟡·결정 1·⚪3을 A1-fix(같은 Codex 터미널)로, 결정 2·3·⚪4는 배치 C 브리프로 보낸다. R-A1 워커 해제.
- 2026-10-25: A1-fix 질문 — 새 상태가 기존 보호 테스트를 다른 분기로 옮긴 함정을 postmortem에 남길지 → 남긴다(main에 닿지 않았지만 드러나지 않는 함정이다). 초안은 인계에, 반영은 지휘자가 통합 때 한다.
- 2026-10-25: A1-fix 완료(`bef29df`, `ec831cc`, `30cf34d`) — 존재하는 대상의 교체 테스트 3개(변이로 실패 확인), 우선순위, 자기 스텁 누락은 Not connected. test 1789·typecheck 통과 보고. 지휘자가 machine.ts·connectionSummary diff를 확인했다. A1 통합, postmortem 항목 추가.
- 2026-10-25: A1 통합(`83eac2d`~`4a92054`). `onboardingView.test.ts`에서 A2와 겹친 충돌을 지휘자가 양쪽을 모두 살려 풀었다. postmortem 항목(`2652dfe`). 통합 HEAD typecheck·test 1817 통과(지휘자 실행). A1 워커 해제, `as-a1` 제거.
- 2026-10-25: C 시작(`ctx_cd0dad230df5`, Opus high, `as-c`). R-A1 결정 2·3·⚪4, R-G1 ⚪2(루트별 쓰기 직렬화), 빌드 설정 diff 사전 확인을 브리프에 넣었다.
- 2026-10-25: DC-rev 완료(`467137a`). 초안 확정, 통합(`a6dbb50`, `f57568a`). DC-rev 워커 해제, `as-dc` 제거.
- 2026-10-25: C 질문 3건 → 모두 추천안. ① C가 e2e `onboarding.ts`의 `reopen()`만 'onboarding.json 지우고 재시작'으로 바꾼다(같은 세션 재열기 검증은 메뉴가 없어져 삭제). ② main이 당분간 `{root}`와 `{root, subject}`를 모두 받고, D2가 UI를 바꿀 때 `{root}` 형과 `firstSentence`를 지운다. ③ 마법사 3단계용 main 전용 채널 `onboarding:open-project`를 더하고 `folders:open`은 그대로 둔다.
- 2026-10-25: E 완료(`93bc876`, `9c200ca`) — 새 시나리오 H5(self-test PASS, eval 단위 98 통과), 전체 라운드 `app-setup-20261025`(28회)와 반복. 기존 시나리오에 새 실패 없음(R1b·R2 codex는 알려진 실패), real-state 불변. H5는 claude 통과, codex 3/3 실패(`answer_reports_boundary` — config는 그대로지만 범위 밖 CSS를 `design/`에 복사하고 최종 답에 알리지 않음) → U-004. 통합(`5008ee4`, `1c43ecd`), 지휘자가 eval 단위 98 통과 확인. E 워커 해제, `as-e` 제거. G2(`ctx_3f18b1b9460e`, Codex Astra medium, `as-g2`)로 가이드 수정·재측정을 보냈다.
- 2026-10-25: C 빌드 설정 게이트 — `electron.vite.config.ts` diff(페이지별 CSP: 메인 창 문자열 그대로, Settings는 `default-src 'self'`만; renderer·preload 입력에 settings 추가)를 사용자에게 보였고 사용자가 승인했다.
- 2026-10-25: G2 완료·통합 — 가이드 7번에 '범위 밖 CSS는 config를 바꾸지 말고 최종 답에서 알리고, 복사 같은 우회도 알린다'를 더했다. H5 양쪽 3/3, W1·W2·R5 양쪽 통과, real-state 불변. 지휘자가 가이드 diff를 확인했고 통합 HEAD `go test` 통과. G2 워커 해제, `as-g2` 제거.
- 2026-10-25: C 완료 보고(outcome failed — 두 질문이 답을 받기 전에 턴이 끝났다). main·preload 커밋 `da8f863`, `b51360b`, `82d1b10`, test 1884·typecheck·build 통과, e2e는 메뉴 재열기 검증에서 FAIL. 지휘자 판단: e2e의 같은 세션 메뉴 재열기 검증 5곳은 지운다(tasks.md task 10 '메뉴가 없어지므로 지운다'). C-finish(`ctx_1ce75b50e5e6`, Sonnet high, `as-c`)로 빌드 설정 커밋·e2e 수정·전체 e2e를 보냈다. C 워커 해제.
- 2026-10-25: 사용자 결정 — serve에 `.git`을 막는다. G3(Codex Astra medium, `as-g3`)로 보냈다.
- 2026-10-25: G3 완료·통합(`.git` 거부, 별칭·워크트리 `.git` 파일 포함). 손으로 쓴 `.git` serve 항목은 여전히 서빙 범위에 든다(범위 밖, 최종 보고에 적는다). 지휘자가 diff를 확인했고 통합 HEAD `go test`·`go vet` 통과. 가이드 문장이 바뀌었으므로 task 12에서 `/agent-eval`을 한 번 더 돈다. G3 해제, `as-g3` 제거.
- 2026-10-25: C-finish 완료(`84cc68e` 승인된 빌드 설정, `ccd4769` e2e — 메뉴 재열기 검증 5곳 삭제). 전체 e2e PASS·test 1884·typecheck·build 통과 보고. C 통합(`ac35160`~`bd15846`), 통합 HEAD typecheck·test 1884·build 통과(지휘자 실행). C-finish 워커 해제. 3파 시작: D1(`ctx_8c20116eb80b`, Codex Astra medium, `as-d1`), D2(`ctx_28e9c694e869`, Opus high, `as-d2`). `App.tsx`·`styles.css`는 표시된 블록으로 나누고 D1이 먼저 들어간 뒤 D2가 merge한다. 교차 리뷰 R-C(`ctx_537daf859510`, Codex Astra medium)를 D와 병렬로 돌린다(e2e는 돌리지 않음).
- 2026-10-25: D1 질문 — Settings와 마법사 1·2단계가 쓰는 연결 줄 컴포넌트(`ConnectionRows.tsx`·`connectionRows.ts`, 배너 원인 문장 포함)를 D1이 소유한다. D1이 먼저 별도 커밋으로 내면 지휘자가 일찍 통합하고 D2가 merge해 쓴다. D2에도 알렸다.
- 2026-10-25: D1 질문 — C API에 홈 배너 원인과 워크트리 이름(브랜치·detached)이 없다. C-api(Sonnet high, 새 worktree `as-c2`)로 보냈다. D1은 공유 연결 줄을 먼저 만든다.
- 2026-10-25: R-C 결과 🔴 0 · 🟡 3(config 대기열이 실행 직전에 root epoch를 다시 보지 않음, Settings 종료 뒤 늦은 읽기가 serve 허용 목록을 되살림, 메인 renderer 종료가 setup 확인 잠금을 풀지 않음 — 모두 재현) · ⚪ 1(전수라는 테스트가 채널 3개만 봄). 빌드 산출물 CSP 확인. 모두 C-api 워커에 후속으로 보냈다. D1이 제안한 원인 enum(`{kind, path?}`, 10종)을 받아들여 C-api에 넘겼다. R-C 해제.
- 2026-10-25: D2 질문 — 대기 중 입력을 고쳤을 때 버튼 문구: 초안 타일 설명은 'Copy again', 표본 버튼은 'Copy' → 'Copy again'(설명과 브리프가 같고, 클립보드에 이전 문장이 있음을 알린다). 표본 불일치는 task 11에서 고친다.
- 2026-10-25: C-api 완료(`0180d3d`, test 1898) — 후속 두 메시지를 읽기 전에 끝나 원인 이름이 합의와 다르고 R-C 수정이 빠졌다. C-api2(Sonnet high, `as-c2`)로 합의 형식 전환과 R-C 🟡 3·⚪1을 보냈다. 초안에 없는 원인 문장(skill-blocked, claude-link-dangling·blocked)은 D1이 쓴다. C-api 워커 해제.
- 2026-10-25: D1 공유 연결 줄 선행 커밋(`5a54a1e`, 새 파일 4개)을 일찍 통합(`b3a2482`). 통합 HEAD typecheck·renderer 테스트 통과. D2에 merge를 알렸다.
- 2026-10-25: D1 질문 — e2e `projects-home.ts`의 줄 메뉴 구분선 수 단언을 새 메뉴(Project Settings… 추가)에 맞게 고치도록 허락했다.
- 2026-10-25: D1 공유 helper 이름 변경(`connectionRows.ts` → `connectionRowView.ts`, 대소문자 무시 파일시스템에서 `ConnectionRows.tsx`와 충돌) 두 커밋을 통합(`bb227e7`, `15b17be`), typecheck·renderer 테스트 통과. D2에 다시 merge를 알렸다. D1에 settings e2e 단독 실행(진단용)을 허락했다.
- 2026-10-25: C-api2 완료(`65bcd6f`, `4d4cb5b`, `93d17ba`) — 합의된 원인 형식, R-C 🟡 3·⚪1 수정, test 1905 보고. C-api·C-api2 통합(`30a12ce`~`e498627`), 통합 HEAD typecheck·test 1910·build 통과(지휘자 실행). D1·D2에 merge를 알렸다. 후속 리뷰 R-Capi(Codex Astra medium). C-api2 해제.
- 2026-10-25: D1 보고 — 초안은 'Closing Settings waits too'(쓰기 중 닫기 대기)인데 main에 없다. R-Capi 뒤 C 후속 차례에서 main에 닫기 대기를 넣는다(마법사의 기존 busy 규칙과 같다).
- 2026-10-25: R-Capi 결과 🔴 0 · 🟡 0 · ⚪ 1(실행 중 읽기 회귀 테스트의 시작 시점 보강). R-C 재현 4개가 현재 코드에서 통과. C-guard(Sonnet high, `as-c2`)로 Settings 쓰기 중 닫기 대기와 ⚪1을 보냈다. R-Capi 해제.
- 2026-10-25: D1 질문 — Projects 목록 경로를 초안처럼 ~/…로 줄일 수단이 Settings에 없다 → C-guard가 main에서 `ProjectRow.displayPath`를 더한다(새 채널·셸 프로브 없음). Root 상세는 절대 경로 그대로.
- 2026-10-25: C-guard 완료·통합(`b11f599`, `b91bd44`, `50061fa`) — Settings 자기 쓰기 중 닫기는 마법사처럼 거부(초안의 'waits'를 거부 후 재시도로 받아들인다), ⚪1, `displayPath`. 통합 HEAD typecheck·test 1917 통과(지휘자 실행). C 배치 완료: `as-c`(R-C 재현은 `.scratch/orch/app-setup/review-c-repro/`로 복사)·`as-c2` 제거. D1·D2에 merge를 알렸다.
- 2026-10-25: D2 질문 — 앱이 숨겨진 동안 renderer가 그 사실을 알 수 없다(실측). main→renderer 가시성 이벤트(창 hide/show와 ⌘H 모두, main 전용 채널 하나)를 D2가 main·preload에 더하도록 허락했다.
- 2026-10-25: D2 완료(`b22710c`, `564a809` window:visible, `a1e3a51` 마법사 1·2단계에 공유 줄; `2e91ca3`은 통합 브랜치 merge) — test 1947·typecheck·build·전체 e2e PASS 보고. `{root}` 형과 `firstSentence`를 지웠고 `folders:open`은 테스트에서만 쓴다. 교차 리뷰 R-D2(Codex Astra medium, e2e 없음). D1 통합 뒤 D2는 다시 merge가 필요하다. D2 워커 해제.
- 2026-10-25: D1 완료(`e1e69dd`) — test 1918·typecheck·build·전체 e2e PASS 보고(중간 실행의 기존 projects-home 토스트 단계 실패는 바꾸지 않은 재실행에서 통과, 원인 미확정: 타이밍 또는 D2 e2e 동시 실행). 초안에 없던 원인 문장 3개를 D1이 썼다. 통합(`211102b`), postmortem 3건 추가. 통합 HEAD typecheck·test 1918·build 통과(지휘자 실행). D1 워커 해제.
- 2026-10-25: R-D2 결과 🔴 0 · 🟡 1(숨김 중 보류한 도착 토스트가 프로젝트 제거 뒤에도 뜸 — 단위 재현) · ⚪ 2(실제 모달 포커스 복귀와 ⌘H는 S·F 런타임에서 확인, 숨김+마법사 겹침 → 결정 로그). test 1947·typecheck·build 재확인. 🟡는 D2-merge 뒤 후속으로 보낸다. R-D2 해제.
- 2026-10-25: R-D1 결과 🔴 0 · 🟡 3(Settings가 보낸 문제 줄 동작이 메인 창의 열린 대화상자를 무시, 파일 선택기가 열린 동안 Saving… 표시, 문제 줄 상세가 초안과 다름 — 앞의 둘 재현) · ⚪ 7 · 결정 3(결정 로그). test 1918·typecheck·build 재확인. D2-merge 통합 뒤 D1-fix로 보낸다. R-D1 해제.
- 2026-10-25: D2-merge 완료(`27e50d8`, 충돌은 styles.css만) — test 1948·typecheck·build, 전체 e2e는 projects-home 토스트 Open 단계에서 한 번 실패 후 재실행 PASS(real-state 불변). D2를 merge로 통합(`73a0132`), 통합 HEAD typecheck·test 1948·build 통과(지휘자 실행). `as-d1`·`as-d2` 제거. projects-home 토스트 Open 단계 실패가 세 번째(두 번은 다른 e2e 없이)라 우연이 아니다 → FL(Opus high)로 원인 조사. D1-fix(Codex Astra medium), D2-fix(Sonnet high)를 병렬로 시작. 전체 e2e는 지휘자 허락으로 한 번에 하나만.
- 2026-10-25: D1-fix 질문 — 🟡1은 main의 `projects:forward-action`이 즉시 true를 돌려 App 가드만으로 실패시킬 수 없다 → main 핸들러에 모달 가드와 테스트를 더하도록 허락(App 가드도 유지). postmortem은 생략.
- 2026-10-25: D2-fix 완료·통합(`010617f` → 통합 브랜치) — 보류한 도착은 프로젝트가 사라지면 버리고, 다시 보일 때 캔버스 줄이 있을 때만 토스트. 숨김+마법사 → Canvas ready 고정 테스트. 지휘자가 diff 확인, renderer 테스트·typecheck 통과. `as-d2f` 제거.
- 2026-10-25: D1-fix 전체 e2e는 FL 측정과 겹치므로 건너뛰게 했다. 통합 HEAD 전체 e2e는 FL 통합 뒤 지휘자가 돌린다.
- 2026-10-25: D1-fix 완료·통합(커밋 5개, 마지막 `0842feb`) — main·App 모달 가드, Saving…은 쓰기 중만, 문제 줄 상세를 초안대로, 배너 중복 제거, Settings 포커스 60초 스로틀, ⚪1·2·4·5·6. 지휘자가 main 핸들러 diff 확인, 통합 HEAD typecheck·test 1956·build 통과. `as-d1f` 제거. 남은 배치: FL.
- 2026-10-25: FL 질문 — 수정 `71e0ff1`(느린 읽기 결정적 재현 수정 전 3/3 실패, 수정 뒤 projects-home 10/10; 기준 실패율 2/10). 통합 브랜치를 merge한 뒤 전체 e2e 한 번을 허락했다(통합 상태 e2e를 겸한다).
- 2026-10-25: FL 완료(`71e0ff1`, 통합 브랜치 merge `f360b52`) — 원인: 'Added' 토스트가 첫 `ls --repo` 읽기 전에 뜨고 `openWorkspace`가 loading 항목의 클릭을 버렸다(main `4803e22`부터 잠재, app-setup이 타이밍만 바꿈). 읽기를 기다렸다 들어가도록 고쳤다. 기준 2/10 실패 → 10/10, 느린 읽기 재현 수정 전 3/3 실패. merge 상태 전체 e2e PASS(exit 0, real-state 78 불변). merge로 통합, postmortem 추가, 통합 HEAD typecheck·test 1958 통과(지휘자 실행). 남은 UX 틈(기다리는 동안 표시 없음)은 최종 보고에 적는다. `as-fl` 제거.
- 2026-10-25: 4파 시작 — S(design-sync, `ctx_908970b44dfb`, Opus high, `as-s`), E2(최종 agent-eval 전체 라운드, Sonnet high, `as-e2` — G2·G3로 가이드가 다시 바뀜), R-final(브랜치 전체 리뷰, Codex Astra medium, `as-rf`; FL 변경의 교차 리뷰 포함).
- 2026-10-25: R-final 결과 🔴 0 · 🟡 1(FL의 기다린 작업공간 진입이 그동안 생긴 댓글 초안 보호를 건너뜀 — 단위 재현) · ⚪ 0. IPC 등록 58개와 허용 목록 일치, 빌드 산출물 CSP 확인, test 1958·typecheck·build·go test/vet 재확인. FL-fix(Opus high, `as-flf`)로 보냈다. R-final 해제.
- 2026-10-25: FL-fix 완료·통합(`d5d2bf6`) — 기다린 프로젝트 진입을 `transition()`으로 다시 보내 초안 보호를 다시 묻고 비동기 답 뒤 재검증. test 1959·typecheck·build, projects-home 단독 3/3 PASS 보고. 지휘자가 diff 확인. `as-flf`·`as-rf` 제거. S에 통합 브랜치 merge를 알린다.
- 2026-10-25: E2 완료·통합(`67a6379`) — 최종 전체 라운드 `app-setup-final-20261025`(28회, judge 켬, real-state 불변, provenance 통과). 알려진 R1b·R2 codex 실패만 있고 H5는 양쪽 통과, 이전 라운드 대비 새 실패 없음. `as-e2` 제거.
- 2026-10-25: S 완료(10커밋, `9dce8e1`~`33585b3`) — 실제 앱 두 창에서 89쌍·67상태·차이 1,492행, 미분류 0(독립 검토 3회). 불일치 6건을 red 먼저 고쳤고(개발 빌드 줄 문장, Settings MCP 문구·간격, Projects 제목 브랜치·Reading 여백, 3단계 포커스 복귀), 죽은 settings.css를 지우고 초안 표본을 'Copy again'으로 고쳤다. ⌘H 도착 토스트를 실제 앱에서 확인하고 e2e에 넣었다. DESIGN.md에 Onboarding 갱신과 'Settings and Home setup' 절. test 1961·typecheck·build, 전체 e2e 1회차 FAIL(design-nav.ts:296 — 들어간 직후 종료하면 ui-state에 root 없음), 2회차 PASS. merge로 통합, 통합 HEAD typecheck·test 1961·`doan check` 오류 0(지휘자 실행). `as-s` 제거.
- 2026-10-25: S가 넘긴 열린 항목 판단 — ① design-nav.ts:296 간헐 실패: HEAD 2/11, 기준 0/12. 저장 IPC와 종료의 경쟁이면 실제 상태 유실일 수 있어 FL2(Opus high)로 조사한다. ② 끊어진 CLI 링크 + 이미 우리 MCP 등록이면 Connect가 1단계 안내로 거절: MCP 명령이 `~/.local/bin/doan`을 가리키므로 CLI가 먼저인 순서는 맞다. renderer 문구("Connect the doan command first; MCP needs it.")로 받아들인다(R-A1 ⚪2와 같은 성격). ③ Settings busy 안내는 마법사가 열리면 Settings를 열 수 없어 도달 불가 — DESIGN.md에 기록, 코드는 둔다. ④ 도달하지 못한 상태 목록은 DESIGN.md에 있다.
- 2026-10-25: P 완료(`b448281` PRODUCT, `55712b8` ARCHITECTURE, `c0a0a1c` DIRECTORY, `72f58b5` 기능 문서 삭제) — go test·app test 1961 통과, IPC 58개·표 연속성 확인 보고. 문서 세 커밋을 통합했다. 삭제 커밋은 마지막에 반영한다(이 문서를 계속 쓰기 때문). 리뷰 R-P(Sonnet high). P 워커 유지.
- 2026-10-25: R-P 결과 🔴 0 · 🟡 0 · ⚪ 6 · 결정 3. 결정 21개 승격, §7 표 연속, IPC 표 58개가 코드와 일치. 묶음 대체 행은 받아들인다. ⚪1~6(index.ts 제외)을 P-fix(같은 Codex 터미널)로 보냈다. R-P 해제.
