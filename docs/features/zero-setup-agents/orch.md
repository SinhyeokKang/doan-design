# zero-setup-agents — orch

- 원본: [spec.md](./spec.md), [design.md](./design.md), [tasks.md](./tasks.md)
- 시작 hash: `ff9aafa5` (main)
- 통합 브랜치: `feat-zero-setup-agents`
- 지휘: Claude Code(Opus 5.5). 모델 경계: 사용자가 이번 세션에 Codex 워커를 허락했다("Codex 허가"). 구현은 Claude가 주로 맡고, Codex는 교차 리뷰와 문구 배치에 섞는다.

## 결정 기록

| # | 질문 | 결정 | 근거 |
|---|---|---|---|
| 1 | T6b(실제 외부 에이전트 다섯 개 재측정)를 이번 run에서 실행하나 | 허락. T0과 같은 보호(임시 HOME, Keychain 정리, 실제 HOME 지문 전후 비교) | 사용자 답 |
| 2 | T3 검증의 `codex execpolicy check`(읽기 전용, 모델 호출 없음)를 워커가 실행하나 | 허락 | 사용자 답 |
| 3 | T0, T0b | 이미 main에 있음(`808b55c3`…`ff9aafa5`). 이번 run에서 하지 않는다 | 지휘자 판단 — tasks.md 표와 사용자 draft 확정 커밋 |
| 4 | T2의 `index.ts` 연결(시작 시 실행, 로그인 셸 PATH 주입, 실제 osascript 실행기) | 배치 D로 옮긴다. A는 주입 가능한 실행기까지만 만든다 | 지휘자 판단 — C가 `index.ts`의 broker 호출을 지우므로 A와 C가 같은 파일을 병렬로 고치지 않게 한다 |
| 5 | 새 모듈 위치 | `app/src/main/agentSetup/`. `aboutNotice`는 그 안의 `node:fs`를 import하지 않는 파일 | 지휘자 판단 — design.md '순수 함수로 뺄 부분'과 `rendererImports.test.ts` 경계 |
| 6 | T6의 관리자 권한 대화상자 1회 확인 | E가 준비하고, 사용자가 지켜볼 수 있을 때 지휘자가 사용자 승인을 받아 실행한다 | tasks.md T6 — 실제 `/usr/local/bin`에 쓴다 |
| 8 | `machine.test.ts`의 stub 내용 단언(B 에스컬레이션) | B가 새 `onboarding/stub.test.ts`로 옮기고 새 문구로 고친다. C는 `machine.test.ts`에서 그 두 테스트를 지운다. fixture `SKILL-c994913.md`는 남긴다 | 지휘자 판단 — 두 배치가 같은 파일을 고치지 않게 하고, stub 불변식은 문구 소유자가 갖는다 |
| 9 | guide의 onboarding 절대경로 호출이 Codex rule `pattern=["doan"]`에 맞지 않음(B 리뷰 🟡1) | rule은 그대로 두고, guide가 `doan`이 PATH에 있으면 이름으로 부르게 고친다. 절대경로는 Doan을 한 번도 열지 않았을 때만 쓴다. "Codex는 자동"이라는 문장은 "Doan을 연 뒤 새로 시작한 Codex 세션"으로 조건을 단다 | 지휘자 판단 — rule 범위는 사용자 결정(design.md)이고, 완료 조건 5는 이름으로 부른 `doan onboarding …`을 말한다. 링크가 없으면 rule도 없으므로 절대경로 경우는 원래 sandbox 밖 승인이 필요하다 |
| 10 | 앱 대화 `PRESET_GUIDANCE`의 Applications/About 안내(B 리뷰 ⚪1) | 앱 대화는 이미 Doan 안이므로 About 안내를 빼고, Connections 없는 옛 끝맺음으로 돌린다 | 지휘자 판단 — About 알림은 외부 세션 설치 결과라 앱 대화 실패를 설명하지 않는다 |
| 11 | Codex rule이 `~/.local/bin/doan`·`/usr/local/bin/doan`에도 의존(A 질문 1) | 받아들인다. 관리자 대화상자 취소는 rule을 막지 않는다 | 지휘자 판단 — PATH의 `doan`이 남의 것이면 rule이 그것을 sandbox 밖에서 승인 없이 실행하게 된다(design.md '의존'과 같은 근거) |
| 12 | `about:read`가 관리자 대화상자 응답까지 기다림(A 질문 2) | 기다린다. D는 About이 그동안 기존 읽는 중 상태를 보이고 오류로 바뀌지 않게 한다 | 지휘자 판단 — 결과가 나오기 전에 "알림 없음"을 보이지 않는다는 design.md 'About 알림' 규칙 |
| 13 | 로그인 셸 프로브 실패 시 대화상자·알림 없음(A 질문 3) | 받아들이고 미검증 경계로 남긴다 | 지휘자 판단 — 근거 없이 관리자 권한을 묻지 않는다 |
| 14 | 관리자 명령 실패(취소 아님)는 기록하지 않고 다음 실행에서 다시 묻는다(A 질문 4) | 받아들인다 | 지휘자 판단 — 완료 조건 4는 취소만 다시 묻지 않는다고 말한다 |
| 15 | A 재리뷰 R1 잔여 경쟁(복원·aside 정리) | 같은 사용자로 도는 동시 프로세스는 위협 모델에 넣지 않는다. 그런 프로세스는 이미 대상에 같은 쓰기 권한을 갖는다. Doan이 확인하기 전에 있던 항목은 바꾸지 않고, 배타적 연산으로 알 수 있는 새 항목도 덮어쓰지 않는다. 옮겨 둔 디렉터리는 rename으로 되돌리지 않고 aside 이름에 둔 채 알린다 | 지휘자 판단 — 남은 창은 같은 사용자의 동시 쓰기가 있어야만 생기고, 그 프로세스는 막아도 얻는 보호가 없다 |
| 16 | A 재리뷰 R3: 관리자 권한으로 사용자가 바꿀 수 있는 앱 실행 파일을 실행 | `process.execPath`를 root로 실행하지 않는다. `/usr/local/bin/doan`은 만들기만 한다(값이 늘 같으므로 교체가 필요 없다). `/usr/local/bin`에 사용자가 쓸 수 있으면 대화상자 없이 쓰고, 아니면 `env -i`와 SIP 보호 시스템 바이너리(`/bin/mkdir`, `/bin/ln -s -h`)만 실행한다 | 지휘자 판단 — 권한 상승 경계다. design.md의 ego 방식(osascript로 `ln`)으로 돌아간다. root 소유 디렉터리에는 같은 사용자 프로세스가 끼어들 수 없다 |
| 17 | About 알림 스타일(사용자 질문: 시안이 primitive를 잘못 썼는가) | 시안대로 간다. 시안은 기존 `doan-notice` 기본형(`--surface-inset` 채움, 테두리·그림자 없음)을 쓴다 | 사용자 답: "존재하는 스타일이면 그냥 하면 돼" |
| 18 | 알림 표면 규칙(사용자 지시, 이번 지휘에서 전수조사해 맞춘다) | 바탕이 불투명한 흰 단색일 때만 `doan-notice` 기본형을 쓴다. 그 밖의 바탕(투명·반투명, 그라데이션, 캔버스처럼 내용이 바뀌는 바탕)은 모두 `doan-notice doan-panel`. About 알림은 시안대로 기본형. 배치 H가 앱의 모든 `doan-notice`를 조사해 맞추고, 규칙 문장은 G가 DESIGN.md에 쓴다 | 사용자 지시: "하얀 불투명 백그라운드엔 기본형. 그외엔 doan-panel" |
| 19 | 알림 아이콘(사용자 지시) | 모든 알림에 `CircleAlert` 아이콘을 단다. 조건 불충족 About 알림도 중립 톤에 아이콘을 단다. 시안·design.md를 지휘자가 고쳤고, 앱 전체 적용은 배치 H가 맡는다 | 사용자 지시: "notice는 아이콘 무조건. 아이콘의 존재가 안내라는 맥락을 전달하는 데 도움이 많이 됨" |
| 20 | 대화 strip의 아이콘(H 질문) | strip 앞의 상태 표시(에이전트 로고, spinner, CircleAlert, CircleCheck)가 아이콘 자리를 차지하므로 결정 19를 만족한다. 코드 변경 없음 | 지휘자 판단 — 결정 19의 목적(알림이라는 맥락을 앞의 표시가 전한다)을 이미 충족한다 |
| 21 | 기본형 알림의 제목 색(H 보고) | `.doan-notice .ob-notice-title`은 `--text-standard`. H가 `styles.css`의 해당 줄만 고친다 | 지휘자 판단 — 확정 시안의 About 알림이 제목을 standard ink로 그린다 |
| 22 | 설치 실행기 자체가 예외로 끝날 때(D 질문) | 결과 항목 `crashed` 하나로 바꿔 About에 경고 줄을 보인다. 문구는 design.md 'About 알림' | 지휘자 판단 — 실패가 성공처럼 보이면 안 된다(design.md 'About 알림'). 시안 frame은 더하지 않는다(버그 경로, 비교 대상 아님) |
| 23 | 대화 strip(H 수정 2: 실제 위치는 흰 strip-slot 띠 위) | 예외 없이 규칙을 적용해 기본형으로 바꾼다. 상태 표시·배치·동작은 그대로 | 지휘자 판단 — 사용자가 규칙을 명확히 정하고 한 번에 맞추자고 했다(결정 18) |
| 24 | 알림 크기·색과 버튼(사용자 지시) | 기본형 알림 글자는 `--text-standard`. 모든 알림 변형의 패딩·gap·모서리·글자·아이콘 크기를 `doan-panel`과 같게 한다. 기본형 알림 안 버튼용 흰 바탕 button variant를 새로 만든다. 배치 H round 3 | 사용자 지시: "doan-panel처럼 진하게", "패딩과 갭도 doan-panel과 완전 동일", "버튼은 흰색 바리에이션을 추가" |
| 25 | 알림 스타일 공유(사용자 지시) | 모든 알림이 크기·패딩·gap·타이포(본문·제목)·모서리·아이콘을 공유한다. 다른 것은 타입을 나타내는 톤 색(아이콘 잉크, 같은 톤이면 두 바탕에서 같음)과 바탕 규칙의 채움·그림자뿐이다. `doan-panel`의 오류 아이콘 `inherit` 예외도 없앤다. 배치 H round 3 | 사용자 지시: "notice의 모든 스타일 패턴은 공유되어야함. 타입별 맥락을 나타내는 색상 제외하고" |
| 26 | 알림 톤 색(사용자 지시) | 톤이 알림 글자 전체(제목·본문)에 색을 주고 아이콘은 `currentColor`로 따른다. 중립 `--text-standard`, 경고 `--text-warning`, 오류 `--text-danger`. 두 바탕에서 같다. 4.5:1 미만인 조합은 H가 보고한다 | 사용자 지시: "아이콘은 텍스트 색을 따른다", "텍스트에 색을 주고 아이콘이 따르게 해" |
| 7 | T9 | 이번 run 밖. PR이 main에 merge된 뒤 main에서 하는 문서 변경 | tasks.md T9 |

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| A | T1, T2(실행기·패키징·real-state, `index.ts` 연결 제외), T3 | `app/src/main/agentSetup/**`(새), `app/package.json` `build.extraResources`, `app/runtime/real-state.ts`(+테스트) | 없음 | Claude Opus high — 실제 HOME에 쓰고 foreign 보호·재판정·EEXIST가 틀리면 사용자 파일을 덮어쓴다 | `npm --prefix app test`, 보호 분기 제거 시 red, `node --test 'app/runtime/*.test.ts'`, typecheck, package 후 번들 SKILL.md·bin 확인, `codex execpolicy check` | 대기 |
| B | T4 | `app/src/main/onboarding/SKILL.md`, `cli/internal/cli/{active,onboarding}.go`·`skill.md`와 문구 단언 테스트, `app/src/main/conversation/prompt.ts`(+테스트), `eval/scenarios/D4/rubric.md`, `D4b/rubric.md` | 없음 | Codex gpt-6-astra medium — 에이전트가 읽는 문구 판단이 중심이고 범위가 작다. 교차 모델 구현 한 자리 | `go test ./...`, `go vet ./...`, `npm --prefix app test`, `rg` 판정 | 대기 |
| C | T5 | design.md '지우는 것' 전체, `app/src/main/index.ts`(broker 호출 제거), preload, `senderAllowed`, renderer Settings·Connections 파일, `restore/uiState.ts`, `SettingsPage.tsx` lead | 없음 | Claude Opus medium — 삭제 범위는 넓지만 판단은 적다. Agents 잠금·`SettingsTargetQueue` 유지 회귀만 조심 | typecheck, `npm --prefix app test`, `go vet ./...`, `rg -n 'setup:(read\|run\|answer\|check-again\|status)' app/src` 없음, `verify.mjs` | 통합 |
| D | A의 `index.ts` 연결 + T5b(`/design-sync` 포함) | `app/src/main/index.ts`, `aboutView.ts`, `about.ts`, preload 타입(필요 시), `SettingsAbout.tsx`(+테스트), `docs/DESIGN.md`(측정값), `.scratch/design-sync/zero-setup-agents/` | A, C 통합 | Claude Opus high — 설치 promise를 기다리는 IPC와 실제 앱 computed style 측정 | `npm --prefix app test`, typecheck, `node .scratch/design-sync/zero-setup-agents/measure.mjs` | 대기 |
| E | T6, T6b | `docs/features/zero-setup-agents/tasks.md` T6b 표, `.scratch/runtime-test/zero-setup-agents/`, `.scratch/zero-setup-agents/t6b/` | D 통합 | Claude Opus high — 실제 상태 보호와 실제 외부 에이전트 측정 | real-state 전후 비교, lsregister 전후, 스크린샷·파일 목록, T6b 표 | 대기 |
| F | T7 | `docs/USABILITY-EVAL.md`, `.scratch/agent-eval/zero-setup-agents/` | B, C, D 통합 | Claude Opus medium — 실행은 정해진 절차, issue 판정에 판단이 필요 | `node eval/run.ts --self-test` PASS, 라운드 결과 기록, 새 issue 행 없음 | 대기 |
| G | T8 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md`('Settings'), `docs/DIRECTORY.md`, `AGENTS.md` 'Commands' | D, E, F 통합 | Claude Opus medium — 결정 문서를 현재 규칙으로 고쳐 쓰는 판단 | tasks.md T8의 `rg` 결과 없음 | 대기 |
| H | 알림 표면 규칙 전수조사와 수정(결정 18) | 위반 알림이 있는 renderer `.tsx`와 그 테스트, `.scratch/notice-survey.md`. `SettingsAbout.tsx`, `styles.css`, `ds/surfaces.css`, `app/src/main/**`, `docs/**`는 제외 | 없음(D와 병렬, 파일 겹침 없음) | Claude Opus medium — 실제 앱에서 바탕을 확인하는 판단, 고치는 것은 클래스뿐 | `npm --prefix app test`, typecheck, `verify.mjs`, 바뀐 곳마다 전후 스크린샷과 computed style | 진행 |

리뷰(보고만, 별도 워커): A → Codex gpt-6-astra medium, B → Claude Opus medium, C → Codex gpt-6-astra medium, D → Codex gpt-6-astra medium, G → Codex gpt-6.1-sol medium(문서와 코드 대조, 판단보다 단계가 많다). E·F는 지휘자가 증거를 직접 대조한다.

## 겹침과 순서

- 1차 병렬: A, B, C. 서로 고치는 파일이 없다. `index.ts`는 C만, `SKILL.md` 내용은 B만 고친다(C는 `machine.ts`의 stub 복사 코드만 지운다). `rcFileFor`·`pathIncludes`·`PATH_LINE`은 A가 새 모듈에 새로 쓰고 C가 옛 자리를 지운다.
- 2차: D(A·C 통합 뒤). 3차 병렬: E, F(D 통합 뒤, 서로 다른 파일. E만 GUI를 띄운다). 4차: G.
- tasks.md 체크 항목과 배치: T0·T0b 완료, T1·T2·T3 → A(+D), T4 → B, T5 → C, T5b → D, T6·T6b → E, T7 → F, T8 → G, T9 → run 밖.

## 통합 기록

| 배치 | 라운드 | 통합 hash | 비고 |
|---|---|---|---|
| C | 0(리뷰 Codex astra: 🔴0 🟡0) | `72db17d9` | 워커 `75899419`. 워커 터미널 해제함 |
| B | 1(리뷰 Claude Opus: 🔴0 🟡4 ⚪2 → 수정 1회, 지휘자가 diff 확인) | `79d0632c`, `bbeed031`, `45046b1d` | 워커 `f792190c`, `5f6a7854`, `1145974e`. B+C HEAD `45046b1d`에서 `verify.mjs` PASS |
| A | 2(리뷰 Codex astra: 🔴2 🟡1 → 🔴2 → 🔴0 🟡0, 결정 15·16) | 아래 커밋 | 워커 `eb1575b7`, `9d14ac04`, `4302ad61`, `160b6b02`, `f1d20b97`, `7406049f` |
A+B+C 통합 HEAD `9298117e`에서 `verify.mjs` PASS(7단계). A·B·C worktree는 Orca로 지웠고, handoff와 리뷰는 conductor `.scratch/orch/zero-setup-agents/evidence/`에 옮겼다.
| D | 0(자체 리뷰 2회 + 리뷰 Codex astra: 🔴0 🟡0 ⚪2) | `09b35d58`, `7102fe1b`, `745d1f55` | 워커 `cdf48069`, `c830a5e5`, `2e4c4b9d`. 통합 HEAD `745d1f55`에서 `verify.mjs` PASS |
| H | 2(수정 3회, 리뷰는 round 3 뒤) | `0e5423f6`, `47e8b9d6`, `108ad0c6`, `ddfd6ef0` | 워커 `5c1aadee`, `c10c3588`, `c980ee4c`, `d2527dca` |
