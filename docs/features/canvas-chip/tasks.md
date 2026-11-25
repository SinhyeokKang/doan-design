# 캔버스 칩 — tasks

순서: PoC → 드래프트 → 앵커 형식(순수 함수) → 판정 규칙(순수 함수) → 칩 필드와 끌기·놓기 → 메뉴와 보낸 칩 → 측정과 실기 확인 → 승격. `[commit]`은 커밋 경계다. 구현(T3 이후)은 comment-trim이 develop에 머지된 뒤 시작한다.

## T1. PoC

- design.md 'PoC'의 두 가지를 확인한다. 하나는 같은 창 안에서 사이드바 행 drag가 칩 필드 drop으로 되는지이고, 다른 하나는 이전 빌드가 캔버스 앵커를 읽을 때의 동작이다. probe는 `.scratch/canvas-chip/`에 둔다.
- 검증: 결과(스크린샷, 이전 빌드의 읽기 결과)가 `.scratch/`에 있고, design.md 'PoC 결과'에 적혀 있다. 이전 빌드가 대화 전체를 읽지 못하면 사용자에게 묻고 결정을 적는다. 실행 명령은 `node .scratch/canvas-chip/probe.mjs`다(일회성 probe).
- `[commit]` design.md

## T2. 드래프트

- `/design-draft canvas-chip`으로 design.md '드래프트 요청'의 프레임을 그린다. 사용자가 앱에서 확정한다.
- 검증: `doan check <드래프트 경로>`가 통과하고, `doan ls`의 프레임 id가 요청과 같다. 사용자가 확정한 모습과 문구가 design.md에 적혀 있다.
- `[commit]` 드래프트와 design.md

## T3. 앵커 형식

- `validAnchor`와 `turnPrompt`(`prompt.ts`), 이벤트 타입(`types.ts`)에 캔버스 앵커를 더한다.
- 검증: `npm --prefix app test`에서 다음이 먼저 실패(red)를 보이고 나서 통과한다.
  - 앵커 검증 표 테스트: 받는 path, 저장소 밖, `..`, 절대 경로, 대문자 `.HTML`, 잘못된 id
  - 프롬프트 직렬화 테스트
  - 32곳 한도에 캔버스 앵커 포함
- `npm --prefix app run typecheck`가 통과한다.
- `[commit]` `test:` → `feat:`

## T4. 판정 규칙

- `canvasChipTarget`, 끌기 데이터 읽기, Home 프로젝트 변경 변환, 붙여넣기 규칙, 보낸 칩 열기(design.md '판정 규칙').
- 검증: `npm --prefix app test`에서 각 표 테스트가 먼저 실패를 보이고 나서 통과한다. 경우는 다음과 같다.
  - 같은 root와 다른 root
  - Home의 프로젝트 일치와 불일치
  - 입력을 받지 않는 composer
  - 32곳 한도
  - id 없음, id 중복
  - 프로토타입 창
  - 형식이 틀린 끌기 데이터
  - 보낸 칩: 지금 캔버스, 없어짐, id 중복, 목록을 읽는 중
- `[commit]` `test:` → `feat:`

## T5. 칩 필드, 끌기·놓기, 메뉴, 보낸 칩

- 캔버스 칩 노드, 사이드바 행 drag, 칩 필드 drop, 행 메뉴의 "Add to message", 보낸 말풍선의 칩과 열기, Home 프로젝트 변경 처리.
- 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`가 통과한다. 컴포넌트 테스트는 다음을 확인한다.
  - drop:
    - 놓은 자리에 칩이 들어가고, 포커스와 caret이 칩 뒤로 간다.
    - 파일 drop은 첨부가 된다.
    - 다른 root의 끌기는 받지 않는다.
  - 행 메뉴:
    - 화면마다 맞는 composer에 들어간다. 캔버스 패널이 접혀 있으면 펼친다.
    - 꺼진 이유가 tooltip과 접근성 설명으로 나온다.
    - Esc로 닫으면 포커스가 행으로 돌아간다.
  - 트리:
    - 행 클릭, 방향키, typeahead가 그대로다.
    - 끌기 시작이 행을 열지 않는다.
  - 칩:
    - 한 덩어리로 지워진다.
    - 복사·붙여넣기가 같은 root에서는 칩, 다른 곳에서는 이름이다.
    - 보낸 말풍선에서 복사해도 줄바꿈이 없다(postmortem 2026-11-22).
    - Look Up은 보이는 이름을 쓴다(postmortem 2026-11-08).
  - 보낸 칩: 열기, 지금 캔버스, 없어진 캔버스 문구, id 중복 토스트
  - Home: 프로젝트를 바꾸면 다른 root 칩이 이름이 된다.
  - 돌려받은 초안에 칩이 남는다.
- `[commit]` `test:` → `feat:`

## T6. 측정과 실기 확인

- `/design-sync`: 칩(composer, 말풍선), 끌기 표시, 메뉴를 드래프트와 computed style로 맞춘다. `docs/design/`의 칩 섹션에 측정값을 적는다.
  - 검증: 측정한 속성이 드래프트와 같거나, 다른 점이 'Documented differences'에 이유와 함께 적혀 있다.
- `/runtime-test`: 격리된 실제 앱에서 네이티브 마우스로 사이드바 행을 끌어 세 composer에 놓는다. 사이드바를 끄는 동작은 창이 앞에 있어야 하므로, 포커스를 가져간 단계를 보고에 적는다.
  - 항목:
    - 캔버스 패널(열린 캔버스와 다른 캔버스)
    - Overview
    - Home(같은 프로젝트와 다른 프로젝트)
    - 놓을 수 없는 곳
    - 파일 drop과 함께
    - 행 메뉴
    - 보낸 칩 열기
  - 가짜 provider로 보낸 메시지의 프롬프트에 캔버스 앵커가 들어가는지 확인한다.
  - 검증: 항목마다 드래프트와 같은 모습과 동작이 보이고, 스크린샷이 `.scratch/`에 있다. 확인하지 못한 항목은 T7에서 BACKLOG에 적는다.
- `/agent-eval`: 앱 대화의 프롬프트(앵커 직렬화)가 바뀐다. 그래서 캔버스 칩이 든 메시지를 받은 에이전트가 그 경로의 캔버스를 읽는지 확인하는 시나리오가 필요한지 판단하고, 필요하면 더한다.
  - 검증: 시나리오를 더했다면 `node eval/run.ts --self-test`가 통과하고, 회차 기록이 `docs/usability-eval/`에 있다. 더하지 않았다면 그 이유가 PR 본문에 있다.
- `[commit]` `docs(design): …`, 필요하면 `fix:`·`test:`, `docs(usability-eval): …`

## T7. 승격과 정리

- PRODUCT: spec '바뀌는 PRODUCT와 ARCHITECTURE 문장'을 새 규칙으로 바꾼다.
  - §5 item 6: 칩 종류에 캔버스를 더한다. Home과 Overview도 캔버스 칩을 받는다.
  - §5 item 1 'Canvas row menu': "Add to message"
- ARCHITECTURE §7: 캔버스 앵커 형식, `validAnchor`, 이벤트의 앵커, 칩 필드의 drop과 붙여넣기 규칙, 되돌림 비용(T1 결과)
- BACKLOG: T6에서 확인하지 못한 항목
- `docs/features/canvas-chip/`를 지운다.
- 검증: 두 문서에 새 규칙이 있고, "Home's and the Overview's composers take no chips"가 남아 있지 않다. 기능 디렉터리가 없다.
- `[commit]` 문서마다: `docs(PRODUCT): …`, `docs(ARCHITECTURE): …`, `docs(BACKLOG): …`, `docs(feature): remove canvas-chip after promotion`
