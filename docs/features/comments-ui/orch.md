# comments-ui — 최종 게이트 보완

기존 계획과 수용 근거는 `.scratch/comments-ui/accepted-plan/`, 제품 결정은 PRODUCT/ARCHITECTURE, 측정 한계는 DESIGN에 있다. 통합 브랜치는 feat-comments-ui이며 시작점은 bb6f5c6이다. push/PR은 최종 게이트 통과 전 보류한다.

| 배치 | 소유 범위 | 모델·이유 | 게이트 | 상태 |
|---|---|---|---|---|
| S-final | comments-ui e2e의 복구 메시지 너비 검사와 원인으로 확인된 코멘트 표시 부분만 | Astra medium — 실제 레이아웃/검사 좌표계 판단 | 실제 원인·관측값, red→green, unit/type/build/e2e, 독립 리뷰 | 배정 |

첫 지휘자 e2e는 기존 runtime.ts:420의 재시작 후 툴팁 대기에서 timeout했다. 제품 코드 변경 없이 한 번 재실행해 해당 검사는 통과했지만, comments-ui의 Recovery message spans panel 검사가 실패했다. 첫 원인은 미확정이며 둘 다 로그를 보존한다. 새로운 너비 실패를 숨기도록 기대값을 완화하지 않고 실제 패널 내용 영역과 요소 기하를 확인한다. S-final이 실제 Electron 슬롯을 독점한다.

- S-final 4e7cadd는 검사만 +7/-3 수정했다. 실제 원인은 패널 outer 279px와 client/message 268px 사이의 11px native scrollbar이며 수정한 검사는 원래 중첩 구조에서 directChild false·양쪽 12px로 red다. 전체 e2e·1112 tests·type·Go 통과 후 release했다. R-S-final은 Astra medium으로 고정 delta·기하 근거·증거 및 DESIGN/POSTMORTEM 보완을 읽기 전용 리뷰한다.
