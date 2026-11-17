# provider-commands — tasks

1. **(완료, PR #253) PoC: 프로바이더×명령 동작 표.** 격리된 프로필에서 Claude SDK, Codex app-server, ACP 세 프로바이더에 후보 명령을 보내고 결과 이벤트를 기록한다. `/clear`의 세션 id 변화도 기록한다. 표는 design.md 'PoC 의존'에 적는다.
   - 확인: 표의 모든 칸에 판정, 기대 결과, 확인 버전이 채워진다. 실험 코드는 `.scratch/`에 둔다.
   - — 커밋 경계 (문서만). PoC 결과가 형식 변경을 요구하면 design.md '형식 변경'을 다시 연다 —
2. **(완료, PoC 반영 revise 포함) `/design-draft provider-commands`.** 다음을 그린다.
   - `/` 목록의 명령 행과 Commands 탭
   - 큐의 명령 행
   - 실행 중·결과·실패 상태
   - 압축·지움 경계
   - 목록 밖 명령 카드(같은 기능이 있을 때·없을 때)
   - 확인: `doan check --json --repo .` 오류 0, 사용자가 앱에서 확인한다.
3. **IPC 타입.** `SkillSummary`에 행 종류를 추가한다.
   - 확인: `npm --prefix app run typecheck`.
4. **순수 함수.** `parseClaudeCommands`, `parseAcpCommands`, 허용 목록 표, `commandRequest`, `classifyFirstWord`, 보내기 조립, 큐 규칙, 경계 뷰, 카드 뷰.
   - 확인: `npm --prefix app test`. 테스트에 다음 경우를 포함한다.
     - 프로바이더 미연결
     - 목록 읽기 실패 뒤 지난 목록 유지
     - Claude·Codex는 고정 표, 낮은 CLI 버전이면 명령 행 없음. ACP는 서버 목록과의 교집합
     - Codex `/review` target(텍스트 없음 → `uncommittedChanges`, 있음 → `custom`)
     - 숨길 기록(Claude 요약 메시지·stdout 줄, Codex 리뷰 자식 턴)과 경계 근거 이벤트(Claude `compact_boundary`·`/clear` 줄, Codex `contextCompaction` 턴)
     - 카드 대상(Antigravity `/logout`·`/plan`, `/model`)과 확인하지 않은 ACP 명령은 텍스트로 보냄
     - `/compact해줘` 첫 단어 판정
     - 인자 없음과 인자 있음
     - 스킬과 이름이 같은 명령
     - 경로 `/Users/...`는 일반 텍스트
     - 기존 `"/deploy /review"` 스킬 테스트 기대값 유지(`HomeComposerView.interaction.test.tsx:912`, `homeComposer.skills.test.ts:11`)
   - — 커밋 경계 —
5. **목록 읽기.**
   - Claude: `SkillCatalog` 경로에서 명령을 함께 낸다.
   - ACP: 대화별로 마지막 `available_commands_update`를 보관하고, 연결이 바뀌면 버린다. `session/new` 응답 전에 오는 update도 받는다(Copilot).
   - 확인: `npm --prefix app test`(runner·catalog 단위 테스트).
6. **보내기.**
   - Claude와 ACP는 텍스트를 그대로 보낸다.
   - Codex는 `commandRequest`로 대응 요청을 보낸다.
   - 목록 밖 명령은 보내지 않는다.
   - 실행 중이면 별도 큐 행을 만든다.
   - 확인: `npm --prefix app test`(runner 단위 테스트, Codex fake dispatcher).
7. **`/clear` 세션 교체(Claude만).** 새 id는 `conversation_reset` 다음 `system/init`의 `session_id`에서 읽는다. `runners.ts:181`의 id 고정 검사에 사람이 고른 `/clear` 예외를 둔다. `SessionBinding`은 profile·cwd 검증을 거쳐 새 id로 다시 쓴다. 재개한 세션에서 `/clear`를 쓰는 경우도 포함한다.
   - 확인: `npm --prefix app test`. 예외 외의 id 변경은 계속 `session_unavailable`이어야 한다.
   - — 커밋 경계 —
8. **UI.** task 2 드래프트를 기준으로 네 컴포저(Home, Overview, 캔버스 패널, 프로토타입 창)에 다음을 넣는다.
   - 명령 행, Commands 탭, 하이라이트, 칩 안내
   - 큐 행
   - 경계와 카드, 컨텍스트 링 갱신
   - 확인: `npm --prefix app test`. 그 뒤 `/runtime-test`로 확인한다.
     - `/compact`의 실행 중 표시, 경계, 링
     - `/clear`의 경계, 재시작 뒤 경계 유지
     - `/model`의 카드와 텍스트 복귀
     - 프로토타입 창 컴포저의 목록
   - — 커밋 경계 —
9. **검증.** `node .agents/skills/verify/scripts/verify.mjs`.
   - 확인: 종료 코드 0.
10. **승격.** 다음 문서를 지금 규칙으로 고친다.
    - PRODUCT §5 'Project skills'(내장 명령 포함, Commands 탭, 카드)
    - 'Resume and permissions'·'Session identity'(`/clear` 예외)
    - 대화 항목(명령 턴, 큐, 경계)
    - ARCHITECTURE §7(명령 전달 경로, ACP 명령 목록 수명)
    - DESIGN·`docs/design/conversation.md`(측정값)

    그 뒤 `docs/features/provider-commands/`를 지운다. `/agent-eval` 대상인지도 판단한다. 대상 범위는 AGENTS.md 'Workflow'에 있다.
    - 확인: `/doc-check` 대상 문단 대조.
