# canvas-selection-tools — spec

캔버스 선택과 도구 사이의 작은 규칙 세 가지를 한 번의 `/ship`으로 바꾼다.

1. 선택이 있는 상태에서 Select 도구를 떠나 Hand로 바꾸면 선택이 해제된다.
2. 선택이 있는 상태에서 picker(Add to conversation의 pick, PRODUCT §5 item 6)를 시작하면 선택이 해제된다.
3. 앵커 칩의 locate가 캔버스 대상을 강조하는 애니메이션(번쩍인 뒤 사라짐)은 유지하고, 테두리를 브랜드 accent 그라디언트로 바꾼다.

1과 2는 현재 PRODUCT 규칙("In Hand clicks neither select nor clear", "a pick and a chip's locate never change it", "Picking and locating change neither the selection, `doan active` nor the composer's text")을 바꾼다. 사용자가 이 변경을 승인했다.

## 사용자

- **사람**: Hand로 바꾸거나 picker를 켜면 남아 있던 선택 표시가 사라진다. 칩을 눌렀을 때 대상이 보라 그라디언트 테두리로 번쩍여서, 화면의 어떤 콘텐츠 위에서도 어디를 가리키는지 바로 보인다.
- **에이전트**: `doan active`가 사람이 Hand로 바꾸거나 pick을 시작한 뒤에는 선택을 돌려주지 않는다(`active` 응답 형태는 그대로). guide·skill·CLI 출력은 바뀌지 않는다.

## 문제 (관찰된 사실)

- Hand로 바꿔도 선택 표시(1px `--border-focus` 테두리와 치수 캡슐)가 보드에 남는다. Hand에서는 클릭이 선택도 해제도 하지 않아서(PRODUCT §5 item 4), 해제하려면 Select로 돌아가 Esc나 빈 곳 클릭을 해야 한다. `CanvasController.test.ts`의 'Esc in Hand turns Hand off before it clears the selection'이 Hand에서 선택이 남는 현재 동작을 고정하고 있다.
- pick을 시작해도 선택 표시가 남아, pick 대상의 hover 표시와 기존 선택 표시가 함께 보인다. 'a picked element ends picking … without touching the selection', 'Esc while picking cancels only the pick … and keeps the selection' 테스트가 현재 동작을 고정한다.
- locate 강조(`.mark.jump-highlight`, `app/src/renderer/styles.css`)는 2px `--border-focus`(neutral 12, 거의 검정)와 3px `rgba(0,0,0,.1)` 링이다. 어두운 캔버스(#050507)에서는 테두리가 거의 보이지 않는다(neutral 12 #000000 대 #050507 대비는 1.03:1로 계산되고, 바깥 링도 반투명 검정이다). 이 링은 Quick Open·frame drawer·deep link·`doan open`의 frame 강조와 같은 클래스다.

## 가정

- 요청이 참조로 든 "Home composer의 그라디언트 테두리"는 main에 없다. Home composer에는 그라디언트 테두리가 아니라 둥근 테두리를 따라 퍼지는 accent glow가 있다(`.home-composer .composer`의 box-shadow `0 0 24px 2px` accent 27 %, `0 0 64px 8px` accent 7 %; DESIGN.md 'Projects home' Atmosphere). 이 문서는 그 glow를 강도의 참조로, 테두리 자체는 새 그라디언트 선으로 해석한다.

## 완료 조건

1. Select에서 프레임이나 요소를 선택한 뒤 툴바 Hand, H 키 중 무엇으로 Hand로 바꾸든 선택 표시가 사라지고, 인스펙터 수집값이 비고, `doan active`가 선택 없음을 돌려준다. selection-lost 토스트는 나오지 않는다.
2. Space를 누른 채 끄는 임시 pan은 선택을 바꾸지 않는다. Space를 놓으면 선택 표시가 그대로 있다.
3. Space로 끄는 중에 H를 눌러 drag가 끝난 뒤 Hand가 적용되면, 그때 선택이 해제된다.
4. Hand에서 Select로 돌아가도(버튼, V, Esc) 이전 선택은 돌아오지 않는다.
5. 선택이 있는 상태에서 picker를 켜면, pick이 실제로 시작될 때(`pick()`이 true) 선택이 해제되고 `doan active`가 선택 없음을 돌려준다. pick을 시작할 수 없으면(캔버스가 보이지 않음 등) 선택은 그대로다.
6. pick이 칩을 넣고 끝나든, Esc·picker 다시 누르기·대화 전환 등으로 취소되든 선택은 돌아오지 않는다. pick이 끝나면 이전 도구(Select나 Hand)로 돌아가는 규칙은 그대로다.
7. 칩 locate는 선택, `doan active`, composer 텍스트를 계속 바꾸지 않는다.
8. Esc 순서(메뉴·팝오버 → `/` 목록 → pick 취소 → Hand를 Select로 → 선택 해제)는 그대로다. 선택이 있는 Select에서 첫 Esc가 선택을 해제하는 동작도 그대로다.
9. 대상이 강조될 때 테두리는 3px accent 그라디언트 선(`--affordance-accent` → `--indigo-600`, 135°)이고, 바깥에 1px `--surface-panel` 링과 accent glow가 있다. 1.2초 동안 보이고 앞 0.8초는 그대로, 뒤 0.4초에 사라진다. 점(point) 강조는 같은 선과 glow를 쓴 12px 원이다.
10. reduced motion에서는 사라지는 애니메이션 없이 1.2초 동안 보였다가 없어진다. reduced transparency에서는 glow가 빠지고 선과 링만 남는다. forced colors에서는 3px `Highlight` 단색 테두리로 보인다.
11. 밝은(#ffffff), 어두운(#050507), 보라(#5b21b6) 캔버스와 사진·그라디언트가 섞인 캔버스에서, 실제 앱 스크린샷으로 강조가 보이는지 확인하고 사람이 강도를 확인한다(tasks R2).
12. `ds/checks.test.ts` `violetAllowed`와 DESIGN.md 'Accent places'가 새 강조 selector를 포함하고, `accentPlaces` 검사가 green이다.

## 비목표

- Hand에서 클릭으로 선택하기, Hand의 hover 표시: 바꾸지 않는다.
- pick이 끝난 뒤 이전 선택 복원: 하지 않는다(결정 3).
- 선택 해제 뒤 Add to conversation의 비활성 이유 문구 변경: 기존 "선택 없음" 규칙을 그대로 따른다.
- 강조의 지속 시간·이동(Fit, 중앙 정렬) 규칙 변경: 그대로다.
- 다크 테마, 새 색 토큰 추가: 하지 않는다. 기존 palette·role 변수만 쓴다.
- `doan active` 응답 형태, app socket, 스키마 변경: 없다.

## 결정

1. **새 강조는 모든 jump 강조에 쓴다**: 칩 locate, frame drawer, Quick Open의 frame jump, deep link·`doan open`의 frame. 모두 `CanvasController.showJump`의 `.mark.jump-highlight` 하나라 CSS 한 곳만 바꾼다. 다른 캔버스를 여는 에이전트 reply 칩의 frame 대상도 deep link와 같은 `jump` 경로를 타므로 같은 모양이 된다.
2. **그라디언트는 `--affordance-accent`(violet 9, #973be1) → `--indigo-600`, 135°다.** 둘 다 흰 바탕(5.21:1, 6.46:1)과 #050507(3.91:1, 3.15:1)에서 비텍스트 3:1을 넘고, Welcome pigment horizon이 쓰는 브랜드 색 조합이다. 보라 캔버스(#5b21b6)에서는 둘 다 3:1 미만(1.72, 1.39)이라 바깥 흰 링(8.98:1)이 경계를 그린다. `--indigo-600`은 프로젝트 identity 색과 같은 색이다. 최종 강도(선 폭, glow 불투명도)는 tasks R2의 실제 앱 비교로 확정한다.
3. **pick이 끝나거나 취소돼도 선택을 되돌리지 않는다.** 해제가 한 방향이라 `doan active`가 pick 동안 한 번만 바뀌고, 복원할 선택이 reload·이동 중에 사라진 경우를 다룰 필요가 없다.
4. **Hand에서 frame drawer 행을 고르면 지금처럼 선택한다.** 규칙은 "Hand로 바꿀 때 해제"다. drawer는 사람이 그 frame을 고른 명시적 선택이고, drawer 규칙(PRODUCT §5 item 3)은 바꾸지 않는다.
5. **UI 초안(`/design-draft`)은 그리지 않는다.** 강조는 임의의 캔버스 콘텐츠 위 overlay라 초안으로는 실제 대비를 재현할 수 없다. 실제 앱 스크린샷 비교(tasks R2)로 사람이 강도를 확인한다.
