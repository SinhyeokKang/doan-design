# 프로젝트 대화의 handoff — tasks

순서: 순수 함수 → main(서비스·프롬프트) → CLI → renderer → eval → 문서 승격. 공유 스키마 변경이 없어서 스키마 단계는 없다. **선행 조건**: overview-conversation-list가 develop에 머지된 뒤 시작한다(design.md '다른 feature와의 관계'). 커밋은 `/ship` 순서를 따른다: test 하나 → feat 하나 → (CLI·eval은 각자 test/feat) → 문서별 docs 커밋.

1. **handoff 순수 함수 테스트**: `handoffEligibility`(캔버스 없는 Doan 연결 대화 허용, Plan·중복 거부 유지), `handoffGuidanceFor`(프로젝트 턴에 true, Plan에 false), `handoffDecision`(source 없음), `handoffPrompt`(프로젝트 원본의 `context.from`과 문구).
   - 검증: `npm --prefix app test`에서 새 테스트가 red다.
2. **renderer 순수 함수 테스트**: `handoffView.ts`(원본 라벨 "Overview", 토스트 두 문구, 원본 페이지가 그 대화를 보여주는 Overview일 때의 `handoffMove`), `overviewRun`·`overviewConversation`(promotion 변화 없음, 예전 기록의 `conversation.bound`가 Overview를 바꾸지 않음), `canvasRun`(Drawing 미리보기 없음), `newConversationFollow`(promotion 따라가기 없음), `summary`(`startedBy` 새 기록에 promotion 없음, 예전 기록 읽기).
   - 검증: `npm --prefix app test`에서 새 테스트가 red다.
3. **서비스 테스트**: `service.handoff.test.ts`·`service.test.ts`에 아래를 더하거나 고친다.
   - 프로젝트 대화의 `doan handoff`가 받아들여지고, done 턴 뒤 새 대화가 원본의 provider·모델·effort·Fast·권한 모드로 시작된다("refuses a project conversation, which promotion binds instead" 테스트는 뒤집는다).
   - 프로젝트 턴이 더 이상 캔버스에 묶이지 않는다(새 캔버스 하나, 편집만, 둘 이상 모두).
   - 루트 잠금: handoff 요청 없는 턴은 끝나는 즉시 루트를 놓고, 요청 있는 턴은 handoff가 모두 정해질 때까지 `working`이다.
   - 큐: handoff 대기 중 큐가 잡히고 `handoffQueueOutcome`대로 처리된다. 사용량 한도 대기 큐가 리셋 전에 나가지 않는다.
   - missed: 안내받은 프로젝트 턴이 handoff 없이 새 캔버스를 남기면 `handoff.missed`가 쓰인다.
   - Move to Trash: handoff를 기다리는 요청 경로만 막는다.
   - 검증: `npm --prefix app test`에서 새 테스트가 red다.
   - ── 커밋 경계(test) ──
4. **구현(앱)**: design.md '영향받는 구성 요소'의 main과 renderer를 구현하고 promotion 코드를 걷어낸다(프로토타입 창 중계 포함).
   - 검증: `npm --prefix app test` green, `npm --prefix app run typecheck`·`npm --prefix app run lint` 통과.
   - `/runtime-test` 짧은 프로브: 프로젝트 대화(실제 에이전트, AGENTS.md 'Real agent sign-ins'의 격리된 복사본)가 새 캔버스를 만들고 handoff → 새 캔버스 대화 시작, Overview에서의 자동 이동, 원본 대화가 Overview에 남음, 새 대화의 첫 카드 "Handed off from Overview"와 Open.
   - ── 커밋 경계(feat) ──
5. **CLI 문구**: `handoff_rules.go`의 `not_app_conversation` 다음 단계 문구를 바꾸고 테스트를 고친다.
   - 검증: `go test ./...`·`go vet ./...` 통과(테스트 먼저 red).
   - ── 커밋 경계(test, 그다음 fix) ──
6. **eval 시나리오**: 프로젝트 대화에서 새 캔버스를 만들고 handoff하는 시나리오를 추가한다(R10의 프로젝트판). pass·fail fixture를 함께 만든다.
   - 검증: `node eval/run.ts --self-test --scenarios <새 id>,R8d,R9b,R10,R11`이 `self-test PASS`와 exit 0, `node --test 'eval/**/*.test.ts'` 통과. 마지막 통합 전에 `/agent-eval`로 실제 Claude Code·Codex 라운드를 돈다(AGENTS.md 'Workflow': 턴 프롬프트와 CLI 메시지가 바뀐다).
   - ── 커밋 경계(test, 그다음 feat) ──
7. **문서 승격**: 아래를 현재 규칙으로 고쳐 쓰고(영어, 문서별 커밋), `docs/features/project-conversation-handoff/`를 지운다. 같은 내용의 `docs/BACKLOG.md` 'Undecided' 항목도 지운다.
   - **PRODUCT**: §3 In scope 6과 Out of scope 4(handoff 예외 확대), §4 Loop 4, §5 item 1 'Project conversations'(promotion 문단 삭제, 루트 잠금과 큐), 사이드바 슬롯의 판정 대기 문구, item 2 'Handoff'(프로젝트 원본, "Project conversations hand off through promotion instead" 삭제)·'Conversation panel'의 'Drawing and promotion', item 3 'Promotion'·'Which conversation shows'의 승격 문구·'Canvas cards'·Delete의 판정 대기 문구, Home의 새 캔버스 자동 열기와 strip 문구.
   - **ARCHITECTURE**: §7 'Project conversations and promotion'(promotion 부분 삭제, 루트 잠금과 판정 시점만 남김), 'Handoff'('Key'의 promotion 언급, 판정 시점), 'Canvas lifecycle', 'Canvas cards', §3의 프로토타입 promotion 중계, 턴 프롬프트 설명.
   - **DESIGN**: `docs/design/project.md`, `docs/design/canvas-conversation.md`의 promotion·drawing 관련 절과 측정값.
   - 검증: `grep -rni "promot" docs --exclude-dir=postmortem --exclude-dir=features --exclude-dir=usability-eval`의 남은 결과가 예전 기록 읽기에 관한 문장뿐이다. 문서만 바뀌므로 참조 확인으로 검증한다.
   - ── 커밋 경계(docs, 문서마다) ──
