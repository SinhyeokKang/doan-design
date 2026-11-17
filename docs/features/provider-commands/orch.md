# provider-commands — orch

- 원본: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md) · 확정 드래프트 `.doan/canvases/provider-commands.html`
- 시작 해시: `d47b63611`
- 통합 브랜치: `feat/provider-commands`(리드가 develop에서 만들었다). PR은 develop 대상이고 리드가 머지한다.
- 대상: task 3–10. task 1·2는 끝났다.

## 결정 기록
1. `/compact` 외 명령의 실행 중 라벨(사용자): Claude `/clear` → "Clearing context…", Codex `/review` → "Reviewing…". 나머지 명령은 기존 턴 진행 표시를 그대로 쓴다.
2. 배치 순서(지휘자 판단, 근거: 파일 겹침): B1 → B2 → B3를 직렬로 돈다. B2는 B1의 타입과 순수 함수를, B3는 B2가 내는 목록·경계·카드 데이터를 쓴다. `app/src/main/conversation/`의 types·queue·skills와 preload가 배치 사이에 겹친다.
3. 모델: 구현 워커는 Claude만 쓴다(지휘자 판단). 리뷰 워커는 Codex를 쓴다(사용자 허용, 모델 교차 범위는 리뷰 워커뿐). 판단이 많은 diff는 `gpt-6-astra` medium으로 본다.
4. `/agent-eval` 대상 여부(지휘자 판단, 근거: AGENTS 'Workflow'): 가이드, CLI 출력·메시지, `doan check` 규칙, 스킬 스텁을 바꾸지 않으므로 대상이 아니다. 배치 중 이 범위를 건드리면 다시 판단한다.
5. Claude `/reset`·`/new`(사용자): `/clear`의 별칭이므로 사람이 직접 치면 `/clear`처럼 보내고, 경계를 남기고, 새 세션 id를 따라간다. 목록에는 `/clear`만 둔다.
6. `/logout`·`/login` 카드(사용자): 모든 프로바이더에서 Antigravity `/logout`과 같은 Settings > Agents 문구와 버튼을 쓴다.
7. 명령과 첨부(사용자): 명령만 보내고 첨부는 컴포저에 남긴다.
8. B1 열린 질문 중 지휘자 판단: Copilot `/clear`·`/cost`는 서버 목록에 없으므로 결정 2·10에 따라 텍스트로 보낸다(카드 없음). Codex `/compact <텍스트>`는 텍스트를 버리고 압축한다(R1이 막자고 했으나 사용자가 버리기로 정했다). `/permissions` 카드는 모든 프로바이더에서 permission picker로 보낸다(결정 2의 '같은 기능이 있으면 그쪽으로'). Claude 명령 설명은 SDK가 placeholder를 주면 표 문구를 쓴다. PoC 로그가 없어 확인 버전의 실제 문구는 확인하지 못했다.
9. 재시작 뒤 경계(사용자, design 결정 4를 바꾼다): 실행 중에는 프로바이더 이벤트로 경계를 낸다. 재시작 뒤에는 Doan 기록에서 다시 만든다. 그 프로바이더의 `/compact`·`/clear`(Claude 별칭 포함)를 보내고 turn.done으로 끝난 명령 턴이 근거다. 기록 형식은 바꾸지 않고 프로바이더 프로세스나 파일을 읽지 않는다. 그래서 `/clear` 이전 경계도 남고, Copilot 압축 경계도 재시작 뒤 남는다(예외가 없어진다).

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| B1 | task 3, 4 | `app/src/main/conversation/types.ts`(`SkillSummary`), 새 순수 함수 모듈과 테스트(main `conversation/`, renderer 보내기 조립·하이라이트 helper) | 없음 | Opus high: 허용 목록·첫 단어 판정·경계 근거·숨길 기록 규칙이 PoC 표 해석에 달려 있고, 틀리면 B2·B3가 모두 따라 틀린다 | `npm --prefix app run typecheck`, `npm --prefix app test` | 통합 끝(b971f3dec..5141c71af). R1(Codex astra medium) 🔴0 🟡3 💬3, 수정 1라운드. verify PASS(5141c71af). worktree 정리함 |
| B2 | task 5, 6, 7 | `app/src/main/conversation/`(skills·runners·acpRunner·acp·queue·service·store·sessions 등), `app/src/preload/` | B1 | Opus high: 세션 id 고정 검사 예외, ACP 연결 수명, Codex 요청 매핑. 틀리면 세션을 몰래 바꾸거나 다른 연결의 목록을 보인다 | `npm --prefix app test`, typecheck | 진행 중(pc-b2) |
| B3 | task 8(+`/runtime-test`, `/design-sync`) | `app/src/renderer/`, `docs/design/conversation.md`·`docs/DESIGN.md` 측정값 | B2 | Opus high: 네 컴포저 공통 규칙, `/` 목록 위치 변경, 실제 앱 측정 | `npm --prefix app test`, `/runtime-test` 네 항목, `/design-sync` | 대기 |
| 지휘자 | task 9, 10 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/BACKLOG.md`, `docs/features/provider-commands/` 삭제 | B3 | — | `verify.mjs` 종료 0, `/doc-check` 대상 문단 대조 | 대기 |

- 각 배치 뒤 독립 Codex 리뷰 워커가 `/code-review`로 본다(모델·effort는 diff 난이도로 정한다).
- tasks의 체크 항목은 모두 위 행 하나에 속한다. task 4의 테스트 목록은 B1, task 8의 `/runtime-test` 네 항목은 B3에 속한다.

## 겹침과 순서
- 모든 배치가 직렬이라 같은 파일을 동시에 고치지 않는다.
- 각 배치는 `feat/provider-commands`에서 갈라진 자식 worktree에서 돈다. 지휘자가 앞 배치를 통합한 뒤 다음 배치를 시작한다.
