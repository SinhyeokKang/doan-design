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
