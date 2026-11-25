# r2-main 오케스트레이션 (/audit-loop 라운드 2)

- 출처: `docs/features/audit-261126-2/report.md`의 R2-M3(R2-conv-core-1), R2-conv-transport-1·2·3, R2-main-core-1, R2-main-canvas-2. 원본 리뷰어 보고서는 메인 체크아웃 `.scratch/audit/261126-r2/`(conv-core.md, conv-transport.md, main-core.md, main-canvas.md).
- 시작 해시: `1078f3a6727d3a70797b13d84dbc3bc4747ad341`
- 통합 브랜치: `feat/r2-main` (리드가 만들었다. PR은 develop 대상)

## 결정 기록

리드 브리프가 사용자에게 묻지 말라고 했다. 아래는 모두 conductor's call이다.

- D1. R2-M3는 리뷰어 보고서의 첫 방향을 따른다. `add()`가 그 대화의 보류 send까지 한도에 넣고, 넘치면 `queue_limit`으로 거절한다. 근거: ARCHITECTURE §7 'drafts.json' "Reader and writer share the same bounds", 대화당 반환 draft 하나라는 형태를 유지한다. 보류 send가 있을 때 큐가 거절되는 것은 기존 `queue_limit` 동작과 같은 오류이고 새 UI가 없다.
- D2. R2-conv-transport-1은 저장되는 에이전트 문자열에 기존 `storableText`를 적용한다(메시지 텍스트, 질문 텍스트·선택지, `turn.failed` detail, `permission.request` tool). 근거: POSTMORTEM 2026-11-26 U+0000 예방 규칙 "never store it raw".
- D3. R2-conv-transport-3(문서만)은 conductor가 ARCHITECTURE 'Input and prompt' 문장을 현재 규칙으로 고친다. ARCHITECTURE를 배치 C도 고치므로 소유를 나눈다: 배치 C는 §7 'Removal'·'Recovery'·'Auto-registered roots' 줄, conductor는 'Input and prompt' 줄.
- D4. R2-main-core-1은 shell이 re-root한 옛 root를 main에 알리고 index.ts가 `rootsLeft([from], before)`를 실행한다. ARCHITECTURE §7 'Removal' 트리거 목록에 추가한다.
- D5. R2-main-canvas-2는 `entries`에 아직 등록된 root의 키를 살아 있다고 본다(`list`가 아닌 상태 포함). 근거: 같은 파일 `:306`, `:36` 규칙.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| A | R2-M3 | `app/src/main/conversation/drafts.ts`, `drafts.test.ts` (필요하면 `service.ts`의 queue 호출부) | 없음 | Claude Opus medium — 데이터 보존 한도, 판단이 필요하지만 범위가 한 모듈 | `npm --prefix app test -- drafts`, typecheck, lint | 대기 |
| B | R2-conv-transport-1, R2-conv-transport-2 | `app/src/main/conversation/transport.ts`, `acp.ts`, 관련 테스트(`transport.test.ts`, `acp.test.ts`, `activityStore.test.ts` 옆 새 테스트) | 없음 | Claude Opus medium — 여러 provider 경로에 같은 규칙, 누락이 재발로 이어진다 | 관련 vitest, typecheck, lint | 대기 |
| C | R2-main-core-1, R2-main-canvas-2 | `app/src/main/shell.ts`, `shell.test.ts`, `index.ts`, `index.test.ts`, `thumbnails.ts`, `thumbnails.test.ts`, `docs/ARCHITECTURE.md` §7 'Removal'·'Recovery'·'Auto-registered roots' | 없음 | Claude Opus medium — main 수명주기와 정리 경로, 다른 경로와 맞춰야 한다 | 관련 vitest, typecheck, lint | 대기 |
| conductor | R2-conv-transport-3 | `docs/ARCHITECTURE.md` 'Input and prompt' 문장 | 없음 | — | 문서 확인 | 대기 |

리뷰: 배치마다 독립 리뷰 워커(Claude Opus medium, `/code-review`, 보고만).

## 겹침과 순서

- A·B·C는 코드 파일이 겹치지 않아 병렬로 실행한다. B와 A는 같은 `conversation/` 폴더지만 파일이 다르다. A가 `service.ts`를 건드리면 B는 `service.ts`를 건드리지 않는다(B는 `service.ts` 금지).
- `docs/ARCHITECTURE.md`는 C와 conductor가 서로 다른 줄을 고친다. 다른 conductor(r2-cli)도 ~280줄을 고치므로 충돌 시 둘 다 유지한다.
- `thumbnails.ts`는 이 실행이 소유한다. r2-renderer가 필요하면 리드를 통해 조율한다.
