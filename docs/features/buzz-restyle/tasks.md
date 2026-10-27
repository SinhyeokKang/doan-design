# buzz-restyle — tasks (부모)

부모의 task는 하네스를 준비하고, 자식 feature를 끝내고, 마지막에 정리하는 것이다. 각 자식의 구현 task는 그 자식의 `tasks.md`에 있다. 부모는 `/ship`이나 `/orchestrate`로 진행하지 않는다. 이 문서의 수정은 하네스·문서 변경 경로(AGENTS.md 'Commit conventions')로 대화 중에 커밋한다.

자식 하나를 시작하고 끝내는 절차는 [design.md](./design.md)의 '자식 진행 규칙'을 따른다.

## H. 하네스 준비 (`buzz-ds` 구현 전에. `buzz-ds`도 새 초안과 `/design-sync`를 쓴다)

- [x] H1. AGENTS.md Workflow 'Terms'에 부모 feature를 정의한다: 자식 feature를 정의하고 공통 결정을 보관하는 허브, `/ship`·`/orchestrate` 대상이 아님, 마지막 자식 뒤 삭제.
  - 검증: `grep -n 'parent feature' AGENTS.md`에 정의 줄이 있다.
- [x] H2. 리디자인 초안을 허용하도록 하네스를 넓힌다(공통 결정 11).
  - AGENTS.md의 `/design-sync` 규칙과 `.agents/skills/design-sync/SKILL.md`: 리디자인 자식의 새 초안은 그 자식이 머지될 때까지 정본이다.
  - `.agents/skills/design-draft/SKILL.md`: 리디자인 자식은 main에 이미 있는 화면의 새 초안을 그릴 수 있다. "다크 전용" 규칙을 라이트 단일과 역할 토큰으로 바꾼다.
  - 검증: `grep -n 'redesign' AGENTS.md .agents/skills/design-sync/SKILL.md .agents/skills/design-draft/SKILL.md`에 세 파일 모두 줄이 있다.
- [x] H3. AGENTS.md Commands에 읽기 전용 Buzz 참조 명령 `git -C ~/code/buzz-app rev-parse HEAD`와 `git -C ~/code/buzz-app show <sha>:<path>`를 추가한다.
  - 검증: `grep -n 'buzz-app' AGENTS.md`에 두 명령이 있다.

── commit: `docs(agents): define parent features` / `docs(skills): let design skills follow redesign drafts` / `docs(agents): add Buzz reference commands` ──

## C. 자식 feature

2026-10-28 main 이력·자식 디렉터리·PRODUCT/ARCHITECTURE/DESIGN을 대조했다. 완료 체크는 main 병합과 승격·검증 근거가 함께 있는 경우에만 한다. 디렉터리가 없는 미착수 자식을 완료로 보지 않는다. 과거 전체 e2e 미통과 기록은 그대로 보존하며, 현재는 AGENTS의 static/unit/build와 변경 범위 probe 정책을 따른다.

- [x] C0. `buzz-ds` — PR #27, `f0dc812` main 병합. 라이트 DS·프리미티브·공유 표면 구현과 승격 완료, 자식 디렉터리 삭제. [DESIGN](../../DESIGN.md#design-system--buzz-ds-2026-10-26)에 측정과 당시 네이티브 검증 한계가 있다. 그 한계를 전체 e2e 통과로 바꾸지 않는다.
- [x] C1. `buzz-shell` — PR #30, `c625057` main 병합. 구현·네이티브·패키지·변경 범위 runtime 검증과 정본 승격 완료, 자식 디렉터리 삭제. [최종 완료 기록](../../DESIGN.md#buzz-shell--completed-implementation-and-unlocked-acceptance-2026-10-27)에 revised verify gate와 집중 probe 결과가 있다.
- [ ] C2. `buzz-onboarding` — [spec](../buzz-onboarding/spec.md)·[design](../buzz-onboarding/design.md)·[tasks](../buzz-onboarding/tasks.md)·[review](../buzz-onboarding/review.md). 디자인 승인·10프레임/33상태 HTML 검증·feature-review 완료, 구현 전. 최소 한 agent ready·프로젝트 필수, 기존 Git/gh 재사용/clone, 앱과 같은 main 서비스를 쓰는 CLI/MCP setup. agent-auth 완료 후 구현한다.
- [ ] C3. `buzz-home` — 미착수. 단일 대화 입력창·프로젝트 선택 UI는 확정, 상세 설계는 후속. 온보딩 root 인계와 agent-auth 인증 기반을 사용한다.
- [ ] C4. `buzz-search` — 미착수. Quick Open 내용과 결과 행.
- [ ] C5. `buzz-project` — 미착수. Overview 본문만 담당하며 완료된 LNB/프로젝트 메뉴를 다시 만들지 않는다.
- [ ] C6. `buzz-canvas` — 미착수. 캔버스 보드·컨트롤·선택 표시·오류.
- [ ] C7. `buzz-inspector` — 미착수. Inspector 내용. 오른쪽 패널 표시 정책은 buzz-conversation.
- [ ] C8. `buzz-conversation` — 미착수. agent-conversation 기반은 PR #28, `d6590a6`로 main 병합됐다. agent-auth·buzz-canvas·buzz-inspector가 선행한다. 대화 UI와 앱 코멘트 UI 교체 범위는 spec 표 8번. 온보딩 첫 프롬프트 단계는 제거 계획이며 새 홈 입력창은 buzz-home 담당이다.
- [ ] C9. `buzz-settings` — 미착수. 별도 Settings 창의 시각 구성. 인증 backend를 재구현하지 않는다.

### 외부 선행과 다음 순서

`agent-auth`는 이 부모의 자식이 아니다. [별도 tasks](../agent-auth/tasks.md)에 다섯 공급자 구현·암호화·갱신·실행 통합 과업이 있다. 최소 인증 PoC 통과를 제품 구현 완료로 보지 않는다.

다음 구현 경로는 agent-auth 완료 → buzz-onboarding이다. 선행을 충족한 다른 화면 자식은 spec의 의존성에 따라 진행할 수 있다. 온보딩의 CLI/MCP 계약 변경은 최종 agent-eval을 필수로 하며, 부모 전체 검증을 새 e2e suite로 만들지 않는다.

## Z. 부모 정리

- [x] Z0. 당시 comments-ui `08-hidden-quit-close`의 네이티브 포커스 시간 초과 조사를 완료했다. PR #29, `6912eab`로 main에 병합됐다(2026-10-27). 잠긴 데스크톱과 제품 동작을 분리했고, 잠금 검사·명시적 실패 안내·네이티브 상태 증거를 추가했다.
  - 근거: [POSTMORTEM의 Native focus waits hid a locked desktop](../../POSTMORTEM.md#2026-10-27--native-focus-waits-hid-a-locked-desktop). unlocked runtime 통과 기록과 현재 `app/runtime/` 지원 기반을 확인했다. 삭제된 `app/e2e/comments-ui.ts`를 다시 실행할 과업으로 남기지 않는다. 이후 다른 원인으로 실패한 전체 실행 기록을 이 수정으로 통과 처리하지 않는다.

- [ ] Z1. 남은 표시, 다크 잔재, PRODUCT §7 기록을 확인하고 이 디렉터리를 지운다.
  - 검증:
    - `grep -n 'buzz-ds 이전' docs/DESIGN.md` 결과 없음
    - `grep -nE 'color-scheme: *dark|#121212|#171717|#1d1d1d|#ecebe4|#f0773a|#3a2117|#1a0b03' app/src/renderer/*.css` 결과 없음
    - PRODUCT §7에 spec '완료 조건'의 대체 기록이 모두 있음
    - design.md의 미인계 '조사 메모: 캔버스 영역'이 해당 자식으로 인계됐고 모든 자식이 완료됨
    - `docs/features/buzz-restyle/`가 없음

── commit: `docs(feature): remove buzz-restyle after all screens` ──
