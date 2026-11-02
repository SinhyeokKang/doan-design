# project-settings — orch

출처: [spec](./spec.md)·[design](./design.md)·[tasks](./tasks.md). 부모: [buzz-restyle](../buzz-restyle/design.md) '자식 진행 규칙'. 체인: [chain-261103](../chain-261103/chain.md) 링크 2.

- 시작 해시: `7119e66e`(origin/main)
- 통합 브랜치: `feat/project-settings`
- 지휘자: Claude Code 세션 06b8fea0, worktree `project-settings-orch`
- 권한(체인 파일): 이 링크의 PR을 main에 병합한다. Codex 작업자를 섞어 쓸 수 있다.

## 결정 기록

- 초안: `buzz-project-settings.html`(61d515e8)은 체인 시작 점검에서 사용자가 확정했다(tasks '선행 조건'). `/design-sync`(T9)의 기준이다.
- Codex 사용: 지휘자 판단으로 이 링크에서는 Codex 작업자를 쓰지 않는다. 근거: 링크 1 끝에 Codex 상태줄의 주간 남은 양이 12%로 체인 기준(10%)에 가깝고, T8 `/agent-eval`이 실제 Codex를 돌려 같은 한도를 쓴다. 리뷰는 Claude 서브에이전트(Sonnet, 판단이 무거운 diff는 Opus)로 한다.
- 시작 시 사용량: Claude 7일 76%(2026-11-04 13:59 KST 초기화), Codex 대시보드 18%. Opus는 App 연결(A2)에만 쓴다.
- T10 문서 승격: 지휘자 판단. PRODUCT·ARCHITECTURE·BACKLOG와 DESIGN의 설명 문장은 지휘자가 통합 뒤에 쓴다. DESIGN의 측정값은 `/design-sync`를 맡은 배치 C가 쓴다. 근거: orchestrate §5와 design-sync skill. 링크 1과 같다.
- 사이드바 프로젝트 메뉴: 링크 1이 사이드바에서 여는 메뉴에 불투명 예외 `.shell-side-menu`를 붙였다. A2가 메뉴 항목을 바꿀 때 이 클래스를 유지한다(체인 인계 기록).

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| A1 | T1, T2, T3 | `app/src/renderer/addProjectsNav.ts`·`projectSettingsRules.ts`·새 `ProjectSettingsPage.tsx`와 각 테스트, 페이지 스타일(`styles.css`의 새 규칙만) | 없음 | Claude Sonnet high: 순수 함수와 연결 전 컴포넌트라 판단 범위가 좁지만 상태·포커스 표가 많다. Claude 사용량을 아낀다 | `npm --prefix app test`, `npm --prefix app run typecheck` | 대기 |
| B | T7 | `cli/internal/cli/skill.md`, `cli/internal/cli/skill_test.go` | 없음 | Claude Sonnet medium: 문서 다섯 곳과 고정 테스트. 사실은 design '가이드 수정'에 있다 | `go test ./...`, `go vet ./...` | 대기 |
| RA1 | A1 리뷰 | 읽기만 | A1 | Claude Sonnet 서브에이전트: 순수 함수·컴포넌트 diff | `/code-review` 보고서 | 대기 |
| RB | B 리뷰 | 읽기만 | B | Claude Sonnet 서브에이전트: 작은 문서 diff, 사실 대조 | `/code-review` 보고서 | 대기 |
| E | T8 | `docs/USABILITY-EVAL.md`, `.scratch/` | B 통합 | Claude Sonnet medium: 정해진 명령을 돌리고 기록한다 | `node eval/run.ts --scenarios O1,O2,D12,D9`, 직전 라운드 대비 | 대기 |
| A2 | T4, T5 | `app/src/renderer/`(`App.tsx`, `shellNavigation.ts`, `ShellSidebar.tsx`, `Home.tsx`, `ProjectOverview.tsx`, `CanvasController.ts`, `ProjectSetupDialog.tsx`, `configBridge.ts`, 다이얼로그 삭제, 각 테스트), `app/src/main/index.ts`, `app/src/preload/index.ts`, A1 파일의 연결에 필요한 수정 | A1 통합 | Claude Opus high: 잠금·origin·포커스·바깥 진입점이 얽힌 App 분기이고 POSTMORTEM 함정이 많다 | `npm --prefix app test`, typecheck, build, `grep` 확인 | 대기 |
| RA2 | A2 리뷰 | 읽기만 | A2 | Claude Opus 서브에이전트: 잠금·포커스 회귀 판단 | `/code-review` 보고서 | 대기 |
| C | T6, T9 | `.scratch/`, `docs/DESIGN.md`의 측정값, design-sync가 고치는 앱 코드(그때 A2는 끝나 있다) | A2 통합 | Claude Sonnet high: 실제 앱 probe와 computed style 측정. 판단이 무거운 지적은 지휘자가 가른다 | probe 완료 표식·exit 0, real-state 전후 같음, `measure.mjs` | 대기 |
| 지휘자 | T10 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/BACKLOG.md`, `docs/DESIGN.md` 설명 문장, 이 디렉터리, 병합 뒤 부모 문서 | C | — | `node .agents/skills/verify/scripts/verify.mjs`, T10 grep | 대기 |

리뷰 지적의 `/refactor`는 그 배치의 작업자가 한다.

## 파일 겹침과 순서

- A1과 B는 파일이 겹치지 않아 병렬로 돈다.
- E는 B를 통합한 feat에서 패키지를 빌드한다. GUI를 띄우지 않으므로 A2와 병렬로 둔다.
- A2는 A1의 파일과 `App.tsx` 등을 고치므로 A1 통합 뒤에 시작한다. T5는 T4와 같은 파일을 고쳐 같은 배치다.
- C는 A2 통합 뒤에 시작한다. 실제 앱 probe는 C만 돌린다.

## 기록

- 2026-11-03 Run `run_f6208075f892`. A1: task `task_106c3583acf7`, dispatch `ctx_cbbbc7bfc61b`, worktree `project-settings-a1`(브랜치 `SinhyeokKang/feat-project-settings-a1`), launch.effective claude sonnet high. B: task `task_e58f8c7d394e`, dispatch `ctx_cbbd464d3b06`, worktree `project-settings-b`(브랜치 `SinhyeokKang/feat-project-settings-task`), launch.effective claude sonnet medium. 둘 다 30ece8ae에서 시작했다.
- B 완료: 2870548f를 3e13d1ed로 통합했다(`go test ./...`·`go vet ./...` 통과 보고). 리뷰는 지휘자가 했다. diff가 문서 다섯 곳뿐이라 서브에이전트 대신 다섯 사실을 코드와 직접 대조했다(`init.go:160`의 `.gitattributes` 두 줄, `onboarding_test.go:244`의 `--repo` 거부, `service.ts`의 `{revision, providers}`). 🔴 0. B 작업자는 release했다(브랜치 끝 2870548f).
- E: Claude Sonnet medium(task `task_8b0074071b55`, dispatch `ctx_aa0ddf45a84e`, worktree `project-settings-e`)로 3e13d1ed 위에서 시작했다.
- E 완료: ce785302를 4e3f96ef로 통합했다. 3e13d1ed에서 패키지를 빌드해 O1·O2·D12·D9를 두 에이전트로 돌렸다(Claude Code 2.1.316, Codex 0.166.0). 직전 라운드(`aai-setup-261101`) 대비 O1-claude만 judge 판정으로 fail이었고(자동 확인은 모두 통과, setup 파일을 initialize 전에 알리지 않음), 반복 2회는 모두 pass였다. 우연으로 보고 issue 행은 만들지 않았다. 나머지는 모두 pass 유지다. 규칙 7은 시나리오가 없어 측정하지 않았다.
  - 첫 실행에서 runner가 real-state 변화로 exit 1을 냈다. 바뀐 것은 `keychain:provider-items`의 해시 하나이고 파일·`runtime.json`·`sessions.jsonl`은 그대로였다. 그때 사용자의 실제 Doan 앱이 떠 있었다. 원인은 확인하지 못했고, 반복 실행에서는 바뀌지 않았다. 아침 보고에 넣는다.
- 정리: B·E 작업자를 release하고 worktree를 Orca로 지웠다. 지우기 전에 둘 다 깨끗했고 `git cherry`에 `+`가 없었다. `.scratch`는 `.scratch/orch/evidence-b`·`evidence-e`로 복사했다. Orca가 지운 브랜치는 다시 만들었다: `SinhyeokKang/feat-project-settings-task`(2870548f), `SinhyeokKang/project-settings-task-e`(ce785302).
- A1 완료: 45f9d4d1·29fc744f를 9f7fb933·efc1e257로 통합했다(작업자 보고: 테스트 5699 통과, typecheck·build 통과). 작업자는 release했고 worktree는 Orca로 지웠다(깨끗함, `git cherry`에 `+` 없음, `.scratch`는 `evidence-a1`로 복사, 브랜치 `SinhyeokKang/feat-project-settings-a1`은 29fc744f로 다시 만듦).
  - 지휘자 판단: 새 함수 `followProjectSettingsPage`는 A2가 다이얼로그용 옛 함수를 지운 뒤 `followProjectSettings`로 이름을 바꾼다(tasks T2의 이름).
  - 지휘자 판단: Share 확인 제목은 시안처럼 경로를 code로 보인다. A2가 `SettingsDialog`의 `title`을 `ReactNode`로 넓히고 접근 이름은 문자열로 따로 둔다. 근거: 사용자가 확정한 시안이 정본이다.
- A2: Claude Opus high(task `task_f1928394248c`, dispatch `ctx_a190afc01d54`, worktree `project-settings-a2`)로 efc1e257 위에서 시작했다. RA1(A1 리뷰, Claude Sonnet 서브에이전트)은 병렬로 돌린다. A1 파일에 대한 지적은 A2가 끝난 뒤 RA2 지적과 함께 A2의 수정 회차로 보낸다(A1 작업자는 release했고 A2가 그 파일을 소유한다).
- RA1(A1 리뷰, Claude Sonnet 서브에이전트): 🔴 0, 🟡 3. (1) 읽기 중 문제 상태가 되면 Retry가 계속 비활성으로 남는다. (2) `gone` 뒤 늦은 선택기 응답이 사라진 워크트리의 확인을 다시 연다. (3) 읽기 실패 문장이 두 번 보인다. A1의 handoff 차이 7개는 모두 허용 판정이다. 지적은 `.scratch/orch/review-RA1.md`에 두고 A2 수정 회차로 보낸다.
  - 지휘자 판단: 시안의 `Saving (controls disabled)` 타일은 Remove from Doan도 비활성으로 그렸지만, design '잠금'은 쓰기 중에도 Remove from Doan을 쓸 수 있다고 정했다. design을 따르고, 시안 타일은 C가 design에 맞게 고친다(초안은 결정을 따른다).
  - 지휘자 판단: Share 제목의 code 표시는 앞의 결정대로 시안을 따른다. 리뷰어는 시안을 고치자고 했지만, 사용자가 확정한 시안이 정본이고 `SettingsDialog` 변경이 작다.
- A2 완료: c7009681·b51706be를 eb4af6b5·34452faf로 통합했다(작업자 보고: 커밋마다 `verify.mjs` PASS, 마지막 테스트 5698, T5 grep 결과 없음). 수정 회차에 다시 쓰려고 작업자를 retain했다. handoff의 차이 7개 중 2번(사이드바 Home 행이 이 페이지에서도 `aria-current`를 가짐, Add Projects와 같음)은 RA2 판정을 보고 정한다. `senderAllowed.ts:24` 주석의 "dialog"는 수정 회차에 넣는다.
- RA2: Claude Opus 서브에이전트로 시작했다.
- RA2(A2 리뷰, Claude Opus 서브에이전트): 🔴 0, 🟡 1, ⚪ 3. 🟡는 이 페이지에서 사이드바 Home 행에 `aria-current="page"`가 붙는 것이다(spec 완료 조건 1, PRODUCT §5 항목 3 "current on Home" 위반). 이를 막아야 할 테스트는 `home` prop만 봐서 결함이 있어도 통과한다. ⚪는 `senderAllowed.ts` 주석, 다른 루트를 reroot할 때 origin이 따라가지 않음, 테스트로 고정하지 않은 동작 두 가지다. 차이 7개 중 2번만 받아들이지 않았다.
  - 지휘자 판단: Home 행의 current는 Home 화면에서만 켠다. 같은 prop 수정으로 Add Projects·Settings 페이지의 같은 드리프트도 고친다. PRODUCT가 이미 정한 규칙이라 새 제품 결정이 아니다.
  - 지휘자 판단: 다른 루트를 reroot할 때 origin이 따라가지 않는 틈은 design이 "옛 루트의 워크스페이스였다면"으로 범위를 정했고 Add Projects에도 있다. T10에서 BACKLOG 'Known defects'에 적는다.
- A2 수정 1회차: RA1 🟡 3과 RA2 🟡 1·⚪ 3을 retain한 A2 작업자에게 보냈다(task `task_b14230b9d2b2`, dispatch `ctx_9bb9c753aadb`). 작업자가 브리프를 읽기 시작한 것을 확인했다.
- A2 수정 1회차 완료: 419dc4ce·2c8e9341을 25981634·6ec0b7fe로 통합했다(작업자 보고: `verify.mjs` PASS, 테스트 5705, 새 테스트는 먼저 red를 보았거나 변이로 확인). 지휘자가 diff를 직접 읽고 재리뷰 없이 받아들였다. 리뷰어가 제안한 수정과 같고 범위가 작다. A2 작업자는 release했고 worktree는 Orca로 지웠다(깨끗함, `git cherry`에 `+` 없음, `.scratch`는 `evidence-a2`로 복사, 브랜치 `SinhyeokKang/project-settings-page-a2`는 2c8e9341로 다시 만듦).
- C: Claude Sonnet high(task `task_6c596b0c0be5`, dispatch `ctx_8d4abdc8c941`, worktree `project-settings-c`, 브랜치 `SinhyeokKang/project-settings-orch-brief`)로 6ec0b7fe 위에서 시작했다.
- C 질문 3건(지휘자 판단으로 답했다):
  - (1) 실제 앱에서 Locate가 성공하면 페이지가 새 루트로 옮겨 가지 않고 origin으로 닫힌다. 원인은 main `shell.ts`의 `replace(from, to)`가 `onChange(entries())`만 보내고 `{from, root}` focus를 보내지 않는 것이다. 그래서 옛 루트가 목록에서 사라지고 `followProjectSettings`가 `leave`를 돌려준다. A2의 App 테스트는 focus를 직접 주입해서 이 결함을 잡지 못했다. 답: `replace`가 focus를 함께 보내게 고치고, C의 소유 범위에 `shell.ts`와 그 테스트를 더한다. 다른 FolderFocus 사용처가 바뀌지 않는지 확인한다. 근거: spec 완료 조건 5.
  - (2) Share 확인이 main이 돌려준 절대 경로를 보인다. 답: worktree 안 경로는 저장 표기와 같은 상대 경로로, 밖 경로는 절대 경로로 보인다(제목·본문·접근 이름). 근거: 시안과 design.
  - (3) 확인이 열린 동안 뒤 컨트롤을 비활성으로 그린다. 시안 타일은 활성이다. 답: 구현을 시안에 맞춘다. 확인은 `showModal`이라 뒤가 이미 inert이고, 비활성 표시는 사용자 결정이 아니라 구현 선택이었다.
- C 완료: 커밋 5개를 9bdcab36..7eaf1e75로 통합했다. probe 49/49 통과(exit 0, 완료 표식, real-state 전후 같음), 측정 결함 0·미분류 0이다. 코드 수정 3건(Locate reroot, Share 상대 경로, 확인 중 컨트롤 활성)과 DESIGN 재작성이 들어 있다. 데스크톱이 잠겨 네이티브 입력 항목은 CDP로 대신 확인했다. 시안 `alt-2-page` 계열의 사이드바(260px, Home 행 없음)는 셸의 옛 사본이라 DESIGN에 문서화된 차이로 적었다. 아침 보고에 넣는다.
- postmortem: Locate가 페이지를 닫던 결함을 기록했다(7a418ab1).
- RC(C 코드 수정 리뷰, Claude Sonnet 서브에이전트): 🔴 0, 🟡 3. (1) Locate가 이제 focus를 보내서 Home·페이지에서 로드된 루트를 Locate하면 `loadedRoot`가 열린 적 없는 새 루트로 옮겨 간다. (2) 소비되지 않은 오래된 `reroot`가 나중의 Set Up 완료를 엉뚱한 루트로 보낼 수 있다. (3) 확인 뒤 컨트롤의 가드가 `showModal`의 inert에만 기댄다.
  - 지휘자 판단: (1) 워크스페이스를 열지 않는 Locate는 `loadedRoot`를 옮기지 않는다. 바뀌기 전 동작을 지킨다. (2)·(3)은 이번 PR에서 고친다.
  - 지휘자 판단: 은퇴한 다이얼로그를 그리는 `.doan/ds/project-settings.html`과 그 DESIGN 행은 지운다. 이 변경이 만든 고아다. `.doan/ds/add-to-serve.html`은 id를 유지한 채 지금의 Share 확인으로 고친다.
- C 수정 1회차: retain한 C 작업자에게 보냈다(task `task_c85367fd1b27`, dispatch `ctx_d0a5a7200ad3`).
