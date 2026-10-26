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

각 줄의 검증: main에서 `test ! -d docs/features/<slug>`가 통과하고, '자식 진행 규칙' 5의 `verify.mjs --runtime` PASS가 그 자식의 PR에 기록되어 있으며, 'DESIGN.md 절과 담당' 표에서 그 자식이 지울 표시가 남아 있지 않다(`grep -n 'buzz-ds 이전' docs/DESIGN.md`로 해당 절 확인). 체크는 다음 자식을 시작하는 세션이 머지를 확인한 뒤 한다.

- [ ] C0. `buzz-ds` — 문서 있음: [`../buzz-ds/`](../buzz-ds/spec.md)
- [ ] C1. `buzz-shell`
- [ ] C2. `buzz-onboarding`
- [ ] C3. `buzz-home`
- [ ] C4. `buzz-search`
- [ ] C5. `buzz-project`
- [ ] C6. `buzz-canvas`
- [ ] C7. `buzz-inspector`
- [ ] C8. `buzz-conversation` — 기존 `buzz-comment` 자리(2026-10-26 user). 기반 feature [`agent-conversation`](../agent-conversation/spec.md)이 main에 들어간 뒤 시작한다. 범위는 spec 자식 표 8번
- [ ] C9. `buzz-settings`

## Z. 부모 정리

- [ ] Z0. comments-ui `08-hidden-quit-close`(`comments-ui.ts:566`) 시간 초과를 조사하고 고친다(`/ship` 버그 경로와 `/postmortem`). macOS 26에서 숨겼던 창이 다시 떠도 포커스를 받지 못하는 실제 제품 버그일 수 있다(추론). 모든 자식이 끝날 때까지 미룬다(2026-10-26 user).
  - 검증: `node .agents/skills/verify/scripts/verify.mjs --runtime` 최종 PASS.

- [ ] Z1. 남은 표시, 다크 잔재, PRODUCT §7 기록을 확인하고 이 디렉터리를 지운다.
  - 검증:
    - `grep -n 'buzz-ds 이전' docs/DESIGN.md` 결과 없음
    - `grep -nE 'color-scheme: *dark|#121212|#171717|#1d1d1d|#ecebe4|#f0773a|#3a2117|#1a0b03' app/src/renderer/*.css` 결과 없음
    - PRODUCT §7에 spec '완료 조건'의 대체 기록이 모두 있음
    - design.md '자식 feature 조사 메모'에 남은 메모가 없음
    - `docs/features/buzz-restyle/`가 없음

── commit: `docs(feature): remove buzz-restyle after all screens` ──
