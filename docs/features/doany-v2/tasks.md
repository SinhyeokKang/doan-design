# Doany V2 — 구현 순서

문서·선택 원본·몸통/베레모 레이어·실행 Home/Welcome 초안·정적 모션 스토리보드를 준비했다. 앱 구현은 시작하지 않았다. 각 단계의 실패는 다음 단계로 넘기지 않는다.

- [x] V2를 최초 Pebble로 고정하고 같은 캔버스에 V2 전용 프레임과 전용 에셋 디렉터리를 둔다.
  - 검증: `doan check` 결과에서 V2 프레임 오류가 없는지 확인하고 원본 SHA-256을 대조한다. 저장소 전체의 기존 오류는 별도로 보고한다.
- [x] A. 선택 원본·V2 문서·캔버스를 구현 브랜치에서 사용할 수 있도록 버전 관리 상태를 확인한다. 탐색 이미지와 새 V2 이미지가 아직 미커밋이면 먼저 포함한다. 다른 브랜치로 문서만 가져가 원본을 잃지 않는다.
  - 검증: `go run ./cli/cmd/doan ls --repo . --json`과 원본 파일·해시 대조. 커밋 경계: 선택 자산·V2 인계 자료.
- [x] B. 눈 없는 몸통·베레모 레이어를 만들고 V2 중립 포즈를 재구성한다. 눈 중심·몸통 중심·베레모 회전축·배율을 측정한다. V1 파일은 보존한다.
  - 검증: 같은 캔버스에서 원본·재구성·알파 경계를 보고, 격리 `DOAN_RUNTIME`으로 `go run ./cli/cmd/doan check --repo . --json` 실행. 레이어 합성·최대 홉 잘림 확인이 선행 PoC이다.
- [ ] C. 같은 캔버스 V2 구역의 실제 모션 초안을 사용자에게 확인받는다(초안 제작 완료). 기존 시간 모델을 쓰되 여섯 갈래 변형을 없애고 새 레이어 좌표를 적용한다. 정지 스토리보드도 유지한다. 사용자에게 실제 V2 모션을 보여 확인받는다.
  - 검증: 호흡·깜빡임·시선·입력·반복 홉·reduced motion을 114/142.5px 슬롯에서 직접 확인하고 `go run ./cli/cmd/doan check --repo . --json` 실행. 커밋 경계: V2 모션 초안·좌표·출처.
- [ ] D. `/tdd`로 바뀌는 렌더 계약과 기존 모션·생명주기 회귀를 고정한다. 필요한 렌더 좌표 계산만 순수 함수로 분리한다. 변경 없는 시간 모델 테스트는 재사용한다.
  - 검증: `npm --prefix app test`에서 새 회귀가 구현 전 실패하는지 확인한다. 공유 스키마 단계는 변경이 없어 생략한다.
- [ ] E. `/implement`로 기존 Doany 렌더러에 V2 자산·좌표·변형을 적용한다. fallback·컨텍스트 손실·숨김·dispose 계약을 유지하고, V2 정지 원본으로 흰 배경 앱 아이콘을 만든다. DS 참조와 출처·fixture 생성 설명을 맞춘다.
  - 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run build`. 커밋 경계: V2 앱 적용·회귀 검증.
- [ ] F. `/design-sync`로 V2 초안과 앱을 비교하고 `/runtime-test`로 바뀐 동작을 짧게 확인한다. 임시 HOME/userData/SHELL/agent 설정/DOAN_RUNTIME을 사용한다. 정상·축소 창, 포인터·입력·클릭·Enter·Space·전송 및 거절, 정점 잘림, reduced motion, Welcome 뒤 숨김, 실패 fallback, StrictMode와 24회 Home 재방문을 포함한다.
  - 검증: `node .scratch/design-sync/doany-v2/measure.mjs`와 `npm --prefix app run package` 후 격리된 패키지 실행. 실제 장면·시간·프레임 증거를 남긴다. 전용 영구 e2e suite는 만들지 않는다.
- [ ] G. `/code-review` 후 필요한 수정만 하고 `/verify`로 통합 확인한다. 버그를 고쳤으면 `/postmortem`을 기록한다.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs`. CLI/가이드/check 변경이 없으므로 agent-eval은 범위에 넣지 않는다.
- [ ] H. 완료 결론을 PRODUCT(선택 외형·동작)와 ARCHITECTURE(V2 모션 기준·좌표·fixture 재현 경로)에 영어로 승격한다. DESIGN에 실측·미검증 범위를 갱신하고 이 `docs/features/doany-v2/`를 삭제한다. V2 에셋 README와 캔버스의 인계 설명은 남기고, 삭제되는 기능 문서를 가리키는 참조를 현행 문서로 바꾼다.
  - 검증: `go run ./cli/cmd/doan check --repo . --json`, 관련 문서 링크와 측정 기록 대조. 커밋 경계: 문서별 커밋으로 현행 규칙 승격.
