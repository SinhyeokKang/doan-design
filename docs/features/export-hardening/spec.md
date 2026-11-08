# export-hardening — spec

`docs/BACKLOG.md` 'Known defects'에 남은 `doan export` 결함 여섯 가지를 다룬다. 이번 회차는 그중 넷(경로 해석 속도, 큰 stylesheet의 메모리, `<base href>`, `<style>`이 든 SVG sprite)을 고치고, 둘(frame 안 로컬 문서와 JavaScript가 읽는 파일, custom property 사용처의 이름 매칭)은 비목표로 남긴다. 판단 근거는 'Non-goals'와 '결정'에 적는다.

## Users

- **사람**: 앱의 canvas row menu Export…와 toolbar Export로 캔버스를 내보낸다(PRODUCT §5 item 1 'Canvas row menu', item 2 'Toolbar'). 자산이 많은 캔버스가 앱의 export timeout(60 s, `app/src/main/cli.ts`) 안에 끝나고, `<base>`나 스타일이 든 sprite를 쓰는 캔버스가 조용히 틀린 파일로 나가지 않는다.
- **에이전트**: `doan export`와 `doan check`를 부른다(PRODUCT §5 item 12). 같은 결과를 더 빨리, 더 적은 메모리로 받고, 거절되면 이유가 한 줄로 온다. 응답 모양은 바뀌지 않는다.

## Problem

BACKLOG에 적힌 관찰이다(canvas-row-menu 작업, 2026-11-03).

1. **경로 해석 비용.** `repo.Resolve`는 on-disk spelling을 찾으려고(`diskSpelling`) 참조마다 경로의 디렉터리를 모두 읽는다. 그래서 `doan export`와 `doan check`의 비용이 참조 수 × 디렉터리 항목 수가 된다. 한 디렉터리에 자산 5,000개를 둔 캔버스의 export가 15.7 s 걸렸다. 앱의 export timeout이 60 s라 아직은 안에 들지만, 같은 디렉터리의 자산과 참조가 함께 두 배가 되면 비용은 약 4배가 된다.
2. **메모리.** 24 MiB CSS 하나를 쓰는 캔버스의 export가 최대 1.36 GB(입력의 약 55배)를 썼다. 프로파일은 하지 않았다. BACKLOG는 `rewriteCSS`의 복사와 data URI를 의심한다. 코드를 읽으면 `canvas.lex`가 문장부호 한 글자마다 token(약 40 B)을 slice에 쌓고, 한 stylesheet를 세 번(`CustomUses`, 수집용 `CSSRefs`, 다시 쓰기용 `CSSRefs`) lex하는 것도 후보다. 측정하지 않은 추정이다.
3. **`<base href>`.** export는 `<base>`를 보지 않고 캔버스 폴더에서 참조를 푼다. 앱(Chromium)은 `<base>`를 따르므로, `<base>`에 기대는 캔버스는 앱과 다른 파일이 들어간 결과나 거절을 받는다. serving scope 검사는 그대로라 scope 밖 파일이 새지는 않는다.
4. **SVG sprite 안 `<style>`.** `<use href="file.svg#id">`의 SVG 파일은 문서 안 숨긴 `<svg>`로 복사된다(ARCHITECTURE §3 'SVG `<use>`'). 그 파일에 `<style>`이 있으면 캔버스 전체에 적용되므로 export가 거절한다. 앱에서는 보이는 아이콘이 export만 막힌다.
5. **frame 안 로컬 문서, JavaScript가 읽는 파일.** `iframe`·`frame`·`object`·`embed`가 로컬 문서를 가리키면 export를 거절하고, 스크립트가 `import`·`fetch`로 읽는 파일은 빠진 채 나간다. 둘 다 PRODUCT §5 item 3 'Export and viewer'가 정한 현재 동작이다.
6. **custom property 사용처.** custom property 안 `url()`은 그 속성을 `var()`로 쓰는 stylesheet 기준으로 풀린다(ARCHITECTURE §3 'Custom property `url()`s resolve from their user'). export는 사용처를 이름으로만 찾으므로, 실제로는 그 요소에 걸리지 않는 규칙도 후보로 센다. 후보 파일이 둘 다 있으면 앱이 보여 주는 export를 거절한다. 또 Chromium은 한 페이지에서 같은 `url()` 글자의 첫 해석을 다음 사용처에도 쓰므로, 사용처가 두 폴더에 있으면 앱은 아무것도 안 보이는데 export는 파일을 보이는 경우가 있다.

## Done when

**경로 해석(1)**
- export 한 번, check 한 번이 같은 디렉터리를 한 번만 읽는다. 디렉터리 읽기 횟수를 세는 Go 테스트가 "참조 5,000개, 디렉터리 1개 → 읽기 1회"를 고정한다.
- 기존 `repo.Resolve` 테스트(대소문자·NFC/NFD alias, symlink와 그 대상 구별, 없는 경로와 I/O 오류 구별, lexical 검사 먼저)가 바뀐 해석 경로에서도 그대로 통과한다.
- 한 디렉터리 자산 5,000개 캔버스의 `doan export`가 2 s 안에 끝난다(측정값을 tasks에 기록한다; 목표치는 결정 Q7).

**메모리(2)**
- 프로파일(PoC)로 24 MiB CSS export의 할당 상위 원인을 측정해 design.md에 기록한다.
- 같은 입력의 최대 RSS가 입력의 10배 이하다(결정 Q5). 회귀 방지로, 생성한 큰 CSS를 export하는 Go 테스트가 할당 총량(`runtime.MemStats.TotalAlloc`)의 상한을 고정한다.
- 결과 HTML은 바이트 단위로 지금과 같다(기존 export 테스트와 새 비교 테스트).

**`<base href>`(3)** (결정 Q2)
- 캔버스의 첫 `<base href>`(`<template>` 밖)가 캔버스 폴더가 아닌 곳을 가리키면, 캔버스 문서 수준의 상대 참조 중 export가 포함하려던 것은 모두 새 이유로 거절되고 refusal 목록에 나온다. custom property의 사용처가 캔버스 자신인 경우도 포함한다.
- `<base href="./">`, 같은 폴더의 파일 이름(`<base href="x.html">`), `href` 없는 `<base target>`은 지금처럼 export된다. 절대 URL·`data:`·fragment 참조와 CSS 파일 안 참조는 영향이 없다.

**SVG sprite `<style>`(4)** — PoC 결과에 달렸다(결정 Q4)
- PoC가 Electron 45 Chromium과 WebKit 모두에서 범위를 좁힌 규칙이 sprite 복사본에만 적용되고 앱(외부 `<use>`)과 같은 computed style을 낸다고 보이면: 지원하는 규칙만 든 `<style>`의 sprite가 export되고, 그 규칙이 sprite 밖 캔버스 요소의 computed style을 바꾸지 않는다. 지원하지 않는 구성(`@import`, `@font-face`, `@keyframes` 등, design.md)이 있으면 지금처럼 거절한다.
- PoC가 실패하면 이 항목은 비목표로 옮기고, 거절은 그대로 두며, PoC 결과를 BACKLOG 해당 줄에 적는다.

**공통**
- `node .agents/skills/verify/scripts/verify.mjs`가 통과한다.
- CLI 응답 모양과 `export_refused` 줄 형식(`- <item>: <detail>`, detail에 `": "` 없음)은 바뀌지 않는다.
- 고친 항목은 BACKLOG에서 지우고, 남긴 항목은 그대로 둔다.

## Non-goals

- **frame 안 로컬 문서 포함, JavaScript가 읽는 파일 포함(5).** PRODUCT §5 item 3이 거절과 "JavaScript is not read"를 정해 두었다. 바꾸려면 PRODUCT 결정을 바꿔야 하고, 이 동작에 막힌 실제 캔버스는 아직 관찰되지 않았다. `fetch`는 실행해야 대상이 정해지므로 정적으로 따라갈 수 없다. frame 문서는 재귀 다시 쓰기(문서마다 sprite id, custom property 사용처, `srcdoc` 중첩)가 필요해 이 회차의 크기를 넘는다. 지금 동작은 거절이거나 알려진 한계라 조용히 틀린 결과가 나가지 않는다(결정 Q1).
- **custom property 사용처를 cascade로 가리기(6).** 실제로 걸리는 규칙을 고르려면 selector 매칭과 cascade를 다시 구현해야 하고, Chromium의 같은 `url()` 글자 재사용까지 맞추려면 페이지 안 평가 순서를 알아야 한다. CLI는 앱 없이 동작해야 하므로(PRODUCT §5 item 12) 렌더링에 맡길 수도 없다. 지금 동작은 모호하면 거절이라 serving scope 밖 파일이 새지 않는다(결정 Q3).
- `<base href>`를 따라 참조를 푸는 것(Q2 결정에 따라 거절만 한다), `doan check`에 `<base>` 규칙을 더하는 것.
- `doan check`의 결과 변경. 경로 해석 속도만 바뀐다.
- export timeout(60 s)과 50 MiB 상한 변경.
- 앱 UI 변경. 거절 토스트는 이유 글자를 그대로 보이므로 새 이유도 따로 손대지 않는다.

## 결정

사용자가 일곱 항목 모두 (a)로 정했다.

| # | 질문 | 결정 | 이유 | 반영한 곳 |
|---|---|---|---|---|
| Q1 | frame 안 로컬 문서와 JS `import`·`fetch` 파일을 이번에 다루나? | 비목표로 남긴다 | PRODUCT 결정을 바꾸는 일이고 관찰된 사례가 없으며, 지금 동작은 조용히 틀리지 않는다 | spec Non-goals, design 'Decision impact' |
| Q2 | `<base href>`를 어떻게 다루나? | 캔버스 폴더가 아닌 base에 기대는 참조를 `ReasonBase`로 거절한다. base를 따라 풀지 않고 check도 바꾸지 않는다 | 조용히 틀린 결과를 없애는 가장 작은 변경이고 check와 어긋나지 않는다 | spec Done when, design §3, tasks T6·T7 |
| Q3 | custom property 사용처 이름 매칭을 손대나? | 비목표 | 정확히 고치려면 cascade 구현이 필요하고 지금은 안전하게 거절한다 | spec Non-goals |
| Q4 | sprite `<style>`을 어떻게 하나? | PoC 뒤 selector 범위를 좁혀 포함하고, PoC가 실패하면 거절을 유지한다 | 앱에서 보이는 아이콘이 export만 막히는 차이를 PoC 근거로 줄인다 | spec Done when, design §4, tasks T2·T10·T11 |
| Q5 | 메모리 목표치는? | 최대 RSS ≤ 입력 × 10 | 결과 문자열 자체가 입력보다 크고 조립 단계 복사가 몇 번 남는다 | spec Done when, design §2, tasks T1·T8·T9 |
| Q6 | on-disk spelling 비용을 어떻게 줄이나? | 명령 한 번 동안 쓰는 `repo.Resolver`가 디렉터리 index를 cache한다. `repo.Resolve`는 wrapper로 남긴다 | 지금 판정 규칙(이름 동등 + filesystem identity)을 그대로 두고 비용만 줄인다 | design §1, tasks T3·T4 |
| Q7 | 경로 해석 속도 목표치는? | 한 디렉터리 자산 5,000개 export 2 s 이하 | 앱 timeout 60 s 대비 여유를 숫자로 확인할 수 있다 | spec Done when, tasks T5 |
