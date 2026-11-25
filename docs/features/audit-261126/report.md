# 코드베이스 감사 — 2026-11-26 (audit-loop 라운드 1)

- 실행 일자: 2026-11-26 (KST)
- 대상: `develop` HEAD `fa680f9136d90194370bdfa6854b96e5a209dcb1`, 작업 트리 clean
- 범위: 코드베이스 전체 (CLI·schema·eval, app main·runtime·빌드/CI, renderer·preload·공유 모듈)
- 완료 상태: **정적 감사 완료.** 런타임 동작은 확인하지 않았다(아래 '실행 한계').
- 원자료: `.scratch/audit/261126-r1/` (리뷰어 보고서 23개, git 제외)

## 미검토 영역과 실행 한계

- **실행 검증 없음.** 리뷰어는 테스트·빌드·실앱 probe를 돌리지 않았다. "의심"으로 표시한 발견은 실행해야 확정된다.
- **적용 대상이 아니어서 읽지 않은 것**
  - eval 시나리오 seed 파일(`eval/scenarios/*/seed/**`): 에이전트 입력 데이터이고 실행 코드가 아니다.
  - `schema/fixtures/**` 692개: 디렉터리 구조와 v3·config·runtime·cli-envelope·serve-withheld 목록만 대조했다. 테스트 입력 데이터다.
  - 바이너리 자산(`public/` 이미지·폰트, `Geist.woff2`).
  - 디자인 프리셋 본문 12개: CLI 명령·규칙·id·출처 줄만 읽었다. 에이전트 안내 문서이고 코드 계약이 아니다.
- **grep만 한 것**: `tokens.css`, `fonts.css` (값 정의 파일).
- 1차 웨이브(관점 4 × 모듈 그룹 3)는 모두 부분 커버리지로 끝났다. 2차 웨이브(파일 클러스터 10개 × 4관점)와 3차 웨이브(남은 렌더러 파일·CSS)가 나머지를 채웠다. 2026-10·11월 postmortem 예방 규칙은 셀마다 현재 호출 지점에 대응시켰다.

## 요약

| 등급 | 개수 |
|---|---|
| High | 0 |
| Medium | 20 |
| Low | 약 60 |
| 미결정 제품 질문 | 약 20 |

postmortem이 재발한 항목: 2026-11-01(ui-state 병합), 2026-10-25·11-17(제거 정리), 2026-11-20(읽지 않은 종료 표시, 첫 layout 게이트), 2026-11-17(활성화 포커스), 2026-11-13(로딩 중 hover 명령, eval done 해시), 2026-11-11(클립 반경), 2026-11-19(project_not_open 문구), 2026-11-18/19(`--add-serve`), 2026-10-25(eval PATH), 2026-10-23(fake 프로세스 정리), 2026-10-24(fake 마크업 판정), 2026-10-22(중첩 served 디렉터리), 2026-11-22(ACP 오류 분류), 2026-11-16/20(rpc 응답 대기), 2026-10-21(HOME 정규화 비교), 2026-11-25(강제 색상).

---

## Medium

### M1. 시작 시 복원이 취소되면 저장된 사이드바 상태가 지워진다 — C-G3-1 / L-G3-1 (contracts, lifecycle)
- 트리거: 저장된 프로젝트를 읽는 동안(최대 10초) 사람이 이동한다.
- 영향: `shellProjects`, `expanded`, `lastByRoot`가 적용되지 않은 채 첫 save가 `ui-state.json` 전체를 덮어써 영구히 사라진다.
- 근거: `App.tsx:341` `cancelRestore`, `:756-772` 복원 효과에서만 세 값을 적용, `:794-818` save가 메모리 값을 그대로 저장. 읽기 콜백(`:733-761`)은 다른 필드는 병합한다.
- 기대: ARCHITECTURE §7 "saves the merged state". POSTMORTEM 2026-11-01이 "gap stays open"으로 남긴 재발.
- 수정: 읽기 콜백에서 세 값도 사람의 변경과 병합하고, 회귀 테스트를 둔다.

### M2. 터미널 세션을 이어 갈 때 첨부 칩이 알림 없이 빠진다 — C-G3-2 (contracts) · 사용자 영향
- 트리거: 터미널 세션 resume 모드에서 첨부가 있는 draft를 보낸다.
- 영향: 메시지는 가지만 첨부는 빠지고, 아무 표시가 없다.
- 근거: resume와 새 대화가 draft key를 공유하고, `dockedAvailability`가 resume에서 첨부를 막지 않으며, resume 시작이 첨부를 넘기지 않는다(`DockedComposer.tsx`, `settleSent`).
- 기대: PRODUCT §5 Terminal session. 첨부를 보낼지, 막고 알릴지가 정해져 있지 않다.
- 처리: 사용자 결정 필요 → BACKLOG.

### M3. 메인 창의 `markSeen` 실패가 다시 전송되지 않는다 — M-G3-1 (maintainability)
- 영향: 보고 있는 대화에 미확인 표시가 다시 붙고, 다음 턴 종료나 재시작까지 남는다.
- 근거: `seenFailed`는 `prototype/conversationRun.ts:231`에만 연결됐다. 메인 창은 `App.tsx:483/500` → `homeRun.ts:654-666`에서 `undoSeen`만 하고 `canvasRun`·`overviewRun`의 `seenEnd`가 남는다.
- 기대: POSTMORTEM 2026-11-20 재발.
- 수정: 메인 창 run에도 실패를 알려 같은 종료 지점을 다시 보낸다.

### M4. runner가 spawn 전에 거절하면 세션 예약이 풀리지 않는다 — L-G2-1 (lifecycle)
- 영향: 이후 그 대화의 send는 10초를 기다린 뒤 매번 `busy`로 거절되고, 앱 재시작 전까지 풀리지 않는다.
- 근거: `service.ts` send의 catch가 `reserved && !opening && !live.runner`일 때만 예약을 푼다. `openRunner`(`service.ts:570-583`)가 spawn 전에 throw하면 `opening`이 true라 해제되지 않는다. Claude spawn 오류는 `exited()`가 해제한다.
- 기대: POSTMORTEM 2026-10-27 'protocol readiness lagged'의 no-spawn 경로.
- 수정: spawn되지 않은 open 실패에서도 `not_spawned`로 해제한다.

### M5. Locate가 제거 정리(`rootsLeft`)를 거치지 않는다 — M-G2-1 (maintainability)
- 영향: drafts의 held start, prototype 창, 백그라운드 작업, 썸네일이 옛 root 기준으로 남는다.
- 근거: `index.ts:1474-1488` `folders:locate`는 selection만 지운다. Remove와 자동 제거는 `rootsLeft`(`:879`, `:1453`, `:923`)를 거친다.
- 기대: POSTMORTEM 2026-10-25·2026-11-17 재발.
- 수정: Locate에서 옛 root에 `rootsLeft`를 적용한다.

### M6. Claude 프로필 `projects/`에 디렉터리가 아닌 항목이 있으면 세션 전체가 없는 것으로 읽힌다 — W2-conv-core-1 (의심, 경로 확인)
- 트리거: `projects/`에 `.DS_Store` 같은 일반 파일이 세션 디렉터리보다 먼저 나열된다.
- 영향: 터미널 Claude 세션 재개가 `session_unavailable`로 거부된다. 같은 프로필 Doan 연결 대화의 send가 실패하고, steer 조회·`/clear` 추적도 틀어진다.
- 근거: `prepare.ts:78` `claudeSessionExists`, `io.ts:198` `claudeTranscript`가 비디렉터리 항목에서 `canonicalDirectory(dir) !== dir`로 전체를 실패 처리한다.
- 기대: POSTMORTEM 2026-11-18 'existing Claude session read as missing'과 같은 증상의 다른 원인.
- 수정: 링크는 거부하고 그 밖의 비디렉터리 항목은 건너뛴다.

### M7. Codex 권한 요청 id가 한 대화 안에서 반복된다 — W2-conv-transport-1
- 트리거: 앱 재시작 등으로 Codex app-server가 바뀐다. app-server는 프로세스마다 id를 0부터 매긴다.
- 영향: `summary.ts:72` `waitingSince`가 이전 턴의 요청 시각을 잡아 대기 정렬이 틀어진다. 렌더러 카드 key `p${requestId}`(`threadItems.ts:280`)가 중복되고, `scrollToItem`/`focusIn`(`ConversationThread.tsx:1041,1258`)이 이미 답한 카드로 간다.
- 근거: `transport.ts:689,717` `` `${typeof raw.id}:${raw.id}` ``.
- 수정: Codex requestId에 turn id를 붙이고, 기존 기록을 읽는 쪽은 turn id + requestId를 키로 쓴다.

### M8. Antigravity 볼트를 복호화하지 못하면 로그아웃이 계속 실패한다 — W2-ASU-1
- 영향: `signOutFailed`가 저장되고 재시도도 같은 경로로 실패한다. `removeVault`가 실패하면 평문 `acp_token.json`이 프로필에 남는다. Cursor·Copilot은 같은 상황에서 로그아웃된다.
- 근거: `agentAuth/manager.ts:602` `acpLogout`의 `await this.hold(provider)`가 `try` 밖에 있다.
- 수정: hold 실패도 Doan 사본 제거로 이어지게 하고, scrub를 별도로 보장한다.

### M9. 펜스 안 에이전트가 쓰기 허용 경로에 폴더를 만들면 provider가 막힌다 — W2-ASU-2 (의심, Seatbelt 실행 필요)
- 트리거: `.copilot/settings.json`이나 볼트 작업 파일 자리에 디렉터리를 만든다.
- 영향: 로그인·체크·실행·로그아웃이 `writeSetting` → rename EISDIR로 실패하고, `signOutFailed`가 재시작 후에도 남아 앱 안에서 복구할 수 없다.
- 수정: 실행으로 확인한 뒤, 쓰기 대상이 일반 파일이 아니면 치우고 다시 쓴다.

### M10. 숨겨진 auto worktree가 제거처럼 처리되어 보내지 않은 draft가 지워진다 — W2-shell-1
- 트리거: auto-registered worktree의 브랜치가 `.doan/` 없는 브랜치로 바뀌어 목록에서 숨겨진다.
- 영향: 그 root의 Overview·canvas draft(`overviewRun.ts:175-183`), ui-state의 대화 기억·히스토리·펼침 상태가 지워진다.
- 근거: `App.tsx:593` `onFolders`가 표시 목록 기준으로 removed를 계산한다.
- 기대: ARCHITECTURE:393 "per-root memory reads the unfiltered list".
- 수정: 필터하지 않은 목록 기준으로 removed를 계산한다. 숨겨진 root의 canvas 기억을 유지할지는 미결정.

### M11. 사람이 접은 프로젝트가 같은 프로젝트 안 이동에서 다시 펼쳐진다 — W2-shell-2
- 트리거: 로드된 프로젝트를 셰브런으로 접은 뒤 Quick Open, Back, Overview 카드로 이동한다.
- 근거: `App.tsx:832` `completeNavigation`과 제거 정리 두 벌(`App.tsx:598`, `afterRemoved.ts:14`)이 `collapsed`를 빼고 객체를 다시 만든다.
- 기대: PRODUCT:201.
- 수정: `collapsed`를 보존하고, 제거 정리 중복을 하나로 합친다.

### M12. 화면 진입 포커스가 활성화 hand-off를 거치지 않는다 — W2-shell-3 (의심) · W2-renderer-canvas-3
- 트리거: 창이 뒤에 있을 때 `doan open`이 들어와 renderer가 먼저 응답하고 main이 창을 앞으로 가져온다.
- 영향: 활성화 때 포커스가 Hide sidebar 등 엉뚱한 곳으로 간다. prototype 창 실패 화면 heading, export·delete 포커스 복귀, Agent usage popover의 탭 이동도 같다.
- 근거: `App.tsx:696-714`가 `handFocus`를 거치지 않는다.
- 기대: POSTMORTEM 2026-11-17·11-20 재발.
- 수정: 해당 포커스 이동을 `handFocus` 경로로 보낸다.

### M13. New folder·clone 기본 위치가 auto worktree를 따른다 — W2-shell-4
- 트리거: Claude Code worktree(`<repo>/.claude/worktrees/...`)가 자동 등록된다.
- 영향: 기본 위치가 Doan 프로젝트 안쪽이 되어 폴더 생성이 거부된다.
- 근거: `projectStep.ts:101-104`, `folderStore.ts:183`.
- 기대: PRODUCT:134 "last registered project", PRODUCT:201 auto worktree는 "never adds a project".
- 수정: 기본 위치 계산에서 auto-registered root를 제외한다.

### M14. 내보낸 뷰어 플레이어가 run iframe을 네 모서리 클립으로 자른다 — W2-cli-export-canvas-1
- 영향: 8192 CSS px를 넘는 Fit mark에서 프레임 일부가 그려지지 않을 것으로 본다(probe 필요).
- 근거: `cli/internal/export/viewer/shell.css:634-636` `.pw-content`·`.pw-stage`가 모두 `overflow: clip; border-radius: inherit`. 앱(`styles.css:1838-1839`)은 위·아래 반경을 나눴다. 구조 테스트(`exportViewer.test.ts:1039-1090`)는 플레이어 체인을 보지 않는다.
- 기대: ARCHITECTURE §3 'Canvas view'. POSTMORTEM 2026-11-11 두 번째 재발.
- 수정: 앱과 같은 체인으로 바꾸고 구조 테스트에 플레이어 체인을 추가한다.

### M15. 내보낸 뷰어 `measure.js`에 "첫 layout은 링크 스타일시트 적용 뒤" 게이트가 없다 — W2-cli-export-canvas-2
- 트리거: 내보내기 후에도 링크로 남는 외부 CDN 스타일시트.
- 영향: 스타일 적용 전 높이가 먼저 전송되고 `nextHeight`가 그 값에 고정되어 아래 프레임이 잘린다.
- 근거: 앱 `canvasScript.ts:705-714`에는 게이트가 있고 `measure.js`에는 없다.
- 기대: ARCHITECTURE §3 Height, 'Exported canvas and viewer'. POSTMORTEM 2026-11-20 재발.
- 수정: 같은 게이트를 넣고 테스트로 고정한다.

### M16. eval 러너가 실행 셸의 Doan 대화 변수를 넘긴다 — C-G1-2 / M-G1-1 / B-G1-3 (세 관점 독립 확인)
- 트리거: Doan 앱 대화 안 셸에서 `node eval/run.ts`를 실행한다.
- 영향: `doan onboarding`·`remove`가 `conversation_refused`로 거부되고 `work start`/`done`이 전송되지 않아 에이전트와 무관한 실패가 기록된다. Codex 레인이 Doan 프로필의 `auth.json`에 링크한다.
- 근거: `eval/lib/agent.ts:12-16` `agentEnvironment`가 세션 id 3개와 `DOAN_HANDOFF`만 지운다.
- 기대: ARCHITECTURE §14 'Isolation', 'Handoff scenarios'.
- 수정: `DOAN_APP_CONVERSATION`, `DOAN_CONVERSATION_ID`, 프로필 홈 변수도 지우고 테스트를 추가한다.

### M17. 중단된 eval 라운드가 정리를 건너뛴다 — L-G1-1
- 영향: `/var/tmp`에 실제 Codex `auth.json`을 가리키는 링크와 `config.toml` 사본이 남는다. SIGTERM 종료 코드가 143이 아니라 130이다.
- 근거: `eval/run.ts:254-259` 시그널 핸들러가 `process.exit(130)`으로 끝나 `finally`(workspace dispose, judge home·`cliDir` 삭제, `assertRealState`)가 실행되지 않는다.
- 기대: POSTMORTEM 2026-11-20.
- 수정: 시그널에서 정리를 마친 뒤 종료한다.

### M18. Set Up 대화상자가 닫힌 뒤 늦은 회신이 `modalClosed()`를 다시 켠다 — L-G3-2 (의심)
- 영향: 이후 상관없는 폴더 변경 때 포커스가 입력 중인 곳에서 빠져나간다.
- 근거: `ProjectSetupDialog.tsx:33, 84-87`, `App.tsx:1102-1114, 2706`.
- 수정: 닫힌 뒤 도착한 회신은 무시한다.

### M19. Overview에서 명령으로 대화를 시작하면 보내지 않은 preset·첨부까지 "마지막 요청"으로 기억된다 — W2-renderer-conversation-2 (Low로 보고됐으나 첨부 파일 삭제 위험으로 Medium)
- 영향: Edit on Home에서 같은 첨부 id가 두 draft에 들어가고, Home에서 칩을 지우면 Overview draft가 쓰는 파일이 지워질 수 있다.
- 근거: `ProjectOverview.tsx:302` vs `HomeComposerView.tsx:500`.
- 수정: Home처럼 명령 텍스트만 기억한다.

### M20. MCP 등록 하나가 잘못되면 sign-out·교체의 pending logout 기록이 통째로 빠진다 — W2-mcp-onboarding-stores-1 (Low로 보고됐으나 이전 계정 토큰이 남으므로 Medium)
- 트리거: Doan 밖에서 손으로 만든, URL이 저장 형식이 아닌 `doan-*` 등록.
- 영향: 이전 계정의 MCP 토큰이 기록도 Connect 차단도 없이 남는다.
- 근거: `mcpConnectors/service.ts:321-325` `codexServerToml`이 try 밖에서 throw, `store.ts:72-80` `record`가 묶음 전체를 검증한다.
- 기대: ARCHITECTURE §7 'MCP connectors'.
- 수정: 항목별 검증·기록, 블록별 try.

---

## Low

표기: 근거 / 수정. 출처 id는 원자료 보고서의 id다.

### app main
- **L-G2-2** send 실패 후 Codex 서버를 닫을 때 `live.closed`를 세우지 않아 곧바로 보낸 send가 `process_exited`로 실패한다(의심). `service.ts:502`, `stopRuns` `:892`도 같다 / 닫을 때 `closed`를 세운다.
- **L-G2-3** 중첩 served 경로의 중간 디렉터리를 지웠다 다시 만들면 live reload가 멈춘다(의심, POSTMORTEM 2026-10-22 부분 재발). `watch.ts:258-272` / 중간 디렉터리 재생성 시 다시 건다.
- **L-G2-4** storage 쓰기 도중 config 세션이 끝나면 그룹 재읽기를 건너뛴다. `configBridge.ts:110/166`, ARCHITECTURE §7 'Storage writes' / 세션 종료와 무관하게 재읽기한다.
- **L-G2-7** 백그라운드 시작 후 창이 보이면 tool facts probe 전에 `factsRead`가 켜져 잠깐 틀린 문구가 보인다 / probe 완료 후 켠다.
- **L-G2-8** basis 기록 전에 실패한 썸네일이 재시작 전까지 "Preview unavailable"로 남는다. `get()` await 중 `removed()`가 돌면 지운 key로 큐에 들어가는 두 번째 트리거도 있다(W2-PCR). `thumbnails.ts:201-242` / 실패를 basis와 함께 기록하고 제거된 key를 큐에서 거른다.
- **M-G2-5** export 대상이 `.doan` 안인지 앱은 문자열로, CLI는 링크를 따라 판단한다. ARCHITECTURE "as the CLI judges it" / CLI 판정을 따른다.
- **M-G2-14** ".git/HEAD를 감시하지 않는다" 주석이 낡았다. `index.ts:696`, `shell.ts:42` / 주석 수정.
- **M-G2-10** deep link의 프로젝트 이름 규칙이 `groupProjects`를 재구현한다 / 공용 함수 사용.
- **M-G3-4** prototype 창은 프로젝트 이름을 worktree 폴더명으로, 메인 창은 main worktree 폴더명(PRODUCT §5 item 1)으로 짓는다 / prototype 창도 그룹 이름을 쓴다.
- **W2-conv-core-2** `store.ts:128-132`의 실패 코드·사유 목록이 `types.ts:21,45,65`와 따로 있다. 타입에만 값이 추가되면 턴 종료가 저장되지 않는다 / 타입에서 파생하거나 테스트로 고정한다.
- **W2-conv-transport-2** 도구 입력에 NUL이 있으면 `store.ts` `str()`이 거부해 그 턴의 `appendAll`이 실패한다(의심) / activity summary·path에서 NUL을 떨어뜨린다.
- **W2-conv-transport-3** ACP 실패 분류 정규식이 `acpRunner.ts` `transportCode`와 `transport.ts` `transportError`에 따로 있어 같은 문구가 단계마다 다른 코드가 된다(POSTMORTEM 2026-11-22 부분 재발) / 하나로 합친다.
- **M-G2-7** `drafts.ts`가 `prompt.ts`·`store.ts`의 검증기를 복사했고 이름 상한이 이미 다르다 / 공용 검증기 사용.
- **M-G2-8** Claude Fast 사유 매핑이 두 곳에 있다(`model_not_allowed`는 의도적으로 다름) / 차이를 남기고 공통부를 합친다.
- **M-G2-9** fence MCP refresh lock 정규식이 slug 길이 16을 하드코딩한다. `fence.ts:40` / `MAX_SLUG`에서 만든다.
- **W2-ASU-3** `usageRead.ts:165` `rpcRead`가 프로세스 종료 시점에 응답 대기를 끝내 파이프에 남은 응답을 놓칠 수 있다(의심, POSTMORTEM 2026-11-16/20) / 같은 모듈의 `gone` 기준을 쓴다.
- **W2-ASU-4** `needsSystemLink`가 로그인 PATH를 정규화된 HOME과 바이트로 비교해, HOME이 링크를 거치면 불필요한 관리자 대화상자와 틀린 PATH 안내가 나온다(POSTMORTEM 2026-10-21) / 양쪽을 같은 방식으로 정규화한다.
- **W2-PCR-1** `app/scripts/verifySignedPackage.mjs`가 codesign 종료 코드를 보지 않아, `Resources/bin/doan`이 없거나 codesign이 실패해도 entitlements 검사가 통과한다 / 종료 코드와 XML 존재를 확인한다.
- **W2-PCR-2** 사이드바에서 다른 프로젝트 행을 누를 때마다 `shell:activity`가 그룹의 대화 history 전체를 동기로 읽는다(의심, 측정 필요). `App.tsx:1036` / 꼬리만 읽는다.
- **M-G2-2** main preload 채널 리터럴이 main 상수와 테스트로 고정되지 않았다 / prototype preload처럼 고정한다.
- **M-G3-5** preload의 `checkOnboardingAgent`, `readUpdate`, `designSkills.get`은 renderer 호출처가 없다. `onboarding:check`가 이 때문에 허용 목록에 남아 있다 / 제거한다.
- **M-G2-11** 홈 폴더 거부 문구와 `cleanup_failed` 문구가 Set up·onboarding 두 경로에 따로 있다 / 하나로 합친다.
- **M-G2-12** `.gitattributes` 줄이 TS(`onboarding/projects.ts:42`)와 Go(`storage.go:93`)에 따로 있고 공유 fixture가 없다 / 공유 fixture로 고정한다.
- **M-G2-13** 테스트로 고정되지 않은 상수·규칙 사본: `SELECTOR_LIMIT`, 메뉴 화면 목록, `INSTALL_NAMES`, Claude plaintext 파일 목록, 계정 `label`, 기억된 대화 key 규칙, `ancestorLabel`, canvas id 정규식, `QUIT_WAIT_MS`(`manager.ts:61`, `usageService.ts:36`) / 공용 상수 또는 테스트.
- **M-G2-15** `extraResources` 패키지 경로를 쓰는 코드 네 곳이 package.json과 테스트로 묶여 있지 않다(의심) / 테스트 추가.
- **M-G2-3** 설치 버전 문법이 두 가지라 `+build` 버전이면 내장 명령 목록이 빈다(의심). `sessions.ts:14-15` / 한 문법으로 합친다.
- **C-G2-1** ARCHITECTURE:286 'Other sessions'가 지워진 `promoteTo`를 든다 / 문구 수정(현재 `service.ts:369,478,1561-1563`).

### renderer
- **C-G3-3** Fast를 picker의 모델로 판단하지만 main은 저장된 모델로 판단해 send가 매번 `bad_request`가 될 수 있다(의심) / 같은 모델로 판단한다.
- **C-G3-4** `HomeRun.history`가 실패한 읽기를 run 내내 캐시해 그 대화가 Home strip에 재시작 전까지 안 나온다 / 실패는 캐시하지 않는다.
- **C-G3-5** Project Settings가 CLI 오류 메시지를 정규식으로 맞춰 안내 문구를 고른다. ARCHITECTURE §12는 오류 코드로 고르라 한다 / 코드로 고른다.
- **C-G3-7 + W2-renderer-canvas-2** 캔버스 로딩 중 보낸 hover 명령을 새 문서가 받지 못하고 `hoverSeq` 재설정 전에 `hover-hand`가 재전송되어, grab 커서·⌥ 측정·hover가 키를 뗄 때까지 사라진다(POSTMORTEM 2026-11-13, 2026-10-23). `CanvasController.ts:1636` vs `:1666` / 로딩이 끝난 뒤 다시 보낸다.
- **C-G3-8** frame drawer가 id·title 하나만 잘려도 "Showing the first 1,000 frames"를 보이고 DESIGN 문구도 코드와 다르다 / 개수 초과일 때만 보인다.
- **C-G3-9** `data-doan-frame=""` 프레임이 main이 항상 거부하는 칩이 되어 보낼 수 없다(`validAnchor`) / 빈 id는 칩으로 만들지 않는다.
- **M-G3-3 + M-G2-6** `conversationStrip.ts`와 `stripState`가 main fold를 복사했고 근거 주석("`node:path`를 끌어온다")은 이제 거짓이며 `archived`·`mergeEvents` 처리가 다르다 / main fold를 import한다.
- **M-G3-6** `PROVIDER_ROWS`·`FAST_PROVIDERS`가 main 목록을 다시 적고, `CAPTURE_TERMINAL`·`DockedComposer.tsx:580`과 "Conversation finished — unread" 문구가 두 곳씩 있다(POSTMORTEM 2026-11-17 부분 재발) / 공용 상수.
- **M-G3-7** 브랜드 검사 명령 목록(`brand/candidates.ts`, Go `brand_test.go`)에 `export`, `handoff`, `remove`가 없다 / 추가한다.
- **L-G3-3** MCP Remove 확인창 예약이 취소되지 않아, 그 사이 unmount되면 주인 없는 Settings lock이 남는다. `SettingsMcpConnectors.tsx:173, 48-53` / unmount 때 취소한다.
- **B-G3-1** prototype host가 캔버스의 `result`·`frames` 메시지를 모양·크기 검사 없이 main으로 넘긴다(의심). `prototype/host.ts:78-86` → `preload/prototype.ts:63-64` / `goto`처럼 host에서 상한을 둔다.
- **W2-renderer-conversation-1** ACP passthrough 명령에서 renderer의 큐 분할 규칙이 main(`service.ts:1910` `asIs`)과 달라 큐 메시지가 진입 모션 없이 나타난다. `conversationStore.ts:154-158, 528` / main과 같은 규칙.
- **W2-shell-6** `projectRow()`는 테스트만 호출하는 죽은 코드이고 테스트가 지금 쓰지 않는 문구를 고정한다 / 제거.
- **W2-renderer-canvas-1** Hand 도구로 텍스트를 끄는 중 ⌘Tab하면 캔버스에 끝이 알려지지 않아 돌아와서 V/H/Space가 안 듣고 휠이 선택을 늘린다(의심) / blur에서 드래그를 끝낸다.
- **W2-renderer-canvas-4** `dockedBuddyShell.ts`의 WebGL 설정이 `Doany.tsx`의 손 복사본이고 golden에 묶여 있지 않다 / 공용화 또는 golden 대상 추가.
- **W2-renderer-canvas-5** prototype 로드 실패 문구가 "10 seconds"를 하드코딩한다 / `PROTOTYPE_LOAD_TIMEOUT_MS`에서 만든다.
- **W2-renderer-canvas-6** `ds/index.css` 주석이 없는 `settings.css`를 가리키고 `prototype.html`을 빠뜨렸다 / 주석 수정.
- **W3-leftovers-1** 강제 색상 모드에서 배경·그림자로만 그린 상태가 사라진다: 라디오 6종의 선택 표시, `.composer-card` 테두리·포커스, `.shell-modes`·`.ob-steps` 현재 표시, Fast 스위치 손잡이, 떠 있는 알림 테두리, unread 점, 큐 pill, caret. POSTMORTEM 2026-11-25 재발이고 그 검색식은 이것들을 못 잡는다 / `@media (forced-colors: active)`에서 테두리·시스템 색을 준다.
- **W3-leftovers-2** PRODUCT:318 "title, else id" 규칙이 다섯 가지로 구현돼 빈 title·공백 title에서 화면마다 이름이 다르다. `canvasTree.ts:19`, `canvasView.ts:141`, `prototype/view.ts:68`, `agentIndicator.ts:65,122`, `windowState.ts:102`, `player.js:358` / 공백을 잘라 빈 값이면 id로 가는 한 함수.

### CLI
- **C-G1-1** `doan remove`·`active`의 `project_not_open` 메시지가 루트를 적지 않고 "Doan does not list this folder's project"라고 단정한다(POSTMORTEM 2026-11-19). `remove_rules.go:30,78-79`, `active.go:30,90-91` / `notOpenMessage(root)`·`notOpenSteps` 사용.
- **B-G1-4** `doan config --add-serve`가 해석된 경로만 `Withheld`로 판정해 `.env-docs` 같은 제외 이름의 링크를 받아들인다(POSTMORTEM 2026-11-18/19). `config.go:154` / 입력 이름도 판정한다.
- **M-G1-3** Go 안 같은 규칙 두 벌: 세션 identity(`sessions.go:29-41` / `work_rules.go:113-127`), canvas id(`check.go:83-85` / `run.go:78`), 서빙 범위(`cli/check.go:79-89` / `export/resolve.go:81-92`), `trimURL` 세 벌 / 하나로 합친다.
- **M-G1-4** CLI 64 KiB 소켓 줄 한도(`handoff_rules.go:19-24`, `active.go:18`)와 앱 `LINE_LIMIT`(`runtime.ts:17`)이 주석으로만 묶였다 / 공유 fixture 또는 schema로 고정.
- **W2-cli-export-canvas-4** CSS `image-set()`의 문자열 URL을 스캐너가 놓쳐 내보낸 파일에서 이미지가 빠지고 `doan check`도 알리지 않는다 / 스캐너가 `image-set()` 문자열을 읽는다.

### eval
- **L-G1-2** `Workspace.dispose()`에서 `rmSync(base)`가 throw하면 Codex home이 남는다. `workspace.ts:135-140`.
- **L-G1-4** 증거 읽기가 throw하면 `runner_error`가 `timedOut: false`, `exitCode: null`로 남는다. `run.ts:225-230`.
- **L-G1-5** `canvas-watch.ts` `stop()`에 상한·kill·stdin `error` 리스너가 없다(POSTMORTEM 2026-10-23).
- **L-G1-6** `agent.test.ts:63-74`가 spawn 시점부터 1초 타임아웃으로 출력을 단언한다(POSTMORTEM 2026-10-30/11-19).
- **M-G1-2** fake 앱 v4 frame 판정(`socket.ts:364-366`)이 큰따옴표 `data-doan-frame`만 읽는다(POSTMORTEM 2026-10-24).
- **B-G1-1** 에이전트 실행 뒤 러너가 `git`·`python3.12`·`sh`를 에이전트가 쓸 수 있는 `<base>/bin`이 앞선 `ws.env.PATH`로 찾는다(POSTMORTEM 2026-10-25).
- **B-G1-2** O1·O2·O3·O3b fake 앱 `initializeRepo`가 에이전트가 심은 링크를 따라 저장소 밖에 쓴다. 실제 `doan init`은 거부한다.
- **W2-cli-repo-skill-eval-1** 수락된 start/update가 없는 캔버스는 `done`을 마지막에 보내도 `done_at_end`가 실패하고 상세가 틀리게 말한다. `socket.ts:411-415`, `work.ts:17`, `work.test.ts`(POSTMORTEM 2026-11-13).
- **L-G1-3** `bootstrap` 마지막 시도 deadline을 15초 상한에 맞춰 잘라, CLI가 `busy`를 보고한 뒤 앱이 늦게 열 수 있다(의심). `onboarding.go:224-229`.

---

## 미결정 제품 질문 (보고서에만 남김)

| id | 질문 |
|---|---|
| U-G2-1 | 대화 자격증명이 터미널 형식 v3 work(`start`/`done`, conversation 없는 `update`)를 보내 형제 worktree를 자동 등록할 수 있다. 앱이 거부할지, 문서에 명시할지 (`runtime.ts:217,247-262`) |
| C-G2-2 | `canvas-seen.json` 읽기가 ENOENT 아닌 오류일 때 덮어쓸지 (`canvasSeen.ts:84`) |
| L-G2-5, L-G2-6, U1–U8 | quit·crash 정책: 진행 중 sign-out, 중단된 usage read 저장, renderer crash 복구, Trash 때 seen 기록, quit 때 비동기 쓰기·CLI 자식·Codex process group·ACP 대기 상한, 교체된 prototype 창 `viewerClosed`, limitLookup 중 send |
| U-G1-1 | `doan export --frame`에 v4 frameId 제한을 둘지 |
| B-G1-5 | `gitLocation`이 `.git`이 가리키는 디렉터리의 모양을 검증할지 |
| C-G3-6 | `stale` 권한 답이 스레드에서는 "reached", Home strip에서는 실패로 셈 |
| M-G3-2, W2-renderer-conversation-3 | 대화-캔버스 매칭 규칙 5벌. 읽을 수 없는 캔버스 행의 대화를 사이드바에서 어디에 둘지 |
| U-G3-1 | 첫 실행 중 renderer reload 뒤 진행 중 clone을 wizard가 이어 보여줄지 (`OnboardingService`에 `rendererGone` 없음) |
| W2-conv-transport-U1 | Doan이 유발한 ACP `cancelled`를 `interrupted: user`로 기록할지 |
| W2-renderer-conversation-U1 | handoff 판정 대기 중 "Sending" 행을 캔버스 패널에도 보일지 |
| W2-mcp-onboarding-stores-U1 | 거절된 inspect도 세대를 올려 직전 inspection을 stale로 만들지 (`projectAdder.ts:124`) |
| W2-ASU-5 | 설치 실패한 업데이트 상태의 행·헤더·메뉴 표시 |
| W2-shell-5 | MCP 페이지 잠금 중 `mcpAvailable=false`이면 Agents로 강제 전환할지 |
| W2-cli-export-canvas-3 | declarative shadow DOM·`srcdoc` 안 로컬 참조를 내보내기가 지원할지 |
| W2-cli-repo-skill-eval-2 | handoff 없는 실행의 실패 체크 수 R10·R11·R12 불일치 |
| M-G2-4 | Cursor Update floor가 최소 버전과 같아 Update 분기에 도달할 수 없음 |

---

## 커버리지

| 모듈 | contracts | boundaries | lifecycle | maintainability |
|---|---|---|---|---|
| `cli/internal/cli`, `check`, `formats`, `cmd` | contracts-G1 + W2 cli-repo | boundaries-G1 | lifecycle-G1 | maintainability-G1 + W2 cli-repo |
| `cli/internal/canvas`, `export` (Go + viewer) | W2 cli-export-canvas | boundaries-G1 + W2 | lifecycle-G1 + W2 | W2 cli-export-canvas |
| `cli/internal/repo`, `designskill`, `schema/` | W2 cli-repo | boundaries-G1 + W2 | W2 cli-repo | W2 cli-repo |
| `eval/` | contracts-G1 + W2 | boundaries-G1 | lifecycle-G1 | maintainability-G1 + W2 |
| main `conversation/` | contracts-G2 + W2 conv-core, conv-transport | boundaries-G2 + W2 | lifecycle-G2 + W2 | maintainability-G2 + W2 |
| main `agentAuth`, `agentSetup`, `update` | W2 auth-setup-update | boundaries-G2 + W2 | lifecycle-G2 + W2 | W2 |
| main `mcpConnectors`, `onboarding`, `document`, 저장소 모듈 | W2 mcp-onboarding-stores | boundaries-G2 + W2 | lifecycle-G2 + W2 | W2 |
| main `prototype`, `serve`, canvas script, 썸네일, watch, `index.ts` | contracts-G2 + W2 proto-canvas-runtime | boundaries-G2 + W2 | lifecycle-G2 + W2 | maintainability-G2 + W2 |
| `app/runtime`, `app/scripts`, 빌드, `.github/workflows` | contracts-G2 + W2 | boundaries-G2 + W2 | lifecycle-G2 + W2 | maintainability-G2 + W2 |
| preload, `brand`, `formats`, `restore` | contracts-G3 | boundaries-G3 | lifecycle-G3 | maintainability-G3 |
| renderer 셸 (`App.tsx`, 사이드바, Settings, onboarding UI) | W2 renderer-shell | boundaries-G3 + W2 | lifecycle-G3 + W2 | W2 |
| renderer 캔버스·prototype·buddy·CSS | contracts-G3 + W2 renderer-canvas + W3 | boundaries-G3 + W2 | lifecycle-G3 + W2 | W2 + W3 |
| renderer 대화·컴포저 | contracts-G3 + W2 renderer-conversation + W3 | boundaries-G3 + W2 | lifecycle-G3 + W2 | maintainability-G3 + W2 |
| renderer 소형 모듈 | W3 leftovers | W3 | W3 | W3 |

## Postmortem 적용 체크리스트

- 재발(위 발견으로 연결): 2026-11-01 ui-state(M1) · 2026-10-25/11-17 제거 정리(M5) · 2026-11-20 unread 종료(M3) · 2026-11-20 첫 layout 게이트(M15) · 2026-11-20 eval 신호 정리(M17) · 2026-11-17/11-20 활성화 포커스(M12) · 2026-11-13 로딩 중 hover(C-G3-7) · 2026-11-13 eval done 해시(W2-cli-repo-skill-eval-1) · 2026-11-11 클립 반경(M14) · 2026-11-19 project_not_open(C-G1-1) · 2026-11-18/19 `--add-serve`(B-G1-4) · 2026-10-25 eval 도구 PATH(B-G1-1) · 2026-10-23 fake 프로세스 정리(L-G1-5) · 2026-10-24 마크업 판정(M-G1-2) · 2026-10-30/11-19 타이밍 테스트(L-G1-6) · 2026-10-22 served 디렉터리(L-G2-3) · 2026-11-22 ACP 분류(W2-conv-transport-3) · 2026-11-16/20 rpc 대기(W2-ASU-3) · 2026-10-21 경로 정규화(W2-ASU-4) · 2026-11-25 강제 색상(W3-leftovers-1) · 2026-11-17 문구 중복(M-G3-6) · 2026-11-18 규칙 사본(M-G3-2, M-G3-3)
- 유지: 그 밖의 적용 항목(셀마다 20–40개)은 현재 호출 지점과 테스트에서 지켜진다. 셀별 목록은 원자료 보고서 §3.
- 해당 없음: 삭제된 코드(comments, e2e, Undo Remove, drawing relay)를 가리키는 항목.
- 문서 drift(`/doc-check` 대상): POSTMORTEM 2026-10-25 'older install failure'의 검색 대상이 지워진 코드(`installs.current`, `settingsWindow.tsx`)를 가리킨다. 2026-10-25 링크 상태·fixture 위치, 2026-10-24 link 쓰기 항목의 검색 명령이 낡았다.

## 리뷰어

- 1차 웨이브(관점 × 그룹): contracts/boundaries/lifecycle/maintainability × G1(cli+schema+eval), G2(main+runtime+build), G3(renderer+preload+shared) — 12명
- 2차 웨이브(파일 클러스터, 4관점): conv-core, conv-transport, auth-setup-update, mcp-onboarding-stores, proto-canvas-runtime, renderer-shell, renderer-canvas, renderer-conversation, cli-export-canvas, cli-repo-skill-eval — 10명
- 3차 웨이브: renderer 소형 모듈·CSS — 1명
- 리드가 소스에서 직접 다시 확인한 발견: M1, M4, M5, M6, M7, M8, M16, M17

---

## 라운드 1 처리 결과 (2026-11-26)

| PR | 브랜치 | 처리 |
|---|---|---|
| #397 | feat/main-audit | M5, L-G2-3, L-G2-4, L-G2-8, M-G2-2, M-G2-3, M-G2-5, M-G2-10, M-G2-11, M-G2-13(일부), M-G2-14, M-G2-15, M-G3-5, W2-PCR-1. M-G2-12는 재현되지 않아 제외(기존 테스트가 이미 `storage.go`를 읽음). W2-PCR-2는 측정만 함 |
| #398 | feat/conversation-audit | M4, M6, M7, L-G2-2, W2-conv-core-2, W2-conv-transport-2, W2-conv-transport-3(일부), M-G2-7, M-G2-8, M-G2-13(대화 부분), C-G2-1 |
| #399 | feat/cli-audit | M14, M15, C-G1-1, B-G1-4, M-G1-3, M-G1-4, L-G1-3, M-G3-7, W2-cli-export-canvas-4, Go export 프레임 이름 trim |
| #400 | fix/auth-audit | M8, M9, M20, W2-ASU-3, W2-ASU-4, M-G2-9, L-G2-7, M-G2-13(인증 부분), `QUIT_WAIT_MS` |
| #401 | fix/eval-audit | M16, M17, L-G1-2, L-G1-4, L-G1-5, L-G1-6, M-G1-2, B-G1-1, B-G1-2, W2-cli-repo-skill-eval-1 |
| #402 | feat/renderer-audit | M1, M3, M10(일부), M11, M12, M13(일부), M18, M19, C-G3-4, C-G3-7, C-G3-8, C-G3-9, M-G3-3, M-G2-6, M-G3-4, M-G3-6, L-G3-3, B-G3-1, W2-renderer-conversation-1, W2-shell-6, W2-renderer-canvas-1·2·3·4·5·6, W3-leftovers-1, W3-leftovers-2 |

의심으로 분류한 발견은 모두 고치기 전에 실패하는 테스트나 probe로 재현했다. 재현되지 않은 것은 M-G2-12 하나다.

### 사용자 결정으로 넘긴 것

- BACKLOG에 올린 것: M2(터미널 resume 첨부 누락), W2-PCR-2(사이드바 프로젝트 클릭 시 main 정지), C-G3-3(Fast `bad_request`), M10 남은 부분(숨긴 auto worktree의 마지막 캔버스 기억).
- 보고서에만 남긴 것(Low):
  - W2-conv-transport-3 남은 부분: 기록된 provider 메시지가 없는 문구의 ACP 실패 코드가 열기 단계와 프롬프트 단계에서 다르다.
  - C-G3-5: 설정 경로 거절마다 CLI 오류 코드를 따로 두는 문제로, CLI 계약을 바꿔야 한다.
  - M13 남은 부분: 손으로 추가한 worktree를 "마지막으로 등록한 프로젝트"로 볼지.
  - 위 '미결정 제품 질문' 표의 항목.

### 각 PR이 남긴 후속 후보 (라운드 2 감사 대상)

- `design-skills:get`과 `onboarding:check` main 핸들러를 호출하는 곳이 없다. `design-skills:get`을 지우면 ARCHITECTURE §7 'Design preset reads'가 바뀐다.
- Locate에 busy 검사가 없다.
- `message.delta`·`message.done`·`mcpStartup.ts` 요약의 U+0000.
- `mcpConnectors/codexApproval.ts`가 아직 예전 request id 형식을 만든다.
- 강제 색상 모드에서 채우기만으로 표시하는 상태가 더 있다: Settings 스위치, 메뉴 강조, Quick Open 선택, 캔버스 도구, composer pick 등.
- `FAST_PROVIDERS`의 단일 출처, 예약 큐 행의 명령 표시, `nextQueued`·`combineQueued` 공유.
- `@property` `<url>` 처방이 `image-set()` 값에는 맞지 않는다.
- 펜스 안에 심어진 `chmod 000` 폴더가 여전히 provider를 막는다.

### 실행 검증 상태

공용 gate는 6개 PR 모두 로컬과 CI에서 통과했다. 실앱 probe를 한 PR과 결과는 다음과 같다: #397 4/4, #402 5/5, #400 Seatbelt probe 1건. 각 PR 본문이 실앱에서 확인하지 못했다고 적은 항목은 lead.md 6단계에 따라 라운드 2가 끝난 뒤 한꺼번에 확인한다.
